// === shade-conductor server ===
// Express HTTP + WebSocket bridge between MCP tools and browser runtime

import express from 'express';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  WSMessageToClient,
  WSMessageFromClient,
  RuntimeState,
  AudioBinding,
  PaletteConfig,
} from './types.js';
import { handleValidationResult } from './tools/shader-tools.js';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** 16 float channels for u_ext[0..15] */
const extChannels: number[] = new Array(16).fill(0);

/** 4 XY channels for u_ext_xy[0..3] */
const extXY: Array<{ x: number; y: number }> = Array.from({ length: 4 }, () => ({ x: 0, y: 0 }));

/** Beats per minute — forwarded to browser as u_bpm */
let bpm = 120;

/** Audio bindings active on the runtime */
let audioBindings: AudioBinding[] = [];

/** Current shader ID loaded in the browser */
let currentShaderId: string | null = null;

/** Current shader code loaded in the browser */
let currentShaderCode: string | null = null;

/** Current palette state (server-side tracking for partial updates) */
let currentPalette: PaletteConfig = {
  color1: [0, 0, 0],
  color2: [0, 0, 0],
  color3: [0, 0, 0],
  bg: [0, 0, 0],
};

/** Most recent RuntimeState reported by the browser client */
let lastRuntimeState: RuntimeState | null = null;

/** Setlist playback state */
interface SetlistPlayback {
  active: boolean;
  setlistName: string | null;
  chapterIndex: number;
  totalChapters: number;
  startedAt: number | null;
}

const setlistPlayback: SetlistPlayback = {
  active: false,
  setlistName: null,
  chapterIndex: 0,
  totalChapters: 0,
  startedAt: null,
};

// ---------------------------------------------------------------------------
// WebSocket client tracking
// ---------------------------------------------------------------------------

const clients = new Set<WebSocket>();

let wss: WebSocketServer | null = null;
let httpServer: Server | null = null;

// ---------------------------------------------------------------------------
// Broadcast
// ---------------------------------------------------------------------------

/**
 * Send a message to every connected browser client.
 */
