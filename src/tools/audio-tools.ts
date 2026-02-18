// === Audio Binding MCP Tools ===

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AudioBinding } from '../types.js';
import { broadcastToClients, getCurrentState, setAudioBindings } from '../server.js';

// ---------------------------------------------------------------------------
// In-memory audio binding registry
// ---------------------------------------------------------------------------

const activeBindings: AudioBinding[] = [];

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

export function registerAudioTools(server: McpServer): void {
  // --- audio_bind ---
  server.tool(
    'audio_bind',
    'Create a mapping from an audio analysis source to a shader parameter target. The browser will continuously update the target based on audio input.',
    {
      source: z.string().refine(
        (s) => ['bass', 'mid', 'high', 'energy', 'peak'].includes(s) || /^spectrum_\d{1,2}$/.test(s),
        { message: 'Must be bass, mid, high, energy, peak, or spectrum_0 through spectrum_15' }
      ).describe('Audio source: bass, mid, high, energy, peak, or spectrum_0..spectrum_15'),
      target: z.string()
        .describe('Shader uniform target, e.g. "u_param1", "u_intensity", "u_ext[0]"'),
      multiplier: z.number().default(1).describe('Scale factor applied to the source value'),
      offset: z.number().default(0).describe('Offset added after multiplication'),
      smoothing: z.number().min(0).max(1).default(0.8).describe('Temporal smoothing (0=none, 1=max)'),
    },
    async (args) => {
      const binding: AudioBinding = {
        source: args.source as AudioBinding['source'],
        target: args.target,
        multiplier: args.multiplier,
        offset: args.offset,
        smoothing: args.smoothing,
      };

      // Remove any existing binding for the same target
      const idx = activeBindings.findIndex((b) => b.target === args.target);
      if (idx >= 0) {
        activeBindings.splice(idx, 1);
      }
      activeBindings.push(binding);

      // Sync to server state and broadcast to browser
      setAudioBindings(activeBindings);
      broadcastToClients({ type: 'audio_bind', binding });

      return mcpText({
        status: 'bound',
        binding,
        totalBindings: activeBindings.length,
      });
    }
  );

  // --- audio_unbind ---
  server.tool(
    'audio_unbind',
    'Remove an audio-to-parameter binding by target name.',
    {
      target: z.string().describe('Target uniform to unbind, e.g. "u_param1"'),
    },
    async (args) => {
      const idx = activeBindings.findIndex((b) => b.target === args.target);
      if (idx < 0) {
        return mcpError(`No binding found for target "${args.target}"`);
      }

      activeBindings.splice(idx, 1);
      setAudioBindings(activeBindings);
      broadcastToClients({ type: 'audio_unbind', target: args.target });

      return mcpText({
        status: 'unbound',
        target: args.target,
        remainingBindings: activeBindings.length,
      });
    }
  );

  // --- audio_config ---
  server.tool(
    'audio_config',
    'Adjust audio analysis parameters on the browser runtime.',
    {
      smoothing: z.number().min(0).max(1).optional().describe('FFT temporal smoothing (0-1)'),
      peakDecay: z.number().min(0).optional().describe('Peak detector decay rate'),
      gainBoost: z.number().min(0).optional().describe('Input gain multiplier'),
    },
    async (args) => {
      const config: Record<string, number> = {};
      if (args.smoothing !== undefined) config.smoothing = args.smoothing;
      if (args.peakDecay !== undefined) config.peakDecay = args.peakDecay;
      if (args.gainBoost !== undefined) config.gainBoost = args.gainBoost;

      broadcastToClients({ type: 'audio_config', config });

      return mcpText({ status: 'configured', config });
    }
  );

  // --- audio_monitor ---
  server.tool(
    'audio_monitor',
    'Get current audio levels snapshot from the browser runtime. Returns bass, mid, high, energy, peak values and active bindings.',
    {},
    async () => {
      const state = getCurrentState();
      return mcpText({
        audioActive: state?.audioActive ?? false,
        audioMode: state?.audioMode ?? 'silent',
        levels: state
          ? {
              bass: (state.params as Record<string, number>).u_bass ?? 0,
              mid: (state.params as Record<string, number>).u_mid ?? 0,
              high: (state.params as Record<string, number>).u_high ?? 0,
              energy: (state.params as Record<string, number>).u_energy ?? 0,
              peak: (state.params as Record<string, number>).u_peak ?? 0,
            }
          : null,
        bindings: activeBindings,
      });
    }
  );
}
