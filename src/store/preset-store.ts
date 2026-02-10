// === Preset & Setlist file-based storage ===

import { mkdir, readFile, writeFile, unlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ShaderPreset, Setlist } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PRESETS_DIR = path.join(PROJECT_ROOT, 'presets');
const SETLISTS_DIR = path.join(PROJECT_ROOT, 'setlists');

// ---------------------------------------------------------------------------
// Ensure directories exist
// ---------------------------------------------------------------------------

async function ensureDirs(): Promise<void> {
  await mkdir(PRESETS_DIR, { recursive: true });
  await mkdir(SETLISTS_DIR, { recursive: true });
}

// Call once on module load
const dirsReady = ensureDirs();

/** Sanitize name for use as a filename (strip path separators, etc.) */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\-. ]/g, '_').trim();
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export async function savePreset(preset: ShaderPreset): Promise<void> {
  await dirsReady;
  const filePath = path.join(PRESETS_DIR, `${safeName(preset.name)}.json`);
  await writeFile(filePath, JSON.stringify(preset, null, 2), 'utf-8');
}

export async function getPreset(name: string): Promise<ShaderPreset | null> {
  await dirsReady;
  const filePath = path.join(PRESETS_DIR, `${safeName(name)}.json`);
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as ShaderPreset;
  } catch {
    return null;
  }
}

export async function deletePreset(name: string): Promise<boolean> {
  await dirsReady;
  const filePath = path.join(PRESETS_DIR, `${safeName(name)}.json`);
  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listPresets(filter?: {
  tag?: string;
  search?: string;
}): Promise<ShaderPreset[]> {
  await dirsReady;
  try {
    const files = await readdir(PRESETS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    const presets: ShaderPreset[] = [];
    for (const file of jsonFiles) {
      try {
        const raw = await readFile(path.join(PRESETS_DIR, file), 'utf-8');
        const preset = JSON.parse(raw) as ShaderPreset;
        presets.push(preset);
      } catch {
        // Skip malformed files
      }
    }

    let results = presets;

    if (filter?.tag) {
      const tag = filter.tag.toLowerCase();
      results = results.filter((p) =>
        p.tags.some((t) => t.toLowerCase() === tag)
      );
    }

    if (filter?.search) {
      const search = filter.search.toLowerCase();
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description.toLowerCase().includes(search) ||
          p.tags.some((t) => t.toLowerCase().includes(search))
      );
    }

    // Sort by modification date, newest first
    results.sort(
      (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
    );

    return results;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Setlists
// ---------------------------------------------------------------------------

export async function saveSetlist(setlist: Setlist): Promise<void> {
  await dirsReady;
  const filePath = path.join(SETLISTS_DIR, `${safeName(setlist.name)}.json`);
  await writeFile(filePath, JSON.stringify(setlist, null, 2), 'utf-8');
}

export async function getSetlist(name: string): Promise<Setlist | null> {
  await dirsReady;
  const filePath = path.join(SETLISTS_DIR, `${safeName(name)}.json`);
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as Setlist;
  } catch {
    return null;
  }
}

export async function deleteSetlist(name: string): Promise<boolean> {
  await dirsReady;
  const filePath = path.join(SETLISTS_DIR, `${safeName(name)}.json`);
  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listSetlists(): Promise<Setlist[]> {
  await dirsReady;
  try {
    const files = await readdir(SETLISTS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));

    const setlists: Setlist[] = [];
    for (const file of jsonFiles) {
      try {
        const raw = await readFile(path.join(SETLISTS_DIR, file), 'utf-8');
        const setlist = JSON.parse(raw) as Setlist;
        setlists.push(setlist);
      } catch {
        // Skip malformed files
      }
    }

    setlists.sort(
      (a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime()
    );

    return setlists;
  } catch {
    return [];
  }
}
