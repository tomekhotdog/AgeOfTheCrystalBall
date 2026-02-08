// server/relay/identity.js
// Auto-detect user identity from git config or hostname.

import { execFile } from 'node:child_process';
import { hostname } from 'node:os';

/**
 * Resolve user identity from CLI flags or auto-detection.
 * @param {{ userName?: string, userColor?: string }} flags
 * @returns {Promise<{ name: string, color: string }>}
 */
export async function resolveIdentity(flags = {}) {
  let name = flags.userName;
  if (!name) {
    name = await gitUserName().catch(() => null);
    if (!name) name = hostname();
  }

  let color = flags.userColor;
  if (!color) {
    color = colorFromName(name);
  }

  return { name, color };
}

/**
 * Get git config user.name.
 * @returns {Promise<string>}
 */
function gitUserName() {
  return new Promise((resolve, reject) => {
    execFile('git', ['config', 'user.name'], (err, stdout) => {
      if (err) return reject(err);
      const name = stdout.trim();
      if (!name) return reject(new Error('empty'));
      resolve(name);
    });
  });
}

/**
 * Generate a deterministic hex color from a name using djb2 hash.
 * HSL with hue spread, saturation 55-75%, lightness 45-60%.
 * @param {string} name
 * @returns {string} CSS hex color like '#AABBCC'
 */
export function colorFromName(name) {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const saturation = 55 + (hash >>> 8) % 21;   // 55-75
  const lightness = 45 + (hash >>> 16) % 16;   // 45-60
  return hslToHex(hue, saturation, lightness);
}

/**
 * Convert HSL to hex color string.
 * @param {number} h -- hue 0-360
 * @param {number} s -- saturation 0-100
 * @param {number} l -- lightness 0-100
 * @returns {string} '#RRGGBB'
 */
export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
