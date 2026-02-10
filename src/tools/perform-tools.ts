// === Live Performance MCP Tools ===

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { broadcastToClients, getCurrentState, getServerState, setCurrentShaderId, getCurrentPalette, setCurrentPalette } from '../server.js';
import { getPreset } from '../store/preset-store.js';

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

/**
 * Convert a hex color string (#RRGGBB or RRGGBB) to [r, g, b] in 0-1 range.
 */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`Invalid hex color: ${hex}`);
  }
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

// ---------------------------------------------------------------------------
// Register tools
// ---------------------------------------------------------------------------

export function registerPerformTools(server: McpServer): void {
  // --- perform_push ---
  server.tool(
    'perform_push',
    'Instantly switch to a shader (hard cut). Provide either a preset name or raw GLSL code.',
    {
      preset: z.string().optional().describe('Name of saved preset to push'),
      code: z.string().optional().describe('Raw GLSL code to push (used if preset not provided)'),
    },
    async (args) => {
      try {
        let code: string;
        let id: string;

        if (args.preset) {
          const preset = await getPreset(args.preset);
          if (!preset) {
            return mcpError(`Preset "${args.preset}" not found`);
          }
          code = preset.code;
          id = preset.id;
        } else if (args.code) {
          code = args.code;
          id = `inline-${Date.now()}`;
        } else {
          return mcpError('Provide either "preset" name or "code"');
        }

        broadcastToClients({ type: 'shader_push', code, id });
        setCurrentShaderId(id);
        return mcpText({ status: 'pushed', id });
      } catch (err) {
        return mcpError(`Push failed: ${(err as Error).message}`);
      }
    }
  );

  // --- perform_crossfade ---
  server.tool(
    'perform_crossfade',
    'Smooth crossfade transition to a new shader over a specified duration.',
    {
      preset: z.string().optional().describe('Name of saved preset'),
      code: z.string().optional().describe('Raw GLSL code (if no preset)'),
      duration: z.number().min(0.1).max(30).default(2).describe('Transition duration in seconds'),
    },
    async (args) => {
      try {
        let code: string;
        let id: string;

        if (args.preset) {
          const preset = await getPreset(args.preset);
          if (!preset) {
            return mcpError(`Preset "${args.preset}" not found`);
          }
          code = preset.code;
          id = preset.id;
        } else if (args.code) {
          code = args.code;
          id = `inline-${Date.now()}`;
        } else {
          return mcpError('Provide either "preset" name or "code"');
        }

        broadcastToClients({ type: 'shader_crossfade', code, id, duration: args.duration });
        setCurrentShaderId(id);
        return mcpText({ status: 'crossfading', id, duration: args.duration });
      } catch (err) {
        return mcpError(`Crossfade failed: ${(err as Error).message}`);
      }
    }
  );

  // --- perform_param ---
  server.tool(
    'perform_param',
    'Set a shader parameter value in real-time. Parameters: u_param1-4, u_intensity, u_speed.',
    {
      name: z.enum(['u_param1', 'u_param2', 'u_param3', 'u_param4', 'u_intensity', 'u_speed'])
        .describe('Uniform parameter name'),
      value: z.number().describe('Parameter value (typically 0-1 for params, any range for intensity/speed)'),
    },
    async (args) => {
      broadcastToClients({ type: 'param_set', name: args.name, value: args.value });
      return mcpText({ status: 'set', name: args.name, value: args.value });
    }
  );

  // --- perform_palette ---
  server.tool(
    'perform_palette',
    'Update the color palette. Accepts hex color strings (#RRGGBB). Only provided colors are updated.',
    {
      color1: z.string().optional().describe('Primary color hex, e.g. "#FF0000"'),
      color2: z.string().optional().describe('Secondary color hex'),
      color3: z.string().optional().describe('Accent color hex'),
      bg: z.string().optional().describe('Background color hex'),
    },
    async (args) => {
      try {
        // Merge with current palette — only overwrite colors that were explicitly provided
        const current = getCurrentPalette();
        const colors = {
          color1: args.color1 ? hexToRgb(args.color1) : current.color1,
          color2: args.color2 ? hexToRgb(args.color2) : current.color2,
          color3: args.color3 ? hexToRgb(args.color3) : current.color3,
          bg: args.bg ? hexToRgb(args.bg) : current.bg,
        };
        broadcastToClients({ type: 'palette_set', colors });
        setCurrentPalette(colors);
        return mcpText({ status: 'palette_updated', colors });
      } catch (err) {
        return mcpError(`Palette update failed: ${(err as Error).message}`);
      }
    }
  );

  // --- perform_blackout ---
  server.tool(
    'perform_blackout',
    'Fade to black. Sends a blackout command to the browser runtime.',
    {},
    async () => {
      broadcastToClients({ type: 'perform_blackout' });
      return mcpText({ status: 'blackout' });
    }
  );

  // --- perform_flash ---
  server.tool(
    'perform_flash',
    'Trigger a brief flash effect. Optionally specify color and duration.',
    {
      color: z.string().optional().describe('Flash color hex (default white)'),
      duration: z.number().min(0.01).max(5).optional().describe('Flash duration in seconds (default 0.1)'),
    },
    async (args) => {
      broadcastToClients({
        type: 'perform_flash',
        color: args.color,
        duration: args.duration,
      });
      return mcpText({ status: 'flash', color: args.color ?? '#FFFFFF', duration: args.duration ?? 0.1 });
    }
  );

  // --- perform_state ---
  server.tool(
    'perform_state',
    'Return the current runtime state including shader, FPS, audio, params, layers, and server-side info.',
    {},
    async () => {
      const runtimeState = getCurrentState();
      const serverState = getServerState();
      return mcpText({
        runtime: runtimeState,
        server: serverState,
      });
    }
  );
}
