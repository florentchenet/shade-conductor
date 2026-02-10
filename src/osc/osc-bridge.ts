// === OSC Bridge ===
// Listens for OSC messages and forwards them to browser clients via WebSocket

import type { WSMessageToClient } from '../types.js';

// osc-js ships as a UMD bundle; use createRequire for reliable CJS interop
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

interface OscMessage {
  address: string;
  args: number[];
}

interface OscLike {
  on(event: string, callback: (msg: OscMessage) => void): void;
  open(options?: object): void;
  close(): void;
}

interface OscConstructor {
  new (options?: { plugin?: unknown; discardLateMessages?: boolean }): OscLike;
  DatagramPlugin: new (options?: { open?: { port?: number; host?: string } }) => unknown;
}

const OSC: OscConstructor = require('osc-js');

export type BroadcastFn = (message: WSMessageToClient) => void;

/** Custom OSC address mappings added at runtime */
interface CustomMapping {
  address: string;
  target: string;
}

/** Default host to bind the OSC listener to */
const OSC_DEFAULT_HOST = process.env.OSC_HOST ?? 'localhost';

let oscInstance: OscLike | null = null;
let currentPort: number | null = null;
let customMappings: CustomMapping[] = [];

/**
 * Start the OSC bridge listener.
 * Incoming OSC messages are mapped to shade-conductor uniform channels
 * and forwarded to all connected browser clients via the broadcast function.
 *
 * @param broadcastFn - Function to broadcast WSMessageToClient to all browser clients
 * @param port - UDP port to listen on (default 9000)
 */
export function startOscBridge(
  broadcastFn: BroadcastFn,
  port: number = 9000
): void {
  if (oscInstance) {
    console.warn('[osc] bridge already running, stopping previous instance');
    stopOscBridge();
  }

  const plugin = new OSC.DatagramPlugin({
    open: { port, host: OSC_DEFAULT_HOST },
  });
  const osc = new OSC({ plugin });

  // --- /shade/ext/0 through /shade/ext/15 → u_ext[0-15] ---
  for (let i = 0; i < 16; i++) {
    const channel = i;
    osc.on(`/shade/ext/${i}`, (message: { args: number[] }) => {
      const value = message.args[0] ?? 0;
      broadcastFn({ type: 'ext_set', channel, value });
    });
  }

  // --- /shade/xy/0 through /shade/xy/3 → u_ext_xy[0-3] ---
  for (let i = 0; i < 4; i++) {
    const channel = i;
    osc.on(`/shade/xy/${i}`, (message: { args: number[] }) => {
      const x = message.args[0] ?? 0;
      const y = message.args[1] ?? 0;
      broadcastFn({ type: 'ext_xy_set', channel, x, y });
    });
  }

  // --- /shade/bpm → u_bpm ---
  osc.on('/shade/bpm', (message: { args: number[] }) => {
    const bpm = message.args[0] ?? 120;
    broadcastFn({ type: 'bpm_set', bpm });
  });

  // --- /shade/param/1-4 → u_param1-4 ---
  for (let i = 1; i <= 4; i++) {
    const paramName = `u_param${i}`;
    osc.on(`/shade/param/${i}`, (message: { args: number[] }) => {
      const value = message.args[0] ?? 0;
      broadcastFn({ type: 'param_set', name: paramName, value });
    });
  }

  // --- /shade/intensity → u_intensity ---
  osc.on('/shade/intensity', (message: { args: number[] }) => {
    const value = message.args[0] ?? 1.0;
    broadcastFn({ type: 'param_set', name: 'u_intensity', value });
  });

  // --- /shade/speed → u_speed ---
  osc.on('/shade/speed', (message: { args: number[] }) => {
    const value = message.args[0] ?? 1.0;
    broadcastFn({ type: 'param_set', name: 'u_speed', value });
  });

  // --- /shade/palette/color1-3, bg → palette colors ---
  const paletteKeys = ['color1', 'color2', 'color3', 'bg'] as const;
  for (const key of paletteKeys) {
    osc.on(`/shade/palette/${key}`, (message: { args: number[] }) => {
      const r = message.args[0] ?? 0;
      const g = message.args[1] ?? 0;
      const b = message.args[2] ?? 0;
      // Build a palette update with only the changed color
      const colors: { color1: [number, number, number]; color2: [number, number, number]; color3: [number, number, number]; bg: [number, number, number] } = {
        color1: [0, 0, 0],
        color2: [0, 0, 0],
        color3: [0, 0, 0],
        bg: [0, 0, 0],
      };
      colors[key] = [r, g, b];
      broadcastFn({
        type: 'palette_set',
        colors,
      });
    });
  }

  // --- Wildcard handler for custom mappings ---
  osc.on('*', (message: { address: string; args: number[] }) => {
    for (const mapping of customMappings) {
      if (message.address === mapping.address) {
        const value = message.args[0] ?? 0;
        // Route to ext channel or param based on target
        const extMatch = mapping.target.match(/^u_ext\[(\d+)\]$/);
        if (extMatch) {
          const channel = parseInt(extMatch[1], 10);
          broadcastFn({ type: 'ext_set', channel, value });
          return;
        }
        // Otherwise treat as param
        broadcastFn({ type: 'param_set', name: mapping.target, value });
      }
    }
  });

  osc.open();
  oscInstance = osc;
  currentPort = port;
  console.log(`[osc] bridge listening on UDP port ${port}`);
}

/**
 * Stop the OSC bridge.
 */
export function stopOscBridge(): void {
  if (oscInstance) {
    oscInstance.close();
    oscInstance = null;
    currentPort = null;
    console.log('[osc] bridge stopped');
  }
}

/**
 * Add a custom OSC address mapping.
 */
export function addOscMapping(address: string, target: string): void {
  // Remove existing mapping for the same address
  customMappings = customMappings.filter((m) => m.address !== address);
  customMappings.push({ address, target });
}

/**
 * Get all custom OSC mappings.
 */
export function getOscMappings(): CustomMapping[] {
  return [...customMappings];
}

/**
 * Get the current OSC port (or null if not running).
 */
export function getOscPort(): number | null {
  return currentPort;
}
