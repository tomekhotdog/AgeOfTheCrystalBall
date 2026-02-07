// edgeScroll.js — Pure function for AoE-style edge-scroll camera panning.

const EDGE_ZONE = 30; // pixels from viewport edge

export function computeEdgeScrollDir(cursorX, cursorY, viewportW, viewportH, edgeZone = EDGE_ZONE) {
  if (cursorX < 0 || cursorY < 0 || cursorX > viewportW || cursorY > viewportH) return null;

  let dx = 0, dz = 0;

  // Top edge — same as arrow-up (dx=-1, dz=-1)
  if (cursorY < edgeZone)                  { dx -= 1; dz -= 1; }
  // Bottom edge — same as arrow-down
  if (cursorY > viewportH - edgeZone)      { dx += 1; dz += 1; }
  // Left edge — same as arrow-left
  if (cursorX < edgeZone)                  { dx -= 1; dz += 1; }
  // Right edge — same as arrow-right
  if (cursorX > viewportW - edgeZone)      { dx += 1; dz -= 1; }

  if (dx === 0 && dz === 0) return null;
  return { dx, dz };
}
