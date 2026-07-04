/**
 * Camera pose tweening for grid-locked movement.
 *
 * The game snaps between cell centres and cardinal facings; these helpers
 * animate the camera between those rest poses. Pure math with no timers or
 * DOM: callers pass timestamps in, sample the pose out, and decide for
 * themselves how to schedule repaints while a tween is unsettled.
 */

export const MOVE_TWEEN_MS = 170;
export const TURN_TWEEN_MS = 140;

/** Grid steps are one tile; anything farther is a teleport and snaps. */
const TELEPORT_DISTANCE = 1.001;

export type PoseTween = {
  initialized: boolean;
  /** True when the active tween covers a position change (drives head-bob). */
  moving: boolean;
  fromX: number;
  fromY: number;
  fromAngle: number;
  toX: number;
  toY: number;
  /** Continuous (unwrapped) angle so successive turns never spin the long way. */
  toAngle: number;
  startMs: number;
  durationMs: number;
};

export type PoseSample = {
  x: number;
  y: number;
  angle: number;
  /** Raw tween progress 0-1 (unclamped easing input). */
  progress: number;
  /** True while the sample belongs to a position-changing tween. */
  moving: boolean;
  /** True once the tween has reached its target; no repaint needed. */
  settled: boolean;
};

export function createPoseTween(): PoseTween {
  return {
    initialized: false,
    moving: false,
    fromX: 0,
    fromY: 0,
    fromAngle: 0,
    toX: 0,
    toY: 0,
    toAngle: 0,
    startMs: 0,
    durationMs: 0,
  };
}

export function smoothstep(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

/** Signed shortest rotation from one angle to another, in (-pi, pi]. */
export function shortestAngleDelta(from: number, to: number): number {
  const twoPi = Math.PI * 2;
  let delta = (to - from) % twoPi;
  if (delta > Math.PI) delta -= twoPi;
  if (delta <= -Math.PI) delta += twoPi;
  return delta;
}

/** Jump straight to a rest pose with no animation. */
export function snapPoseTween(tween: PoseTween, x: number, y: number, angle: number): void {
  tween.initialized = true;
  tween.moving = false;
  tween.fromX = x;
  tween.fromY = y;
  tween.fromAngle = angle;
  tween.toX = x;
  tween.toY = y;
  tween.toAngle = angle;
  tween.startMs = 0;
  tween.durationMs = 0;
}

/**
 * Point the tween at a new rest pose. No-op when the target is unchanged;
 * snaps on the first pose and on teleports (map spawns, respawns). Otherwise
 * the animation starts from the current interpolated pose, so a command
 * arriving mid-tween stays smooth instead of jumping to the previous target.
 */
export function retargetPoseTween(tween: PoseTween, x: number, y: number, angle: number, nowMs: number): void {
  if (!tween.initialized) {
    snapPoseTween(tween, x, y, angle);
    return;
  }

  const moved = x !== tween.toX || y !== tween.toY;
  const turnDelta = shortestAngleDelta(tween.toAngle, angle);
  if (!moved && turnDelta === 0) return;

  if (Math.abs(x - tween.toX) > TELEPORT_DISTANCE || Math.abs(y - tween.toY) > TELEPORT_DISTANCE) {
    snapPoseTween(tween, x, y, angle);
    return;
  }

  const eased = smoothstep(poseTweenProgress(tween, nowMs));
  tween.fromX = tween.fromX + (tween.toX - tween.fromX) * eased;
  tween.fromY = tween.fromY + (tween.toY - tween.fromY) * eased;
  tween.fromAngle = tween.fromAngle + (tween.toAngle - tween.fromAngle) * eased;
  tween.toX = x;
  tween.toY = y;
  tween.toAngle = tween.fromAngle + shortestAngleDelta(tween.fromAngle, angle);
  tween.startMs = nowMs;
  tween.durationMs = moved ? MOVE_TWEEN_MS : TURN_TWEEN_MS;
  tween.moving = moved;
}

function poseTweenProgress(tween: PoseTween, nowMs: number): number {
  if (tween.durationMs <= 0) return 1;
  const t = (nowMs - tween.startMs) / tween.durationMs;
  return t >= 1 ? 1 : t <= 0 ? 0 : t;
}

export function samplePoseTween(tween: PoseTween, nowMs: number, out: PoseSample): void {
  const t = poseTweenProgress(tween, nowMs);
  const eased = smoothstep(t);
  out.x = tween.fromX + (tween.toX - tween.fromX) * eased;
  out.y = tween.fromY + (tween.toY - tween.fromY) * eased;
  out.angle = tween.fromAngle + (tween.toAngle - tween.fromAngle) * eased;
  out.progress = t;
  out.moving = tween.moving;
  out.settled = t >= 1;
}

/** Head-bob peak as a fraction of view height. */
const HEAD_BOB_FRACTION = 0.012;

/**
 * Vertical view offset for a pose sample, as a fraction of view height.
 * One half sine per step: rises mid-stride, zero at both rest poses.
 */
export function headBobFraction(sample: PoseSample): number {
  if (!sample.moving || sample.settled) return 0;
  return HEAD_BOB_FRACTION * Math.sin(Math.PI * sample.progress);
}

/** Enemies can lunge up to two tiles per turn (Digital Dog); farther snaps. */
const SPRITE_TELEPORT_DISTANCE = 2.001;

/** World-position tween for a billboard sprite (enemies moving per turn). */
export type SpriteTween = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startMs: number;
  durationMs: number;
};

