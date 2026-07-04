import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import {
  createNudgeTween,
  createPoseTween,
  createScalarTween,
  createSpriteTween,
  headBobFraction,
  MOVE_TWEEN_MS,
  NUDGE_TWEEN_MS,
  retargetPoseTween,
  retargetScalarTween,
  retargetSpriteTween,
  sampleNudgeTween,
  samplePoseTween,
  sampleScalarTween,
  sampleSpriteTween,
  shortestAngleDelta,
  smoothstep,
  snapPoseTween,
  startNudgeTween,
  TURN_TWEEN_MS,
} from "@/src/render/raycast/tween.ts";
import type { NudgeSample, PoseSample, ScalarSample, SpritePoint } from "@/src/render/raycast/tween.ts";

const EAST = 0;
const SOUTH = Math.PI / 2;
const WEST = Math.PI;
const NORTH = -Math.PI / 2;

function sample(tween: ReturnType<typeof createPoseTween>, nowMs: number): PoseSample {
  const out: PoseSample = { x: 0, y: 0, angle: 0, progress: 0, moving: false, settled: false };
  samplePoseTween(tween, nowMs, out);
  return out;
}

function nudgeAt(nudge: ReturnType<typeof createNudgeTween>, nowMs: number): NudgeSample {
  const out: NudgeSample = { dx: 0, dy: 0, settled: false };
  sampleNudgeTween(nudge, nowMs, out);
  return out;
}

Deno.test("smoothstep clamps and eases through the midpoint", () => {
  assertEquals(smoothstep(-1), 0);
  assertEquals(smoothstep(0), 0);
  assertAlmostEquals(smoothstep(0.5), 0.5);
  assertEquals(smoothstep(1), 1);
  assertEquals(smoothstep(2), 1);
  assert(smoothstep(0.25) < 0.25, "eases in");
  assert(smoothstep(0.75) > 0.75, "eases out");
});

Deno.test("shortestAngleDelta takes the short way around", () => {
  assertAlmostEquals(shortestAngleDelta(EAST, SOUTH), Math.PI / 2);
  assertAlmostEquals(shortestAngleDelta(SOUTH, EAST), -Math.PI / 2);
  // West to north crosses the atan2 wrap; the short way is a quarter turn.
  assertAlmostEquals(shortestAngleDelta(WEST, NORTH), Math.PI / 2);
  assertAlmostEquals(shortestAngleDelta(NORTH, WEST), -Math.PI / 2);
  assertAlmostEquals(shortestAngleDelta(SOUTH, SOUTH), 0);
});

Deno.test("first retarget snaps straight to the pose", () => {
  const tween = createPoseTween();
  retargetPoseTween(tween, 1.5, 2.5, EAST, 1000);

  const now = sample(tween, 1000);
  assert(now.settled);
  assertEquals(now.x, 1.5);
  assertEquals(now.y, 2.5);
  assertEquals(now.angle, EAST);
});

Deno.test("a one-tile move animates over MOVE_TWEEN_MS and settles", () => {
  const tween = createPoseTween();
  snapPoseTween(tween, 1.5, 1.5, EAST);
  retargetPoseTween(tween, 2.5, 1.5, EAST, 0);

  const start = sample(tween, 0);
  assertEquals(start.x, 1.5);
  assert(!start.settled);

  const mid = sample(tween, MOVE_TWEEN_MS / 2);
  assertAlmostEquals(mid.x, 2.0);
  assert(!mid.settled);

  const done = sample(tween, MOVE_TWEEN_MS);
  assertEquals(done.x, 2.5);
  assert(done.settled);
});

Deno.test("a turn animates the angle over TURN_TWEEN_MS", () => {
  const tween = createPoseTween();
  snapPoseTween(tween, 1.5, 1.5, EAST);
  retargetPoseTween(tween, 1.5, 1.5, SOUTH, 0);

  const mid = sample(tween, TURN_TWEEN_MS / 2);
  assert(mid.angle > EAST && mid.angle < SOUTH, "angle passes between the facings");
  assertEquals(mid.x, 1.5);

  const done = sample(tween, TURN_TWEEN_MS);
  assertAlmostEquals(done.angle, SOUTH);
  assert(done.settled);
});

