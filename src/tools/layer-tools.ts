// === Shader Layer Management MCP Tools ===

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { LayerState } from '../types.js';
import { broadcastToClients, getCurrentState } from '../server.js';

// ---------------------------------------------------------------------------
// In-memory layer stack (server-side tracking)
// ---------------------------------------------------------------------------

const layerStack: Map<number, LayerState> = new Map();

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

export function registerLayerTools(server: McpServer): void {
  // --- layer_push ---
  server.tool(
    'layer_push',
    'Add an overlay shader layer with a blend mode. Layers composite on top of the base shader.',
    {
      layer: z.number().int().min(1).max(8).describe('Layer index (1-8, higher = on top)'),
      code: z.string().describe('GLSL fragment shader code for this layer'),
      blend: z.enum(['add', 'multiply', 'screen', 'overlay', 'difference'])
        .default('add')
        .describe('Blend mode for compositing'),
      opacity: z.number().min(0).max(1).default(1).describe('Layer opacity (0-1)'),
    },
    async (args) => {
      const state: LayerState = {
        layer: args.layer,
        shader: `layer-${args.layer}-${Date.now()}`,
        blend: args.blend,
        opacity: args.opacity,
      };

      layerStack.set(args.layer, state);
      broadcastToClients({
        type: 'layer_push',
        layer: args.layer,
        code: args.code,
        blend: args.blend,
        opacity: args.opacity,
      });

      return mcpText({
        status: 'layer_added',
        layer: args.layer,
        blend: args.blend,
        opacity: args.opacity,
        totalLayers: layerStack.size,
      });
    }
  );

  // --- layer_remove ---
  server.tool(
    'layer_remove',
    'Remove a shader layer by index.',
    {
      layer: z.number().int().min(1).max(8).describe('Layer index to remove'),
    },
    async (args) => {
      const existed = layerStack.has(args.layer);
      layerStack.delete(args.layer);
      broadcastToClients({ type: 'layer_remove', layer: args.layer });

      return mcpText({
        status: existed ? 'removed' : 'not_found',
        layer: args.layer,
        totalLayers: layerStack.size,
      });
    }
  );

  // --- layer_opacity ---
  server.tool(
    'layer_opacity',
    'Set the opacity of a shader layer.',
    {
      layer: z.number().int().min(1).max(8).describe('Layer index'),
      opacity: z.number().min(0).max(1).describe('Opacity value (0=transparent, 1=opaque)'),
    },
    async (args) => {
      const state = layerStack.get(args.layer);
      if (!state) {
        return mcpError(`Layer ${args.layer} not found`);
      }

      state.opacity = args.opacity;
      broadcastToClients({
        type: 'layer_opacity',
        layer: args.layer,
        opacity: args.opacity,
      });

      return mcpText({
        status: 'opacity_set',
        layer: args.layer,
        opacity: args.opacity,
      });
    }
  );

  // --- layer_list ---
  server.tool(
    'layer_list',
    'Return the current layer stack showing all active layers, their blend modes and opacities.',
    {},
    async () => {
      const runtimeState = getCurrentState();

      // Prefer runtime state if available, fall back to server tracking
      const layers = runtimeState?.layers ?? Array.from(layerStack.values());

      // Sort by layer index
      const sorted = [...layers].sort((a, b) => a.layer - b.layer);

      return mcpText({
        layerCount: sorted.length,
        layers: sorted.map((l) => ({
          layer: l.layer,
          shader: l.shader,
          blend: l.blend,
          opacity: l.opacity,
        })),
      });
    }
  );
}
