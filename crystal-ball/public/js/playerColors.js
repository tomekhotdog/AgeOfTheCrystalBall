// playerColors.js -- Deterministic player color generation.
// Pure functions, no THREE dependency.

/**
 * djb2 hash of a string to unsigned 32-bit integer.
 * @param {string} str
 * @returns {number}
 */
function djb2(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Convert HSL to CSS hex string.
 * @param {number} h  0-360
 * @param {number} s  0-100
 * @param {number} l  0-100
 * @returns {string} '#RRGGBB'
 */
function hslToHex(h, s, l) {
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

/**
 * Generate a deterministic CSS hex color from a user name.
 * HSL with hue spread, saturation 55-75%, lightness 45-60%.
 * @param {string} userName
 * @returns {string} e.g. '#A3B5C7'
 */
export function playerColorCSS(userName) {
  const h = djb2(userName);
  const hue = h % 360;
  const saturation = 55 + (h >>> 8) % 21;
  const lightness = 45 + (h >>> 16) % 16;
  return hslToHex(hue, saturation, lightness);
}

/**
 * Generate a deterministic numeric hex color from a user name.
 * @param {string} userName
 * @returns {number} e.g. 0xA3B5C7
 */
export function playerColorHex(userName) {
  return parseInt(playerColorCSS(userName).slice(1), 16);
}
