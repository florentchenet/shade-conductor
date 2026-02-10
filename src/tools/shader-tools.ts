// === Shader CRUD MCP Tools ===

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ShaderPreset } from '../types.js';
import {
  savePreset,
  getPreset,
  deletePreset,
  listPresets,
} from '../store/preset-store.js';
import { broadcastToClients } from '../server.js';

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
// Validation response waiter
// ---------------------------------------------------------------------------

/** Pending validation callbacks keyed by shader id */
const validationCallbacks = new Map<
  string,
  { resolve: (result: { success: boolean; error?: string }) => void; timer: ReturnType<typeof setTimeout> }
>();

/**
 * Called by the server when a shader_validated message arrives from the browser.
 */
export function handleValidationResult(id: string, success: boolean, error?: string): void {
  const entry = validationCallbacks.get(id);
  if (entry) {
    clearTimeout(entry.timer);
    validationCallbacks.delete(id);
    entry.resolve({ success, error });
  }
}

/**
 * Request shader validation from the browser and wait for the result.
 */
function requestValidation(code: string, timeoutMs = 5000): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const id = randomUUID();
    const timer = setTimeout(() => {
      validationCallbacks.delete(id);
      resolve({ success: false, error: 'Validation timed out — no browser client connected or responsive' });
    }, timeoutMs);

    validationCallbacks.set(id, { resolve, timer });
    broadcastToClients({ type: 'shader_validate', code, id });
  });
}

// ---------------------------------------------------------------------------
// Register tools
// ---------------------------------------------------------------------------

export function registerShaderTools(server: McpServer): void {
  // --- shader_create ---
  server.tool(
    'shader_create',
    'Create a new shader preset. Provide GLSL fragment shader code (without uniform declarations — those are injected automatically). Optionally push to the browser immediately.',
    {
      name: z.string().describe('Unique name for the shader preset'),
      description: z.string().default('').describe('Human-readable description'),
      code: z.string().describe('GLSL fragment shader code (main function body). Do NOT include uniform declarations.'),
      code_webgl2: z.string().optional().describe('Optional WebGL2 version of the shader'),
      tags: z.array(z.string()).default([]).describe('Tags for categorization'),
      params: z.object({
        param1: z.string().optional(),
        param2: z.string().optional(),
        param3: z.string().optional(),
        param4: z.string().optional(),
      }).default({}).describe('Human-readable names for u_param1-4'),
      push: z.boolean().default(false).describe('If true, immediately push shader to the browser'),
    },
    async (args) => {
      try {
        const now = new Date().toISOString();
        const preset: ShaderPreset = {
          id: randomUUID(),
          name: args.name,
          description: args.description,
          code: args.code,
          code_webgl2: args.code_webgl2,
          tags: args.tags,
          params: args.params,
          created: now,
          modified: now,
        };

        await savePreset(preset);

        if (args.push) {
          broadcastToClients({ type: 'shader_push', code: preset.code, id: preset.id });
        }

        return mcpText({ status: 'created', preset: { id: preset.id, name: preset.name, pushed: args.push } });
      } catch (err) {
        return mcpError(`Failed to create shader: ${(err as Error).message}`);
      }
    }
  );

  // --- shader_edit ---
  server.tool(
    'shader_edit',
    'Partially update an existing shader preset. Only provided fields are changed.',
    {
      name: z.string().describe('Name of the preset to edit'),
      code: z.string().optional().describe('New GLSL code'),
      code_webgl2: z.string().optional().describe('New WebGL2 GLSL code'),
      description: z.string().optional().describe('New description'),
      tags: z.array(z.string()).optional().describe('Replace tags'),
      params: z.object({
        param1: z.string().optional(),
        param2: z.string().optional(),
        param3: z.string().optional(),
        param4: z.string().optional(),
      }).optional().describe('Update param names'),
      push: z.boolean().default(false).describe('If true, push updated shader to browser'),
    },
    async (args) => {
      try {
        const existing = await getPreset(args.name);
        if (!existing) {
          return mcpError(`Preset "${args.name}" not found`);
        }

        if (args.code !== undefined) existing.code = args.code;
        if (args.code_webgl2 !== undefined) existing.code_webgl2 = args.code_webgl2;
        if (args.description !== undefined) existing.description = args.description;
        if (args.tags !== undefined) existing.tags = args.tags;
        if (args.params !== undefined) existing.params = { ...existing.params, ...args.params };
        existing.modified = new Date().toISOString();

        await savePreset(existing);

        if (args.push) {
          broadcastToClients({ type: 'shader_push', code: existing.code, id: existing.id });
        }

        return mcpText({ status: 'updated', preset: { id: existing.id, name: existing.name, pushed: args.push } });
      } catch (err) {
        return mcpError(`Failed to edit shader: ${(err as Error).message}`);
      }
    }
  );

  // --- shader_delete ---
  server.tool(
    'shader_delete',
    'Delete a shader preset by name.',
    {
      name: z.string().describe('Name of the preset to delete'),
    },
    async (args) => {
      const deleted = await deletePreset(args.name);
      if (deleted) {
        return mcpText({ status: 'deleted', name: args.name });
      }
      return mcpError(`Preset "${args.name}" not found`);
    }
  );

  // --- shader_list ---
  server.tool(
    'shader_list',
    'List all saved shader presets with optional filtering by tag or search term.',
    {
      tag: z.string().optional().describe('Filter by tag'),
      search: z.string().optional().describe('Search in name, description, and tags'),
    },
    async (args) => {
      const presets = await listPresets({ tag: args.tag, search: args.search });
      const summary = presets.map((p) => ({
        name: p.name,
        id: p.id,
        description: p.description,
        tags: p.tags,
        params: p.params,
        modified: p.modified,
      }));
      return mcpText({ count: summary.length, presets: summary });
    }
  );

  // --- shader_get ---
  server.tool(
    'shader_get',
    'Get the full shader preset including GLSL code.',
    {
      name: z.string().describe('Name of the preset to retrieve'),
    },
    async (args) => {
      const preset = await getPreset(args.name);
      if (!preset) {
        return mcpError(`Preset "${args.name}" not found`);
      }
      return mcpText(preset);
    }
  );

  // --- shader_validate ---
  server.tool(
    'shader_validate',
    'Send shader code to the browser for compilation testing. Returns success/failure with error details. Requires a connected browser client.',
    {
      code: z.string().describe('GLSL fragment shader code to validate'),
    },
    async (args) => {
      const result = await requestValidation(args.code);
      return mcpText({
        valid: result.success,
        error: result.error ?? null,
      });
    }
  );
}