export function broadcastToClients(message: WSMessageToClient): void {
  const payload = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

// ---------------------------------------------------------------------------
// External input helpers
// ---------------------------------------------------------------------------

/**
 * Set a single float external input channel (0-15) and broadcast to clients.
 */
export function setExternalInput(channel: number, value: number): void {
  if (channel < 0 || channel > 15) {
    throw new RangeError(`External input channel must be 0-15, got ${channel}`);
  }
  extChannels[channel] = value;
  broadcastToClients({ type: 'ext_set', channel, value });
}

/**
 * Set an XY external input channel (0-3) and broadcast to clients.
 */
export function setExternalXY(channel: number, x: number, y: number): void {
  if (channel < 0 || channel > 3) {
    throw new RangeError(`External XY channel must be 0-3, got ${channel}`);
  }
  extXY[channel] = { x, y };
  broadcastToClients({ type: 'ext_xy_set', channel, x, y });
}

/**
 * Set BPM and broadcast to clients.
 */
export function setBpm(value: number): void {
  if (value <= 0 || value > 999) {
    throw new RangeError(`BPM must be between 1 and 999, got ${value}`);
  }
  bpm = value;
  broadcastToClients({ type: 'bpm_set', bpm: value });
}

// ---------------------------------------------------------------------------
// State accessors
// ---------------------------------------------------------------------------

/**
 * Return the last RuntimeState reported by the browser, or null.
 */
export function getCurrentState(): RuntimeState | null {
  return lastRuntimeState;
}

/**
 * Return the full server-side state snapshot.
 */
export function getServerState(): {
  extChannels: number[];
  extXY: Array<{ x: number; y: number }>;
  bpm: number;
  audioBindings: AudioBinding[];
  currentShaderId: string | null;
  setlistPlayback: SetlistPlayback;
  connectedClients: number;
  lastRuntimeState: RuntimeState | null;
} {
  return {
    extChannels: [...extChannels],
    extXY: extXY.map((xy) => ({ ...xy })),
    bpm,
    audioBindings: [...audioBindings],
    currentShaderId,
    setlistPlayback: { ...setlistPlayback },
    connectedClients: clients.size,
    lastRuntimeState,
  };
}

/**
 * Update setlist playback state (called by MCP tools).
 */
export function setSetlistPlayback(update: Partial<SetlistPlayback>): void {
  Object.assign(setlistPlayback, update);
}

/**
 * Update tracked current shader ID (called by MCP tools).
 */
export function setCurrentShaderId(id: string): void {
  currentShaderId = id;
}

/**
 * Update tracked current shader code (called by MCP tools).
 */
export function setCurrentShaderCode(code: string): void {
  currentShaderCode = code;
}

/**
 * Return the current shader code, or null if none has been pushed.
 */
export function getCurrentShaderCode(): string | null {
  return currentShaderCode;
}

/**
 * Return the current palette state (for partial-update merging).
 */
export function getCurrentPalette(): PaletteConfig {
  return { ...currentPalette, color1: [...currentPalette.color1], color2: [...currentPalette.color2], color3: [...currentPalette.color3], bg: [...currentPalette.bg] } as PaletteConfig;
}

/**
 * Update the tracked palette state (called by MCP tools after broadcasting).
 */
export function setCurrentPalette(palette: PaletteConfig): void {
  currentPalette = {
    color1: [...palette.color1],
    color2: [...palette.color2],
    color3: [...palette.color3],
    bg: [...palette.bg],
  };
}

/**
 * Update tracked audio bindings (called by MCP tools).
 */
export function setAudioBindings(bindings: AudioBinding[]): void {
  audioBindings = [...bindings];
}

// ---------------------------------------------------------------------------
// WebSocket server setup
// ---------------------------------------------------------------------------

function setupWebSocketServer(wsPort: number): WebSocketServer {
  const server = new WebSocketServer({ port: wsPort });

  server.on('connection', (ws, req) => {
    const addr = req.socket.remoteAddress ?? 'unknown';
    console.log(`[ws] client connected from ${addr}  (total: ${clients.size + 1})`);
    clients.add(ws);

    // Send current state to newly connected client so it syncs up
    sendSyncToClient(ws);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WSMessageFromClient;
        handleClientMessage(ws, msg);
      } catch (err) {
        console.error('[ws] failed to parse message:', err);
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[ws] client disconnected  (remaining: ${clients.size})`);
    });

    ws.on('error', (err) => {
      console.error('[ws] client error:', err.message);
      clients.delete(ws);
    });
  });

  server.on('error', (err) => {
    console.error('[ws] server error:', err);
  });

  return server;
}

/**
 * Send sync payload to a single client on connect so it picks up current state.
 */
function sendSyncToClient(ws: WebSocket): void {
  // Push all ext channels
  for (let i = 0; i < 16; i++) {
    if (extChannels[i] !== 0) {
      ws.send(JSON.stringify({ type: 'ext_set', channel: i, value: extChannels[i] }));
    }
  }

  // Push all XY channels
  for (let i = 0; i < 4; i++) {
    if (extXY[i].x !== 0 || extXY[i].y !== 0) {
      ws.send(JSON.stringify({ type: 'ext_xy_set', channel: i, x: extXY[i].x, y: extXY[i].y }));
    }
  }

  // Push BPM
  ws.send(JSON.stringify({ type: 'bpm_set', bpm }));

  // Push current shader if one is loaded
  if (currentShaderCode && currentShaderId) {
    ws.send(JSON.stringify({ type: 'shader_push', code: currentShaderCode, id: currentShaderId }));
  }

  // Push current palette
  ws.send(JSON.stringify({ type: 'palette_set', colors: getCurrentPalette() }));

  // Request fresh state from client
  ws.send(JSON.stringify({ type: 'get_state' }));
}

/**
 * Handle an incoming message from a browser client.
 */
function handleClientMessage(_ws: WebSocket, msg: WSMessageFromClient): void {
  switch (msg.type) {
    case 'state':
      lastRuntimeState = msg.data;
      if (msg.data.currentShader) {
        currentShaderId = msg.data.currentShader;
      }
      break;

    case 'shader_error':
      console.error(`[shader] error in ${msg.shaderId}: ${msg.error}`);
      break;

    case 'audio_levels':
      // Could forward to MCP or store — for now just update runtime
      break;

    case 'capture_complete':
      console.log(`[capture] saved: ${msg.filename} (${msg.size} bytes)`);
      break;

    case 'shader_validated':
      if (msg.success) {
        console.log(`[shader] validated OK: ${msg.id}`);
      } else {
        console.error(`[shader] validation failed for ${msg.id}: ${msg.error}`);
      }
      handleValidationResult(msg.id, msg.success, msg.error);
      break;

    case 'ready':
      console.log('[ws] client reports ready');
      break;

    default:
      console.warn('[ws] unhandled message type:', (msg as { type: string }).type);
  }
}

// ---------------------------------------------------------------------------
// Express app setup
// ---------------------------------------------------------------------------

function createApp(): express.Application {
  const app = express();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.resolve(__dirname, '..', 'public');

  app.use(express.json());

  // --- Page routes ---

  app.get('/output', (_req, res) => {
    res.sendFile(path.join(publicDir, 'output.html'));
  });

  app.get('/library', (_req, res) => {
    res.sendFile(path.join(publicDir, 'library.html'));
  });

  // --- REST API: External Inputs ---

  /** GET /api/input — return all external input values */
  app.get('/api/input', (_req, res) => {
    res.json({
      channels: extChannels,
      xy: extXY,
      bpm,
    });
  });

  /** POST /api/input/batch — set multiple channels at once */
  app.post('/api/input/batch', (req, res) => {
    const { channels } = req.body as {
      channels?: Record<string, number | [number, number]>;
    };

    if (!channels || typeof channels !== 'object') {
      res.status(400).json({ error: 'Body must contain a "channels" object' });
      return;
    }

    const results: Record<string, string> = {};

    for (const [key, val] of Object.entries(channels)) {
      try {
        // XY channel: "xy_0" through "xy_3"
        const xyMatch = key.match(/^xy_(\d+)$/);
        if (xyMatch) {
          const ch = parseInt(xyMatch[1], 10);
          if (Array.isArray(val) && val.length === 2) {
            setExternalXY(ch, val[0], val[1]);
            results[key] = 'ok';
          } else {
            results[key] = 'error: XY channels require [x, y] array';
          }
          continue;
        }

        // Float channel: "0" through "15"
        const ch = parseInt(key, 10);
        if (!isNaN(ch) && typeof val === 'number') {
          setExternalInput(ch, val);
          results[key] = 'ok';
        } else {
          results[key] = 'error: invalid channel or value';
        }
      } catch (err) {
        results[key] = `error: ${(err as Error).message}`;
      }
    }

    res.json({ results });
  });

  /** POST /api/input/:channel — set a single channel */
  app.post('/api/input/:channel', (req, res) => {
    const channelParam = req.params.channel;

    // XY channel: "xy_0" through "xy_3"
    const xyMatch = channelParam.match(/^xy_(\d+)$/);
    if (xyMatch) {
      const ch = parseInt(xyMatch[1], 10);
      const { x, y } = req.body as { x?: number; y?: number };
      if (typeof x !== 'number' || typeof y !== 'number') {
        res.status(400).json({ error: 'XY channels require { x: number, y: number }' });
        return;
      }
      try {
        setExternalXY(ch, x, y);
        res.json({ channel: channelParam, x, y });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
      return;
    }

    // Float channel
    const ch = parseInt(channelParam, 10);
    if (isNaN(ch)) {
      res.status(400).json({ error: `Invalid channel: ${channelParam}` });
      return;
    }

    const { value } = req.body as { value?: number };
    if (typeof value !== 'number') {
      res.status(400).json({ error: 'Body must contain { value: number }' });
      return;
    }

    try {
      setExternalInput(ch, value);
      res.json({ channel: ch, value });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  // --- REST API: Server state ---

  app.get('/api/state', (_req, res) => {
    res.json(getServerState());
  });

  // --- Static files (served last so API routes take priority) ---

  app.use(express.static(publicDir));

  return app;
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the HTTP and WebSocket servers.
 */
export async function startServer(port = 3333, wsPort = 3334): Promise<void> {
  const app = createApp();
  httpServer = createServer(app);

  await new Promise<void>((resolve, reject) => {
    httpServer!.listen(port, () => resolve());
    httpServer!.on('error', reject);
  });

  wss = setupWebSocketServer(wsPort);

  console.log(`[shade-conductor] HTTP  server listening on http://localhost:${port}`);
  console.log(`[shade-conductor] WS    server listening on ws://localhost:${wsPort}`);
  console.log(`[shade-conductor] UI    → http://localhost:${port}/`);
  console.log(`[shade-conductor] Output→ http://localhost:${port}/output`);
}

/**
 * Gracefully stop servers.
 */
export async function stopServer(): Promise<void> {
  // Close all WebSocket connections
  for (const ws of clients) {
    ws.close(1000, 'server shutting down');
  }
  clients.clear();

  // Close WebSocket server
  if (wss) {
    await new Promise<void>((resolve) => {
      wss!.close(() => resolve());
    });
    wss = null;
  }

  // Close HTTP server
  if (httpServer) {
    await new Promise<void>((resolve, reject) => {
      httpServer!.close((err) => (err ? reject(err) : resolve()));
    });
    httpServer = null;
  }

  console.log('[shade-conductor] servers stopped');
}

// ---------------------------------------------------------------------------
// Run directly
// ---------------------------------------------------------------------------

const isMain = process.argv[1] &&
  fileURLToPath(import.meta.url).endsWith(process.argv[1].replace(/\.js$/, '.ts'));

if (isMain || process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch((err) => {
    console.error('[shade-conductor] failed to start:', err);
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[shade-conductor] shutting down...');
    stopServer().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
