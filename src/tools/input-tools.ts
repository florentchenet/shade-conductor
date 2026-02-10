// === External Input Management MCP Tools ===

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InputChannelMap } from '../types.js';
import {
  setExternalInput,
  setExternalXY,
  setBpm,
  getServerState,
} from '../server.js';
import {
  startOscBridge,
  stopOscBridge,
  addOscMapping,
  getOscMappings,
  getOscPort,
} from '../osc/osc-bridge.js';
import { broadcastToClients } from '../server.js';

// ---------------------------------------------------------------------------
// Channel labels (in-memory)
// ---------------------------------------------------------------------------

const channelLabels: Map<number, InputChannelMap> = new Map();

// Initialize with default labels
for (let i = 0; i < 16; i++) {
  channelLabels.set(i, {
    channel: i,
    label: `ext_${i}`,
    range: [0, 1],
    description: '',
  });
}

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

export function registerInputTools(server: McpServer): void {
  // --- input_set ---
  server.tool(
    'input_set',
    'Set an external input channel value from MCP. Supports float channels 0-15, XY channels 0-3, and BPM.',
    {
      channel: z.number().int().min(0).max(15).describe('External input channel (0-15)'),
      value: z.number().describe('Value to set'),
    },
    async (args) => {
      try {
        setExternalInput(args.channel, args.value);
        const label = channelLabels.get(args.channel);
        return mcpText({
          status: 'set',
          channel: args.channel,
          label: label?.label ?? `ext_${args.channel}`,
          value: args.value,
        });
      } catch (err) {
        return mcpError(`Failed to set input: ${(err as Error).message}`);
      }
    }
  );

  // --- input_set_xy ---
  server.tool(
    'input_set_xy',
    'Set an XY external input channel (0-3).',
    {
      channel: z.number().int().min(0).max(3).describe('XY channel (0-3)'),
      x: z.number().describe('X value'),
      y: z.number().describe('Y value'),
    },
    async (args) => {
      try {
        setExternalXY(args.channel, args.x, args.y);
        return mcpText({
          status: 'set',
          channel: `xy_${args.channel}`,
          x: args.x,
          y: args.y,
        });
      } catch (err) {
        return mcpError(`Failed to set XY input: ${(err as Error).message}`);
      }
    }
  );

  // --- input_set_bpm ---
  server.tool(
    'input_set_bpm',
    'Set the BPM value.',
    {
      bpm: z.number().min(1).max(999).describe('Beats per minute'),
    },
    async (args) => {
      try {
        setBpm(args.bpm);
        return mcpText({ status: 'set', bpm: args.bpm });
      } catch (err) {
        return mcpError(`Failed to set BPM: ${(err as Error).message}`);
      }
    }
  );

  // --- input_map ---
  server.tool(
    'input_map',
    'Name an external input channel for readability. This label appears in monitoring output.',
    {
      channel: z.number().int().min(0).max(15).describe('Channel number (0-15)'),
      label: z.string().describe('Human-readable label for the channel'),
      description: z.string().default('').describe('Optional description of what this channel controls'),
      range: z.tuple([z.number(), z.number()]).default([0, 1]).describe('Expected value range [min, max]'),
    },
    async (args) => {
      channelLabels.set(args.channel, {
        channel: args.channel,
        label: args.label,
        range: args.range,
        description: args.description,
      });
      return mcpText({
        status: 'mapped',
        channel: args.channel,
        label: args.label,
        description: args.description,
        range: args.range,
      });
    }
  );

  // --- input_monitor ---
  server.tool(
    'input_monitor',
    'Return all external input channels with their labels, current values, and XY channels.',
    {},
    async () => {
      const state = getServerState();
      const channels = [];
      for (let i = 0; i < 16; i++) {
        const mapping = channelLabels.get(i);
        channels.push({
          channel: i,
          label: mapping?.label ?? `ext_${i}`,
          value: state.extChannels[i],
          range: mapping?.range ?? [0, 1],
          description: mapping?.description ?? '',
        });
      }

      const xyChannels = state.extXY.map((xy, i) => ({
        channel: i,
        x: xy.x,
        y: xy.y,
      }));

      return mcpText({
        channels,
        xy: xyChannels,
        bpm: state.bpm,
        oscPort: getOscPort(),
        customMappings: getOscMappings(),
      });
    }
  );

  // --- input_osc_config ---
  server.tool(
    'input_osc_config',
    'Configure the OSC listener. Change port, restart the bridge, or add custom address mappings.',
    {
      port: z.number().int().optional().describe('UDP port to listen on (restarts bridge)'),
      add_mapping: z
        .object({
          address: z.string().describe('OSC address pattern, e.g. "/custom/fader1"'),
          target: z.string().describe('Shader uniform target, e.g. "u_ext[5]" or "u_param1"'),
        })
        .optional()
        .describe('Add a custom OSC-to-uniform mapping'),
    },
    async (args) => {
      if (args.add_mapping) {
        addOscMapping(args.add_mapping.address, args.add_mapping.target);
      }

      if (args.port) {
        // Restart bridge on new port
        stopOscBridge();
        startOscBridge(broadcastToClients, args.port);
      }

      return mcpText({
        status: 'configured',
        port: getOscPort(),
        customMappings: getOscMappings(),
      });
    }
  );
}
