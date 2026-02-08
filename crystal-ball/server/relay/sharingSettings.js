// server/relay/sharingSettings.js
// Persists sharing configuration to ~/.crystal-ball/sharing.json.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CRYSTAL_BALL_DIR = process.env.CRYSTAL_BALL_DIR || join(homedir(), '.crystal-ball');
const SETTINGS_PATH = join(CRYSTAL_BALL_DIR, 'sharing.json');

export class SharingSettings {
  constructor() {
    this._settings = SharingSettings.getDefaults();
    this._loaded = false;
  }

  /**
   * Load settings from disk. Returns defaults if file missing.
   * @returns {Promise<{ enabled: boolean, excludedGroups: string[] }>}
   */
  async load() {
    try {
      const raw = await readFile(SETTINGS_PATH, 'utf8');
      this._settings = { ...SharingSettings.getDefaults(), ...JSON.parse(raw) };
    } catch {
      this._settings = SharingSettings.getDefaults();
    }
    this._loaded = true;
    return this._settings;
  }

  /**
   * Save settings to disk.
   * @param {{ enabled?: boolean, excludedGroups?: string[] }} settings
   * @returns {Promise<void>}
   */
  async save(settings) {
    this._settings = { ...this._settings, ...settings };
    await mkdir(CRYSTAL_BALL_DIR, { recursive: true });
    await writeFile(SETTINGS_PATH, JSON.stringify(this._settings, null, 2));
  }

  /**
   * Get current settings (from memory).
   * @returns {{ enabled: boolean, excludedGroups: string[] }}
   */
  get() {
    return this._settings;
  }

  /**
   * Return default settings.
   * @returns {{ enabled: boolean, excludedGroups: string[] }}
   */
  static getDefaults() {
    return { enabled: false, excludedGroups: [] };
  }
}