Deno.test("turning across the angle wrap never spins the long way", () => {
  const tween = createPoseTween();
  snapPoseTween(tween, 1.5, 1.5, WEST);
  retargetPoseTween(tween, 1.5, 1.5, NORTH, 0);

  const done = sample(tween, TURN_TWEEN_MS);
  assert(done.settled);
  // Continuous angle: west (pi) turned left by a quarter, not -pi/2 directly.
  assertAlmostEquals(done.angle, WEST + Math.PI / 2);
  assertAlmostEquals(Math.cos(done.angle), Math.cos(NORTH), 1e-9);
  assertAlmostEquals(Math.sin(done.angle), Math.sin(NORTH), 1e-9);
});

Deno.test("teleports farther than one tile snap instead of animating", () => {
  const tween = createPoseTween();
  snapPoseTween(tween, 1.5, 1.5, EAST);
  retargetPoseTween(tween, 9.5, 4.5, SOUTH, 0);

  const now = sample(tween, 0);
  assert(now.settled);
  assertEquals(now.x, 9.5);
  assertEquals(now.y, 4.5);
});

Deno.test("retargeting mid-tween continues from the interpolated pose", () => {
  const tween = createPoseTween();
  snapPoseTween(tween, 1.5, 1.5, EAST);
  retargetPoseTween(tween, 2.5, 1.5, EAST, 0);

  const midMs = MOVE_TWEEN_MS / 2;
  const before = sample(tween, midMs);
  retargetPoseTween(tween, 3.5, 1.5, EAST, midMs);
  const after = sample(tween, midMs);

  assertAlmostEquals(after.x, before.x);
  assert(!after.settled);

  const done = sample(tween, midMs + MOVE_TWEEN_MS);
  assertEquals(done.x, 3.5);
  assert(done.settled);
});

Deno.test("retargeting the same pose is a no-op", () => {
  const tween = createPoseTween();
  snapPoseTween(tween, 1.5, 1.5, EAST);
  retargetPoseTween(tween, 1.5, 1.5, EAST, 50);

  const now = sample(tween, 50);
  assert(now.settled);
  assertEquals(now.x, 1.5);
});

Deno.test("head-bob peaks mid-move and is zero at rest and during turns", () => {
  const tween = createPoseTween();
  snapPoseTween(tween, 1.5, 1.5, EAST);
  assertEquals(headBobFraction(sample(tween, 0)), 0);

  retargetPoseTween(tween, 2.5, 1.5, EAST, 0);
  const mid = headBobFraction(sample(tween, MOVE_TWEEN_MS / 2));
  assert(mid > 0, "bob rises mid-stride");
  assert(mid > headBobFraction(sample(tween, MOVE_TWEEN_MS / 8)), "peaks at the middle");
  assertEquals(headBobFraction(sample(tween, MOVE_TWEEN_MS)), 0);

  retargetPoseTween(tween, 2.5, 1.5, SOUTH, 1000);
  assertEquals(headBobFraction(sample(tween, 1000 + TURN_TWEEN_MS / 2)), 0);
});

function spriteAt(tween: ReturnType<typeof createSpriteTween>, nowMs: number): SpritePoint {
  const out: SpritePoint = { x: 0, y: 0, settled: false };
  sampleSpriteTween(tween, nowMs, out);
  return out;
}

Deno.test("sprite tween starts settled and animates a one-tile step", () => {
  const tween = createSpriteTween(4.5, 6.5);
  assert(spriteAt(tween, 0).settled);

  retargetSpriteTween(tween, 5.5, 6.5, 0);
  const mid = spriteAt(tween, MOVE_TWEEN_MS / 2);
  assertAlmostEquals(mid.x, 5.0);
  assertEquals(mid.y, 6.5);
  assert(!mid.settled);

  const done = spriteAt(tween, MOVE_TWEEN_MS);
  assertEquals(done.x, 5.5);
  assert(done.settled);
});

