// server/discovery/sidecar.js
// Reads and validates sidecar files for Mode 2 active context.
// Sidecar files live in a central directory (~/.crystal-ball/sessions/ by default),
// not in individual project dirs. Configurable via CRYSTAL_BALL_DIR env var.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const VALID_PHASES = [
  'planning', 'researching', 'coding', 'testing',
  'reviewing', 'idle',
];

export const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Resolve the sidecar directory path.
 * @returns {string}
 */
export function getSidecarDir() {
  return process.env.CRYSTAL_BALL_DIR || join(homedir(), '.crystal-ball', 'sessions');
}

/**
 * Validate a parsed sidecar object.
 * @param {object} raw - parsed JSON from sidecar file
 * @param {number} now - current timestamp ms
 * @returns {{ valid: boolean, context: object|null }}
 */
export function validateSidecar(raw, now) {
  if (!raw || typeof raw !== 'object') return { valid: false, context: null };
  if (!raw.task || typeof raw.task !== 'string') return { valid: false, context: null };
  if (!raw.phase || !VALID_PHASES.includes(raw.phase)) return { valid: false, context: null };
  if (!raw.updated_at) return { valid: false, context: null };

  const updatedMs = new Date(raw.updated_at).getTime();
  if (isNaN(updatedMs)) return { valid: false, context: null };

  const stale = (now - updatedMs) > STALE_THRESHOLD_MS;

  return {
    valid: true,
    context: {
      task: raw.task,
      phase: raw.phase,
      blocked: !!raw.blocked,
      detail: raw.detail || null,
      stale,
    },
  };
}

/**
 * Read and validate a single sidecar file by path.
 * @param {string} filePath - absolute path to sidecar JSON
 * @returns {Promise<{cwd: string, context: object}|null>}
 */
export async function readSidecarFile(filePath) {
  try {
    const raw = JSON.parse(await readFile(filePath, 'utf8'));
    const { valid, context } = validateSidecar(raw, Date.now());
    if (!valid) return null;
    return { cwd: raw.cwd || null, context };
  } catch {
    return null;
  }
}

/**
 * Scan the central sidecar directory and match entries to discovered sessions by cwd.
 * @param {Array<{pid: number, cwd: string}>} sessions - discovered sessions
 * @returns {Promise<Map<number, object>>} pid -> context
 */
export async function readAllSidecars(sessions) {
  const results = new Map();
  if (sessions.length === 0) return results;

  const dir = getSidecarDir();
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return results; // dir doesn't exist yet — no sidecars
  }

  const jsonFiles = files.filter(f => f.endsWith('.json') && !f.endsWith('.tmp'));
  if (jsonFiles.length === 0) return results;

  // Read all sidecar files in parallel
  const entries = await Promise.all(
    jsonFiles.map(f => readSidecarFile(join(dir, f)))
  );

  // Build cwd -> context map from sidecar files
  const cwdMap = new Map();
  for (const entry of entries) {
    if (entry && entry.cwd) {
      cwdMap.set(entry.cwd, entry.context);
    }
  }

  // Match discovered sessions by cwd
  for (const s of sessions) {
    const ctx = cwdMap.get(s.cwd);
    if (ctx) results.set(s.pid, ctx);
  }

  return results;
}

/**
 * Legacy: read sidecar from a session's cwd (for inline simulator sidecars).
 * Not used for real discovery — kept for compatibility.
 * @param {string} cwd
 * @returns {Promise<object|null>}
 */
export async function readSidecar(cwd) {
  // Try the central dir first (match by cwd)
  const dir = getSidecarDir();
  try {
    const files = await readdir(dir);
    for (const f of files) {
      if (!f.endsWith('.json') || f.endsWith('.tmp')) continue;
      const entry = await readSidecarFile(join(dir, f));
      if (entry && entry.cwd === cwd) return entry.context;
    }
  } catch {
    // dir doesn't exist
  }
  return null;
}
