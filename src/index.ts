// === shade-conductor MCP Server ===
// Main entry point: starts the MCP server on stdio AND the Express/WebSocket server

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { startServer, stopServer, broadcastToClients } from './server.js';
import { startOscBridge, stopOscBridge } from './osc/osc-bridge.js';
import { handleValidationResult } from './tools/shader-tools.js';

// Resource content
import { UNIFORM_DOCS } from './resources/uniforms.js';
import { GLSL_LIBRARY } from './resources/glsl-library.js';
import { EXAMPLE_PRESETS } from './resources/examples.js';

// Tool registrations
import { registerShaderTools } from './tools/shader-tools.js';
import { registerPerformTools } from './tools/perform-tools.js';
import { registerAudioTools } from './tools/audio-tools.js';
import { registerSetlistTools } from './tools/setlist-tools.js';
import { registerInputTools } from './tools/input-tools.js';
import { registerLayerTools } from './tools/layer-tools.js';
import { registerSceneTools } from './tools/scene-tools.js';
import { registerCaptureTools } from './tools/capture-tools.js';

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: 'shade-conductor',
  version: '1.0.0',
});

// ---------------------------------------------------------------------------
// Register all tools
// ---------------------------------------------------------------------------

registerShaderTools(server);
registerPerformTools(server);
registerAudioTools(server);
registerSetlistTools(server);
registerInputTools(server);
registerLayerTools(server);
registerSceneTools(server);
registerCaptureTools(server);

// ---------------------------------------------------------------------------
// Register MCP Resources
// ---------------------------------------------------------------------------

server.resource(
  'uniforms',
  'shader://uniforms',
  {
    description:
      'Complete uniform reference documentation for shade-conductor shaders. All available uniforms with types, ranges, and usage examples.',
    mimeType: 'text/plain',
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: UNIFORM_DOCS,
        mimeType: 'text/plain',
      },
    ],
  })
);

server.resource(
  'glsl-library',
  'shader://glsl-library',
  {
    description:
      'GLSL utility function library: noise, SDF primitives, SDF operations, raymarching, color utilities, coordinate transforms, and effects. Copy-paste into shaders.',
    mimeType: 'text/plain',
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: GLSL_LIBRARY,
        mimeType: 'text/plain',
      },
    ],
  })
);

server.resource(
  'examples',
  'shader://examples',
  {
    description:
      'Ten production-quality example shader presets. Styles include rings, fractals, tunnels, synthwave, organic flow, raymarching, particles, glitch, metaballs, and sacred geometry.',
    mimeType: 'text/plain',
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        text: JSON.stringify(
          EXAMPLE_PRESETS.map((p) => ({
            name: p.name,
            description: p.description,
            tags: p.tags,
            params: p.params,
            code: p.code,
          })),
          null,
          2
        ),
        mimeType: 'application/json',
      },
    ],
  })
);

// ---------------------------------------------------------------------------
// Start everything
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Redirect console output to stderr so it doesn't interfere with MCP stdio
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = (...args: unknown[]) => originalError('[info]', ...args);
  console.warn = (...args: unknown[]) => originalError('[warn]', ...args);
  // console.error stays on stderr already

  try {
    // Read ports from environment (single source of truth)
    const httpPort = parseInt(process.env.HTTP_PORT || '3333', 10);
    const wsPort = parseInt(process.env.WS_PORT || '3334', 10);
    const oscPort = parseInt(process.env.OSC_PORT || '9000', 10);

    // Start the Express + WebSocket server (non-fatal — MCP works without it)
    try {
      await startServer(httpPort, wsPort);
    } catch (err) {
      console.error('[http] failed to start Express/WS server:', err);
    }

    // Start the OSC bridge
    try {
      startOscBridge(broadcastToClients, oscPort);
    } catch (err) {
      console.error('[osc] failed to start OSC bridge:', err);
    }

    // Connect MCP server to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.log('[mcp] shade-conductor MCP server running on stdio');
  } catch (err) {
    // Restore console for fatal errors
    console.log = originalLog;
    console.error('[shade-conductor] fatal error:', err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    console.error('\n[shade-conductor] shutting down...');
    stopOscBridge();
    await stopServer();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();

// Re-export validation handler so server.ts can call it
export { handleValidationResult };
