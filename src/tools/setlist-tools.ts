// === Setlist Management MCP Tools ===

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Setlist, SetlistChapter } from '../types.js';
import {
  saveSetlist,
  getSetlist,
  deleteSetlist,
  listSetlists,
} from '../store/preset-store.js';
import { getPreset } from '../store/preset-store.js';
import {
  broadcastToClients,
  setSetlistPlayback,
  setCurrentShaderId,
  getServerState,
} from '../server.js';

// ---------------------------------------------------------------------------
// Setlist playback engine state
// ---------------------------------------------------------------------------

let activeSetlist: Setlist | null = null;
let playbackTimer: ReturnType<typeof setTimeout> | null = null;
let playbackStartedAt: number | null = null;
let currentChapterIndex = 0;
let isPaused = false;
let pauseOffset = 0; // ms offset when paused

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
 * Push a chapter to the browser runtime.
 */
async function pushChapter(chapter: SetlistChapter, index: number, total: number): Promise<void> {
  // Load the shader preset
  const preset = await getPreset(chapter.shader);
  if (!preset) {
    console.error(`[setlist] shader preset "${chapter.shader}" not found for chapter "${chapter.name}"`);
    return;
  }

  // Choose transition type
  if (chapter.transition_in === 'crossfade') {
    broadcastToClients({
      type: 'shader_crossfade',
      code: preset.code,
      id: preset.id,
      duration: chapter.transition_duration,
    });
  } else if (chapter.transition_in === 'flash') {
    broadcastToClients({ type: 'perform_flash', duration: chapter.transition_duration });
    // Brief delay then push
    setTimeout(() => {
      broadcastToClients({ type: 'shader_push', code: preset.code, id: preset.id });
    }, (chapter.transition_duration * 1000) / 2);
  } else {
    // Hard cut
    broadcastToClients({ type: 'shader_push', code: preset.code, id: preset.id });
  }

  setCurrentShaderId(preset.id);

  // Apply chapter params
  if (chapter.params) {
    for (const [name, value] of Object.entries(chapter.params)) {
      broadcastToClients({ type: 'param_set', name, value });
    }
  }

  // Apply palette
  if (chapter.palette) {
    broadcastToClients({
      type: 'palette_set',
      colors: {
        color1: [...chapter.palette.color1],
        color2: [...chapter.palette.color2],
        color3: [...chapter.palette.color3],
        bg: [...chapter.palette.bg],
      },
    });
  }

  // Apply audio bindings
  if (chapter.audio_bindings) {
    for (const binding of chapter.audio_bindings) {
      broadcastToClients({ type: 'audio_bind', binding });
    }
  }

  // Apply automations
  if (chapter.automations && chapter.automations.length > 0) {
    broadcastToClients({ type: 'automation', automations: chapter.automations });
  }

  // Send chapter info
  broadcastToClients({
    type: 'chapter_info',
    chapter: { name: chapter.name, index, total },
  });
}

/**
 * Schedule the next chapter transition.
 */
function scheduleNextChapter(): void {
  if (!activeSetlist || isPaused) return;

  const nextIndex = currentChapterIndex + 1;
  if (nextIndex >= activeSetlist.chapters.length) {
    // Setlist complete
    console.log('[setlist] playback complete');
    setSetlistPlayback({ active: false });
    return;
  }

  const currentChapter = activeSetlist.chapters[currentChapterIndex];
  const chapterDuration = (currentChapter.end_time - currentChapter.start_time) * 1000;
  const elapsed = pauseOffset;
  const remaining = Math.max(0, chapterDuration - elapsed);

  playbackTimer = setTimeout(async () => {
    currentChapterIndex = nextIndex;
    pauseOffset = 0;
    setSetlistPlayback({ chapterIndex: currentChapterIndex });
    await pushChapter(
      activeSetlist!.chapters[currentChapterIndex],
      currentChapterIndex,
      activeSetlist!.chapters.length
    );
    scheduleNextChapter();
  }, remaining);
}

/**
 * Stop any active playback timers.
 */
