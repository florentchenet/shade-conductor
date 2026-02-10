// === Capture / Recording MCP Tools ===

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { broadcastToClients, getCurrentState } from '../server.js';
import { getPreset } from '../store/preset-store.js';

// ---------------------------------------------------------------------------
// Recording state
// ---------------------------------------------------------------------------

let isRecording = false;
let recordingStartedAt: number | null = null;
let recordingFormat: string | null = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mcpText(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function mcpError(message: string) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
    isError: true as const,
  };
}

// ---------------------------------------------------------------------------
// Register tools
// ---------------------------------------------------------------------------

export function registerCaptureTools(server: McpServer): void {
  // --- capture_screenshot ---
  server.tool(
    'capture_screenshot',
    'Capture the current frame as a PNG image. The browser will save it to the captures/ directory.',
    {},
    async () => {
      const state = getCurrentState();
      if (!state) {
        return mcpError('No browser client connected');
      }

      broadcastToClients({ type: 'capture_screenshot' });

      return mcpText({
        status: 'screenshot_requested',
        currentShader: state.currentShader,
        note: 'The browser will save the PNG to captures/',
      });
    }
  );

  // --- capture_start ---
  server.tool(
    'capture_start',
    'Start recording frames from the browser. Frames are saved to the captures/ directory.',
    {
      format: z.enum(['png', 'webm']).default('webm')
        .describe('Recording format: "png" for frame sequence, "webm" for video'),
    },
    async (args) => {
      if (isRecording) {
        return mcpError('Recording already in progress. Use capture_stop first.');
      }

      const state = getCurrentState();
      if (!state) {
        return mcpError('No browser client connected');
      }

      isRecording = true;
      recordingStartedAt = Date.now();
      recordingFormat = args.format;

      broadcastToClients({ type: 'capture_start', format: args.format });

      return mcpText({
        status: 'recording_started',
        format: args.format,
        currentShader: state.currentShader,
      });
    }
  );

  // --- capture_stop ---
  server.tool(
    'capture_stop',
    'Stop the current recording.',
    {},
    async () => {
      if (!isRecording) {
        return mcpError('No recording in progress');
      }

      const duration = recordingStartedAt ? (Date.now() - recordingStartedAt) / 1000 : 0;

      isRecording = false;
      broadcastToClients({ type: 'capture_stop' });

      const result = {
        status: 'recording_stopped',
        duration: Math.round(duration * 100) / 100,
        format: recordingFormat,
      };

      recordingStartedAt = null;
      recordingFormat = null;

      return mcpText(result);
    }
  );

  // --- capture_thumbnail ---
  server.tool(
    'capture_thumbnail',
    'Push a shader preset to the browser, wait for it to render for a specified duration, then capture a screenshot as a preview thumbnail.',
    {
      preset: z.string().describe('Name of the shader preset to render'),
      duration: z.number().min(0.5).max(30).default(2)
        .describe('How long to let the shader render before capturing (seconds)'),
    },
    async (args) => {
      const preset = await getPreset(args.preset);
      if (!preset) {
        return mcpError(`Preset "${args.preset}" not found`);
      }

      const state = getCurrentState();
      if (!state) {
        return mcpError('No browser client connected');
      }

      // Push shader
      broadcastToClients({ type: 'shader_push', code: preset.code, id: preset.id });

      // Wait for the render duration then capture
      await new Promise<void>((resolve) => setTimeout(resolve, args.duration * 1000));

      broadcastToClients({ type: 'capture_screenshot' });

      return mcpText({
        status: 'thumbnail_captured',
        preset: args.preset,
        renderDuration: args.duration,
        note: 'Screenshot saved to captures/',
      });
    }
  );
}
