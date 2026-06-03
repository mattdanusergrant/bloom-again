// Headless solvability check for The Lantern Frame. Run: node web/engine.test.mjs
// Proves the data-driven puzzle is winnable with the intended composition, and
// that the "clean carried solution" guarantee (physics-only Figure) holds. #LLM-generated
import * as E from './engine.js';

let fails = 0;
const ok = (c, m) => { if (!c) { console.error('  ✗ ' + m); fails++; } else console.log('  ✓ ' + m); };
const gapMid = { x: E.GAP.x + E.GAP.w / 2, y: E.GAP.y + E.GAP.h / 2 };
const blockMid = { x: E.BLOCK.x + E.BLOCK.w / 2, y: E.BLOCK.y + E.BLOCK.h / 2 };

// 1) Intended solution: snap the gap (pixel) → switch charcoal → rub block away → carried home.
{
  const s = E.createState();
  E.simulate(1.0, s);                       // settle: rolls down ledge, rests on the inked block
  ok(!s.won && s.fig.x < E.GAP.x, 'Figure starts blocked by the inked block');

  E.cycleStyle(s);                          // charcoal -> pixel
  ok(s.style === 'pixel', 'swipe cycles to pixel');
  ok(E.tapAt(s, gapMid.x, gapMid.y) && s.snapped, 'tap-snap closes the gap into a ramp');

  E.cycleStyle(s);                          // pixel -> charcoal (door becomes a passable outline)
  ok(s.style === 'charcoal', 'swipe cycles back to charcoal');
  let erased = false;
  for (let i = 0; i < 40 && !erased; i++) erased = E.rubAt(s, blockMid.x, blockMid.y, 1);
  ok(s.erased, 'rub erases the inked block');

  E.simulate(8, s);
  ok(s.won, 'Figure is carried through the open door to the goal  ← PUZZLE SOLVABLE');
}

// 2) Negative: erase the block but never snap → the Figure falls into the void, no false win.
{
  const s = E.createState();
  for (let i = 0; i < 40; i++) E.rubAt(s, blockMid.x, blockMid.y, 1);
  E.simulate(8, s);
  ok(!s.won, 'erasing without snapping does NOT win (gap is a fatal hole)');
}

// 3) Negative: end in pixel (door is a solid slab) → blocked at the door, no win.
{
  const s = E.createState();
  E.cycleStyle(s); E.tapAt(s, gapMid.x, gapMid.y);   // pixel + snap
  E.cycleStyle(s);                                    // charcoal to erase
  for (let i = 0; i < 40; i++) E.rubAt(s, blockMid.x, blockMid.y, 1);
  E.cycleStyle(s);                                    // back to pixel: door slab solid again
  E.simulate(8, s);
  ok(!s.won && s.fig.x < E.DOOR.x + E.DOOR.w, 'pixel door slab blocks the Figure (must end in charcoal)');
}

console.log(fails ? `\nFAILED (${fails})` : '\nALL PASS');
process.exit(fails ? 1 : 0);