export type SpritePoint = {
  x: number;
  y: number;
  settled: boolean;
};

export function createSpriteTween(x: number, y: number): SpriteTween {
  return { fromX: x, fromY: y, toX: x, toY: y, startMs: 0, durationMs: 0 };
}

export function retargetSpriteTween(
  tween: SpriteTween,
  x: number,
  y: number,
  nowMs: number,
  durationMs = MOVE_TWEEN_MS,
): void {
  if (x === tween.toX && y === tween.toY) return;

  if (
    Math.abs(x - tween.toX) > SPRITE_TELEPORT_DISTANCE ||
    Math.abs(y - tween.toY) > SPRITE_TELEPORT_DISTANCE
  ) {
    tween.fromX = x;
    tween.fromY = y;
    tween.toX = x;
    tween.toY = y;
    tween.durationMs = 0;
    return;
  }

  // Start from the current interpolated point so consecutive turns chain.
  const eased = smoothstep(spriteTweenProgress(tween, nowMs));
  tween.fromX = tween.fromX + (tween.toX - tween.fromX) * eased;
  tween.fromY = tween.fromY + (tween.toY - tween.fromY) * eased;
  tween.toX = x;
  tween.toY = y;
  tween.startMs = nowMs;
  tween.durationMs = durationMs;
}

function spriteTweenProgress(tween: SpriteTween, nowMs: number): number {
  if (tween.durationMs <= 0) return 1;
  const t = (nowMs - tween.startMs) / tween.durationMs;
  return t >= 1 ? 1 : t <= 0 ? 0 : t;
}

export function sampleSpriteTween(tween: SpriteTween, nowMs: number, out: SpritePoint): void {
  const t = spriteTweenProgress(tween, nowMs);
  const eased = smoothstep(t);
  out.x = tween.fromX + (tween.toX - tween.fromX) * eased;
  out.y = tween.fromY + (tween.toY - tween.fromY) * eased;
  out.settled = t >= 1;
}

/** Scalar tween for door openness and similar 0-1 slides. */
export type ScalarTween = {
  from: number;
  to: number;
  startMs: number;
  durationMs: number;
};

export type ScalarSample = {
  value: number;
  settled: boolean;
};

export function createScalarTween(value: number): ScalarTween {
  return { from: value, to: value, startMs: 0, durationMs: 0 };
}

/**
 * Animate toward a new target. `fullDurationMs` covers a full 0-to-1 sweep;
 * partial slides (reversing a half-open door) take proportionally less.
 */
export function retargetScalarTween(
  tween: ScalarTween,
  target: number,
  nowMs: number,
  fullDurationMs: number,
): void {
  if (target === tween.to) return;
  const eased = smoothstep(scalarTweenProgress(tween, nowMs));
  tween.from = tween.from + (tween.to - tween.from) * eased;
  tween.to = target;
  tween.startMs = nowMs;
  tween.durationMs = fullDurationMs * Math.abs(target - tween.from);
}

function scalarTweenProgress(tween: ScalarTween, nowMs: number): number {
  if (tween.durationMs <= 0) return 1;
  const t = (nowMs - tween.startMs) / tween.durationMs;
  return t >= 1 ? 1 : t <= 0 ? 0 : t;
}

export function sampleScalarTween(tween: ScalarTween, nowMs: number, out: ScalarSample): void {
  const t = scalarTweenProgress(tween, nowMs);
  const eased = smoothstep(t);
  out.value = tween.from + (tween.to - tween.from) * eased;
  out.settled = t >= 1;
}

export const NUDGE_TWEEN_MS = 110;
/** Peak displacement of a blocked-move recoil, in tiles. */
const NUDGE_DISTANCE = 0.08;

/** Bump-recoil for blocked moves: a quick there-and-back lunge. */
export type NudgeTween = {
  dirX: number;
  dirY: number;
  startMs: number;
  active: boolean;
};

export function createNudgeTween(): NudgeTween {
  return { dirX: 0, dirY: 0, startMs: 0, active: false };
}

export function startNudgeTween(nudge: NudgeTween, dirX: number, dirY: number, nowMs: number): void {
  nudge.dirX = dirX;
  nudge.dirY = dirY;
  nudge.startMs = nowMs;
  nudge.active = true;
}

export type NudgeSample = {
  dx: number;
  dy: number;
  settled: boolean;
};

export function sampleNudgeTween(nudge: NudgeTween, nowMs: number, out: NudgeSample): void {
  if (!nudge.active) {
    out.dx = 0;
    out.dy = 0;
    out.settled = true;
    return;
  }
  const t = (nowMs - nudge.startMs) / NUDGE_TWEEN_MS;
  if (t >= 1 || t < 0) {
    nudge.active = false;
    out.dx = 0;
    out.dy = 0;
    out.settled = true;
    return;
  }
  const displacement = NUDGE_DISTANCE * Math.sin(Math.PI * t);
  out.dx = nudge.dirX * displacement;
  out.dy = nudge.dirY * displacement;
  out.settled = false;
}