function clearPlayback(): void {
  if (playbackTimer) {
    clearTimeout(playbackTimer);
    playbackTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Zod schemas for chapter/setlist input
// ---------------------------------------------------------------------------

const automationSchema = z.object({
  target: z.string(),
  keyframes: z.array(
    z.object({
      time: z.number(),
      value: z.number(),
      easing: z.enum(['linear', 'ease-in', 'ease-out', 'ease-in-out']).default('linear'),
    })
  ),
});

const audioBindingSchema = z.object({
  source: z.enum(['bass', 'mid', 'high', 'energy', 'peak', 'spectrum']),
  target: z.string(),
  multiplier: z.number().default(1),
  offset: z.number().default(0),
  smoothing: z.number().min(0).max(1).default(0.8),
});

const paletteSchema = z.object({
  color1: z.tuple([z.number(), z.number(), z.number()]),
  color2: z.tuple([z.number(), z.number(), z.number()]),
  color3: z.tuple([z.number(), z.number(), z.number()]),
  bg: z.tuple([z.number(), z.number(), z.number()]),
});

const chapterSchema = z.object({
  name: z.string(),
  shader: z.string().describe('Name of the shader preset to use'),
  start_time: z.number().describe('Start time in seconds'),
  end_time: z.number().describe('End time in seconds'),
  transition_in: z.enum(['cut', 'crossfade', 'flash']).default('crossfade'),
  transition_duration: z.number().default(1),
  params: z.record(z.string(), z.number()).optional(),
  palette: paletteSchema.optional(),
  audio_bindings: z.array(audioBindingSchema).optional(),
  automations: z.array(automationSchema).optional(),
});

// ---------------------------------------------------------------------------
// Register tools
// ---------------------------------------------------------------------------

export function registerSetlistTools(server: McpServer): void {
  // --- setlist_create ---
  server.tool(
    'setlist_create',
    'Create a visual timeline (setlist) for a track. Define chapters with shader assignments, transitions, and automation.',
    {
      name: z.string().describe('Setlist name'),
      track_name: z.string().optional().describe('Associated track name'),
      track_duration: z.number().optional().describe('Total track duration in seconds'),
      chapters: z.array(chapterSchema).min(1).describe('Ordered list of chapters'),
    },
    async (args) => {
      try {
        const now = new Date().toISOString();
        const setlist: Setlist = {
          name: args.name,
          track_name: args.track_name,
          track_duration: args.track_duration,
          chapters: args.chapters as SetlistChapter[],
          created: now,
          modified: now,
        };

        await saveSetlist(setlist);
        return mcpText({
          status: 'created',
          name: setlist.name,
          chapters: setlist.chapters.length,
          duration: args.track_duration ?? null,
        });
      } catch (err) {
        return mcpError(`Failed to create setlist: ${(err as Error).message}`);
      }
    }
  );

  // --- setlist_load ---
  server.tool(
    'setlist_load',
    'Load a setlist and validate that all referenced shader presets exist.',
    {
      name: z.string().describe('Setlist name to load'),
    },
    async (args) => {
      const setlist = await getSetlist(args.name);
      if (!setlist) {
        return mcpError(`Setlist "${args.name}" not found`);
      }

      // Validate all shader references
      const missing: string[] = [];
      for (const chapter of setlist.chapters) {
        const preset = await getPreset(chapter.shader);
        if (!preset) {
          missing.push(chapter.shader);
        }
      }

      if (missing.length > 0) {
        return mcpError(`Missing shader presets: ${missing.join(', ')}`);
      }

      // Arm the setlist
      activeSetlist = setlist;
      currentChapterIndex = 0;
      isPaused = false;
      pauseOffset = 0;
      clearPlayback();

      setSetlistPlayback({
        active: false,
        setlistName: setlist.name,
        chapterIndex: 0,
        totalChapters: setlist.chapters.length,
        startedAt: null,
      });

      return mcpText({
        status: 'loaded',
        name: setlist.name,
        chapters: setlist.chapters.map((c, i) => ({
          index: i,
          name: c.name,
          shader: c.shader,
          start: c.start_time,
          end: c.end_time,
          transition: c.transition_in,
        })),
      });
    }
  );

  // --- setlist_play ---
  server.tool(
    'setlist_play',
    'Start playing the loaded setlist from the current position.',
    {},
    async () => {
      if (!activeSetlist) {
        return mcpError('No setlist loaded. Use setlist_load first.');
      }

      isPaused = false;
      playbackStartedAt = Date.now();

      setSetlistPlayback({
        active: true,
        startedAt: playbackStartedAt,
      });

      // Push current chapter
      await pushChapter(
        activeSetlist.chapters[currentChapterIndex],
        currentChapterIndex,
        activeSetlist.chapters.length
      );

      // Schedule next transitions
      scheduleNextChapter();

      return mcpText({
        status: 'playing',
        setlist: activeSetlist.name,
        chapter: activeSetlist.chapters[currentChapterIndex].name,
        index: currentChapterIndex,
      });
    }
  );

  // --- setlist_pause ---
  server.tool(
    'setlist_pause',
    'Pause setlist advancement. Shader keeps running but no chapter transitions occur.',
    {},
    async () => {
      if (!activeSetlist) {
        return mcpError('No setlist loaded');
      }

      if (isPaused) {
        return mcpText({ status: 'already_paused' });
      }

      isPaused = true;
      clearPlayback();

      // Calculate how much of the current chapter has elapsed
      if (playbackStartedAt) {
        pauseOffset += Date.now() - playbackStartedAt;
      }

      setSetlistPlayback({ active: false });

      return mcpText({
        status: 'paused',
        chapter: activeSetlist.chapters[currentChapterIndex].name,
        index: currentChapterIndex,
      });
    }
  );

  // --- setlist_jump ---
  server.tool(
    'setlist_jump',
    'Jump to a specific chapter by index, name, or time position.',
    {
      index: z.number().optional().describe('Chapter index (0-based)'),
      name: z.string().optional().describe('Chapter name to jump to'),
      time: z.number().optional().describe('Time position in seconds — jumps to the chapter active at that time'),
    },
    async (args) => {
      if (!activeSetlist) {
        return mcpError('No setlist loaded');
      }

      let targetIndex: number | null = null;

      if (args.index !== undefined) {
        if (args.index < 0 || args.index >= activeSetlist.chapters.length) {
          return mcpError(`Chapter index ${args.index} out of range (0-${activeSetlist.chapters.length - 1})`);
        }
        targetIndex = args.index;
      } else if (args.name) {
        targetIndex = activeSetlist.chapters.findIndex(
          (c) => c.name.toLowerCase() === args.name!.toLowerCase()
        );
        if (targetIndex < 0) {
          return mcpError(`Chapter "${args.name}" not found`);
        }
      } else if (args.time !== undefined) {
        targetIndex = activeSetlist.chapters.findIndex(
          (c) => args.time! >= c.start_time && args.time! < c.end_time
        );
        if (targetIndex === null || targetIndex < 0) {
          return mcpError(`No chapter found at time ${args.time}s`);
        }
      } else {
        return mcpError('Provide one of: index, name, or time');
      }

      clearPlayback();
      currentChapterIndex = targetIndex;
      pauseOffset = 0;

      setSetlistPlayback({ chapterIndex: currentChapterIndex });

      await pushChapter(
        activeSetlist.chapters[currentChapterIndex],
        currentChapterIndex,
        activeSetlist.chapters.length
      );

      if (!isPaused) {
        playbackStartedAt = Date.now();
        scheduleNextChapter();
      }

      return mcpText({
        status: 'jumped',
        chapter: activeSetlist.chapters[currentChapterIndex].name,
        index: currentChapterIndex,
      });
    }
  );

  // --- setlist_status ---
  server.tool(
    'setlist_status',
    'Get current setlist playback state.',
    {},
    async () => {
      const serverState = getServerState();
      return mcpText({
        loaded: activeSetlist?.name ?? null,
        playing: !isPaused && activeSetlist !== null && serverState.setlistPlayback.active,
        paused: isPaused,
        chapterIndex: currentChapterIndex,
        totalChapters: activeSetlist?.chapters.length ?? 0,
        currentChapter: activeSetlist?.chapters[currentChapterIndex]?.name ?? null,
        chapters: activeSetlist?.chapters.map((c, i) => ({
          index: i,
          name: c.name,
          shader: c.shader,
          start: c.start_time,
          end: c.end_time,
          active: i === currentChapterIndex,
        })) ?? [],
      });
    }
  );

  // --- setlist_list ---
  server.tool(
    'setlist_list',
    'List all saved setlists.',
    {},
    async () => {
      const setlists = await listSetlists();
      const summary = setlists.map((s) => ({
        name: s.name,
        track: s.track_name ?? null,
        chapters: s.chapters.length,
        duration: s.track_duration ?? null,
        modified: s.modified,
      }));
      return mcpText({ count: summary.length, setlists: summary });
    }
  );

  // --- setlist_delete ---
  server.tool(
    'setlist_delete',
    'Delete a saved setlist by name.',
    {
      name: z.string().describe('Name of the setlist to delete'),
    },
    async (args) => {
      // If we're deleting the active setlist, stop playback
      if (activeSetlist?.name === args.name) {
        clearPlayback();
        activeSetlist = null;
        isPaused = false;
        setSetlistPlayback({
          active: false,
          setlistName: null,
          chapterIndex: 0,
          totalChapters: 0,
          startedAt: null,
        });
      }

      const deleted = await deleteSetlist(args.name);
      if (deleted) {
        return mcpText({ status: 'deleted', name: args.name });
      }
      return mcpError(`Setlist "${args.name}" not found`);
    }
  );
}
