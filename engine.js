// BLOOM AGAIN — prototype engine (pure, DOM-free).
// "Same geometry, N renderers, solidity = f(geometry, activeStyle)."
// Vignette: The Lantern Frame. Styles: charcoal + pixel. Vanilla, testable in Node.
// #LLM-generated

// ---- Scene constants (virtual units; portrait). Shared with the renderer. ----
export const W = 112, H = 170;
export const STYLES = ['charcoal', 'pixel'];
export const FIG_R = 3.4;
export const SPAWN = { x: 16, y: 36 };

// Authored shapes (geometry). Per-style meaning lives in getSolidSegments().
export const BLOCK = { x: 34, y: 40, w: 8, h: 16 };   // charcoal: solid+erasable · pixel: solid
export const GAP   = { x: 42, y: 52, w: 28, h: 48 };   // pixel tap-snap target (an erased hole in charcoal)
export const RAMP  = { x1: 42, y1: 57, x2: 70, y2: 97 }; // collision spawned by a snap (solid in both)
export const DOOR  = { x: 86, y: 80, w: 8, h: 17 };    // charcoal: passable outline · pixel: solid slab
export const GOAL  = { x: 98, y: 86, w: 9, h: 17 };    // the Figure must arrive here

// Static linework that is solid in every style.
const STATIC = [
  seg(10, 50, 42, 56),   // start ledge (tilts right so the Figure wants to roll)
  seg(10, 30, 10, 56),   // left wall
  seg(70, 96, 110, 103), // landing floor (tilts right toward the door/goal)
  seg(110, 80, 110, 103) // right wall (stops overshoot past the goal)
];

function seg(x1, y1, x2, y2) { return { x1, y1, x2, y2 }; }
function inRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }

// ---- State ----
export function createState() {
  return {
    style: 'charcoal',
    snapped: false,    // pixel tap-snap committed the gap into a ramp (persists across styles)
    erased: false,     // charcoal rub removed the inked block (persists across styles)
    rub: 0,            // accumulated rub distance over the block
    fig: { x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, r: FIG_R },
    won: false,
    destab: 0          // "the trip destabilises" — rises on rapid switching, decays over time
  };
}

export function resetFigure(s) {
  s.fig.x = SPAWN.x; s.fig.y = SPAWN.y; s.fig.vx = 0; s.fig.vy = 0;
}

// Solidity = f(geometry, activeStyle). Returns the segments the Figure collides with *now*.
export function getSolidSegments(s) {
  const segs = STATIC.slice();
  if (!s.erased) {                         // the inked block (both styles, until rubbed away)
    segs.push(seg(BLOCK.x, BLOCK.y, BLOCK.x, BLOCK.y + BLOCK.h));               // left face
    segs.push(seg(BLOCK.x, BLOCK.y, BLOCK.x + BLOCK.w, BLOCK.y));               // top face
    segs.push(seg(BLOCK.x + BLOCK.w, BLOCK.y, BLOCK.x + BLOCK.w, BLOCK.y + BLOCK.h)); // right face
  }
  if (s.snapped) segs.push(seg(RAMP.x1, RAMP.y1, RAMP.x2, RAMP.y2));            // quantized staircase
  if (s.style === 'pixel') segs.push(seg(DOOR.x + DOOR.w / 2, DOOR.y, DOOR.x + DOOR.w / 2, DOOR.y + DOOR.h)); // door slab
  return segs;
}

// ---- Player actions (the two gestures) ----
const RUB_THRESHOLD = 26; // total rub distance over the block to erase it

export function tapAt(s, x, y) {           // Pixel gesture: tap-to-snap
  if (s.style !== 'pixel' || s.snapped) return false;
  if (inRect(x, y, GAP)) { s.snapped = true; return true; }
  return false;
}

export function rubAt(s, x, y, dist) {     // Charcoal gesture: rub-to-erase
  if (s.style !== 'charcoal' || s.erased) return false;
  const pad = 3;
  const r = { x: BLOCK.x - pad, y: BLOCK.y - pad, w: BLOCK.w + 2 * pad, h: BLOCK.h + 2 * pad };
  if (!inRect(x, y, r)) return false;
  s.rub += dist;
  if (s.rub >= RUB_THRESHOLD) { s.erased = true; return true; }
  return false;
}

export function cycleStyle(s) {
  const i = STYLES.indexOf(s.style);
  s.style = STYLES[(i + 1) % STYLES.length];
  s.destab = Math.min(1, s.destab + 0.34); // soft, diegetic pressure — no hard fail
  return s.style;
}

// ---- Physics: a carried Figure (zero direct control). Circle vs. segments, substepped. ----
const G = 190, REST = 0.04, FRICTION = 0.99, MAX_SPEED = 90;

function resolveCircleSeg(f, sg) {
  const ex = sg.x2 - sg.x1, ey = sg.y2 - sg.y1;
  const len2 = ex * ex + ey * ey || 1e-6;
  let t = ((f.x - sg.x1) * ex + (f.y - sg.y1) * ey) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = sg.x1 + t * ex, cy = sg.y1 + t * ey;
  let dx = f.x - cx, dy = f.y - cy;
  let dist = Math.hypot(dx, dy);
  if (dist >= f.r) return;
  if (dist < 1e-5) { dx = 0; dy = -1; dist = 1e-5; }
  const nx = dx / dist, ny = dy / dist;
  f.x = cx + nx * f.r; f.y = cy + ny * f.r;          // push out
  const vn = f.vx * nx + f.vy * ny;
  if (vn < 0) { f.vx -= (1 + REST) * vn * nx; f.vy -= (1 + REST) * vn * ny; }
  // tangential friction (rolling loss)
  const tx = -ny, ty = nx;
  let vt = f.vx * tx + f.vy * ty;
  vt *= FRICTION;
  const vnNew = f.vx * nx + f.vy * ny;
  f.vx = vnNew * nx + vt * tx; f.vy = vnNew * ny + vt * ty;
}

export function stepPhysics(s, dt) {
  if (s.won) return;
  s.destab = Math.max(0, s.destab - dt * 0.5);
  const sub = 6, h = dt / sub;
  for (let i = 0; i < sub; i++) {
    const f = s.fig;
    f.vy += G * h;
    const sp = Math.hypot(f.vx, f.vy);
    if (sp > MAX_SPEED) { f.vx *= MAX_SPEED / sp; f.vy *= MAX_SPEED / sp; }
    f.x += f.vx * h; f.y += f.vy * h;
    const segs = getSolidSegments(s);
    for (const sg of segs) resolveCircleSeg(f, sg);
    if (f.y > H + 12 || f.x < 2) { resetFigure(s); break; } // fell into void — soft respawn, no penalty
  }
  if (inRect(s.fig.x, s.fig.y, GOAL)) s.won = true;
}

// ---- Headless helper for tests ----
export function simulate(seconds, s) {
  const dt = 1 / 60, steps = Math.round(seconds / dt);
  for (let i = 0; i < steps && !s.won; i++) stepPhysics(s, dt);
  return s;
}