Deno.test("sprite tween can use a custom movement duration", () => {
  const durationMs = MOVE_TWEEN_MS + 90;
  const tween = createSpriteTween(4.5, 6.5);

  retargetSpriteTween(tween, 5.5, 6.5, 0, durationMs);

  const previousDefaultEnd = spriteAt(tween, MOVE_TWEEN_MS);
  assert(!previousDefaultEnd.settled);

  const done = spriteAt(tween, durationMs);
  assertEquals(done.x, 5.5);
  assert(done.settled);
});

Deno.test("sprite tween animates a two-tile lunge but snaps farther jumps", () => {
  const lunge = createSpriteTween(4.5, 6.5);
  retargetSpriteTween(lunge, 6.5, 6.5, 0);
  assert(!spriteAt(lunge, MOVE_TWEEN_MS / 2).settled, "two tiles animates");

  const teleport = createSpriteTween(4.5, 6.5);
  retargetSpriteTween(teleport, 9.5, 6.5, 0);
  const now = spriteAt(teleport, 0);
  assert(now.settled, "beyond two tiles snaps");
  assertEquals(now.x, 9.5);
});

Deno.test("sprite tween retargeted mid-step chains from the interpolated point", () => {
  const tween = createSpriteTween(4.5, 6.5);
  retargetSpriteTween(tween, 5.5, 6.5, 0);

  const midMs = MOVE_TWEEN_MS / 2;
  const before = spriteAt(tween, midMs);
  retargetSpriteTween(tween, 5.5, 7.5, midMs);
  const after = spriteAt(tween, midMs);

  assertAlmostEquals(after.x, before.x);
  assertAlmostEquals(after.y, before.y);

  const done = spriteAt(tween, midMs + MOVE_TWEEN_MS);
  assertEquals(done.x, 5.5);
  assertEquals(done.y, 7.5);
  assert(done.settled);
});

function scalarAt(tween: ReturnType<typeof createScalarTween>, nowMs: number): ScalarSample {
  const out: ScalarSample = { value: 0, settled: false };
  sampleScalarTween(tween, nowMs, out);
  return out;
}

Deno.test("scalar tween slides between targets over the full duration", () => {
  const tween = createScalarTween(0);
  assert(scalarAt(tween, 0).settled);

  retargetScalarTween(tween, 1, 0, 400);
  const mid = scalarAt(tween, 200);
  assert(mid.value > 0 && mid.value < 1);
  assert(!mid.settled);

  const done = scalarAt(tween, 400);
  assertEquals(done.value, 1);
  assert(done.settled);
});

Deno.test("scalar tween reverses mid-slide proportionally from the current value", () => {
  const tween = createScalarTween(0);
  retargetScalarTween(tween, 1, 0, 400);

  const before = scalarAt(tween, 200);
  retargetScalarTween(tween, 0, 200, 400);
  const after = scalarAt(tween, 200);
  assertAlmostEquals(after.value, before.value);

  // Closing from partway takes proportionally less than a full sweep.
  const partialDuration = 400 * before.value;
  const done = scalarAt(tween, 200 + partialDuration + 1);
  assertEquals(done.value, 0);
  assert(done.settled);
});

Deno.test("nudge lunges toward the obstacle and returns to rest", () => {
  const nudge = createNudgeTween();
  assert(nudgeAt(nudge, 0).settled, "inactive nudge is settled at zero");

  startNudgeTween(nudge, 1, 0, 0);
  const start = nudgeAt(nudge, 0);
  assertAlmostEquals(start.dx, 0);
  assert(!start.settled);

  const mid = nudgeAt(nudge, NUDGE_TWEEN_MS / 2);
  assert(mid.dx > 0, "displaces toward the blocked direction");
  assertEquals(mid.dy, 0);

  const done = nudgeAt(nudge, NUDGE_TWEEN_MS);
  assert(done.settled);
  assertEquals(done.dx, 0);
  assert(!nudge.active, "nudge deactivates once finished");
});
