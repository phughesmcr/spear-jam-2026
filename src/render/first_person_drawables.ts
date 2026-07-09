import { type SpriteAppearance, spriteAppearance } from "@/src/content/sprites.ts";
import {
  type DrawableEntity,
  DrawableKind,
  SpriteAnimationKind,
  type SpriteAnimationSchema,
} from "@/src/ecs/drawables.ts";
import type { TargetMarkerTone } from "@/src/game/state.ts";
import { type CardinalDirection, normalizeDirection } from "@/src/grid/direction.ts";
import type { GameMap } from "@/src/map/map.ts";
import { doorTexture, ENEMY_SHEET_COLUMNS, type FirstPersonAssetState } from "@/src/render/first_person_assets.ts";
import { doorAxis, doorSlideForAxis, secretWallTextureSlot } from "@/src/render/first_person_scene.ts";
import { addSlidingSolidWall, addSprite, addThinWall, type RaycastScene } from "@/src/render/raycast/scene.ts";
import type { ViewRect } from "@/src/render/raycast/view.ts";
import {
  createScalarTween,
  createSpriteTween,
  retargetScalarTween,
  retargetSpriteTween,
  sampleScalarTween,
  sampleSpriteTween,
  type ScalarSample,
  type ScalarTween,
  type SpritePoint,
  type SpriteTween,
} from "@/src/render/tween.ts";

export type FirstPersonDrawableState = FirstPersonAssetState & {
  readonly spriteTweens: Map<DrawableEntity["entity"], SpriteTween>;
  readonly spritePoint: SpritePoint;
  readonly doorTweens: Map<DrawableEntity["entity"], ScalarTween>;
  readonly doorSample: ScalarSample;
};

const ENEMY_ROW_IDLE = 0;
const ENEMY_ROW_WALK = 1;
const ENEMY_ROW_ATTACK = 2;
const ENEMY_ROW_DEATH = 3;
/** Relative facing (entity dir - camera dir) to enemy sheet column. */
const REL_DIR_TO_SHEET_COLUMN: readonly [number, number, number, number] = [2, 3, 0, 1];

const ITEM_BOB_PERIOD_MS = 1_200;
const ITEM_BOB_BASE_ELEVATION = 0.03;
const ITEM_BOB_ELEVATION_AMPLITUDE = 0.025;
const TARGET_SIZE_FRACTION = 0.055;
const TARGET_INNER_FRACTION = 0.38;
const TARGET_Y_FRACTION = 0.47;
const TARGET_COLORS: Readonly<Record<TargetMarkerTone, string>> = {
  danger: "rgba(248, 113, 113, 0.92)",
  locked: "rgba(250, 204, 21, 0.9)",
  loot: "rgba(125, 211, 252, 0.9)",
  use: "rgba(52, 211, 153, 0.9)",
};

/** Animated openness for a door entity; updates doorSample. */
function tweenedDoorOpenness(
  state: FirstPersonDrawableState,
  drawable: DrawableEntity & { open: boolean; openMs: number },
  nowMs: number,
): void {
  const target = drawable.open ? 1 : 0;
  let tween = state.doorTweens.get(drawable.entity);
  if (tween === undefined) {
    tween = createScalarTween(target);
    state.doorTweens.set(drawable.entity, tween);
  } else {
    retargetScalarTween(tween, target, nowMs, drawable.openMs);
  }
  sampleScalarTween(tween, nowMs, state.doorSample);
}

function itemElevation(nowMs: number): number {
  const phase = (nowMs / ITEM_BOB_PERIOD_MS) * Math.PI * 2;
  return ITEM_BOB_BASE_ELEVATION + Math.sin(phase) * ITEM_BOB_ELEVATION_AMPLITUDE;
}

function addFirstPersonSprite(
  state: FirstPersonDrawableState,
  scene: RaycastScene,
  x: number,
  y: number,
  slot: number,
  height: number,
  elevation = 0,
  healthCurrent = 0,
  healthMax = 0,
): void {
  addSprite(
    scene,
    x,
    y,
    slot,
    height,
    elevation,
    height * (state.spriteAspectBySlot.get(slot) ?? 1),
    healthCurrent,
    healthMax,
  );
}

function addAppearanceSprite(
  state: FirstPersonDrawableState,
  scene: RaycastScene,
  x: number,
  y: number,
  appearance: SpriteAppearance,
  nowMs: number,
): boolean {
  if (appearance.firstPersonSlot === undefined) return false;
  addFirstPersonSprite(
    state,
    scene,
    x,
    y,
    appearance.firstPersonSlot,
    appearance.firstPersonScale,
    appearance.firstPersonElevation + (appearance.itemBob ? itemElevation(nowMs) : 0),
  );
  return appearance.itemBob;
}

function enemySprite(baseSlot: number, dir: number, cameraDir: CardinalDirection, row: number): number {
  const relative = (normalizeDirection(dir) - cameraDir + 4) & 3;
  return baseSlot + row * ENEMY_SHEET_COLUMNS + REL_DIR_TO_SHEET_COLUMN[relative]!;
}

function animationIsActive(animation: SpriteAnimationSchema | undefined, nowMs: number): boolean {
  return animation !== undefined && nowMs < animation.startedAtMs + animation.durationMs;
}

function animationFrame(animation: SpriteAnimationSchema, nowMs: number, frameCount: number): number {
  if (animation.durationMs <= 0) return frameCount - 1;
  const elapsed = Math.max(0, nowMs - animation.startedAtMs);
  const progress = Math.min(1, elapsed / animation.durationMs);
  return Math.min(frameCount - 1, (progress * frameCount) | 0);
}

/** Pick the sheet row for an enemy: ECS presentation state or default idle. */
function enemySheetRow(animation: SpriteAnimationSchema | undefined, nowMs: number): number {
  if (animation === undefined || !animationIsActive(animation, nowMs)) return ENEMY_ROW_IDLE;
  if (animation.kind === SpriteAnimationKind.Attack) return ENEMY_ROW_ATTACK;
  if (animation.kind === SpriteAnimationKind.Walk) {
    return animationFrame(animation, nowMs, 2) === 0 ? ENEMY_ROW_IDLE : ENEMY_ROW_WALK;
  }
  return ENEMY_ROW_IDLE;
}

export function drawTargetHighlight(ctx: CanvasRenderingContext2D, rect: ViewRect, tone: TargetMarkerTone): void {
  const size = Math.max(18, Math.round(rect.width * TARGET_SIZE_FRACTION));
  const inner = Math.round(size * TARGET_INNER_FRACTION);
  const cx = Math.round(rect.x + rect.width / 2);
  const cy = Math.round(rect.y + rect.height * TARGET_Y_FRACTION);
  const left = cx - size;
  const right = cx + size;
  const top = cy - size;
  const bottom = cy + size;

  ctx.save();
  ctx.strokeStyle = TARGET_COLORS[tone];
  ctx.lineWidth = Math.max(2, Math.round(rect.width / 360));
  ctx.beginPath();
  ctx.moveTo(left, top + inner);
  ctx.lineTo(left, top);
  ctx.lineTo(left + inner, top);
  ctx.moveTo(right - inner, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, top + inner);
  ctx.moveTo(right, bottom - inner);
  ctx.lineTo(right, bottom);
  ctx.lineTo(right - inner, bottom);
  ctx.moveTo(left + inner, bottom);
  ctx.lineTo(left, bottom);
  ctx.lineTo(left, bottom - inner);
  ctx.stroke();
  ctx.restore();
}

/** Tweened world position for a moving entity; updates spritePoint. */
function tweenedSpritePosition(state: FirstPersonDrawableState, drawable: DrawableEntity, nowMs: number): void {
  const centerX = drawable.x + 0.5;
  const centerY = drawable.y + 0.5;
  let tween = state.spriteTweens.get(drawable.entity);
  if (tween === undefined) {
    tween = createSpriteTween(centerX, centerY);
    state.spriteTweens.set(drawable.entity, tween);
  } else {
    retargetSpriteTween(tween, centerX, centerY, nowMs, spriteMoveDuration(drawable));
  }
  sampleSpriteTween(tween, nowMs, state.spritePoint);
}

function spriteMoveDuration(drawable: DrawableEntity): number | undefined {
  if (!("animation" in drawable)) return undefined;
  return drawable.animation?.kind === SpriteAnimationKind.Walk ? drawable.animation.durationMs : undefined;
}

/** Returns true when the drawable's animation still needs frames. */
export function addDrawable(
  state: FirstPersonDrawableState,
  scene: RaycastScene,
  map: GameMap,
  drawable: DrawableEntity,
  cameraDir: CardinalDirection,
  nowMs: number,
): boolean {
  const centerX = drawable.x + 0.5;
  const centerY = drawable.y + 0.5;
  switch (drawable.kind) {
    case DrawableKind.Player:
      return false;
    case DrawableKind.Actor: {
      tweenedSpritePosition(state, drawable, nowMs);
      const appearance = spriteAppearance(drawable.spriteId);
      if (!appearance.enemySheet) {
        addAppearanceSprite(state, scene, state.spritePoint.x, state.spritePoint.y, appearance, nowMs);
        return !state.spritePoint.settled;
      }
      if (appearance.firstPersonSlot === undefined) return !state.spritePoint.settled;
      const row = enemySheetRow(drawable.animation, nowMs);
      const sprite = enemySprite(appearance.firstPersonSlot, drawable.dir, cameraDir, row);
      addFirstPersonSprite(
        state,
        scene,
        state.spritePoint.x,
        state.spritePoint.y,
        sprite,
        appearance.firstPersonScale,
        0,
        drawable.health?.current ?? 0,
        drawable.health?.max ?? 0,
      );
      return !state.spritePoint.settled || animationIsActive(drawable.animation, nowMs);
    }
    case DrawableKind.Door: {
      // A secret door stays disguised as its surrounding wall for its whole
      // lifecycle and slides from the same full-cell face it uses while shut.
      if (drawable.secret) {
        tweenedDoorOpenness(state, drawable, nowMs);
        const secretAxis = doorAxis(map, drawable.x, drawable.y);
        addSlidingSolidWall(
          scene,
          drawable.x,
          drawable.y,
          secretWallTextureSlot(state, map, drawable.x, drawable.y),
          secretAxis,
          doorSlideForAxis(drawable.slide, secretAxis),
          state.doorSample.value,
        );
        return !state.doorSample.settled;
      }
      tweenedDoorOpenness(state, drawable, nowMs);
      const axis = doorAxis(map, drawable.x, drawable.y);
      addThinWall(
        scene,
        drawable.x,
        drawable.y,
        doorTexture(drawable.locked, drawable.color),
        axis,
        doorSlideForAxis(drawable.slide, axis),
        state.doorSample.value,
      );
      return !state.doorSample.settled;
    }
    case DrawableKind.Sprite: {
      const appearance = spriteAppearance(drawable.spriteId);
      if (
        appearance.enemySheet &&
        appearance.firstPersonSlot !== undefined &&
        drawable.animation?.kind === SpriteAnimationKind.Death
      ) {
        const frame = animationFrame(drawable.animation, nowMs, ENEMY_SHEET_COLUMNS);
        addFirstPersonSprite(
          state,
          scene,
          centerX,
          centerY,
          appearance.firstPersonSlot + ENEMY_ROW_DEATH * ENEMY_SHEET_COLUMNS + frame,
          appearance.firstPersonScale,
        );
        return animationIsActive(drawable.animation, nowMs);
      }
      return addAppearanceSprite(state, scene, centerX, centerY, appearance, nowMs);
    }
  }
}
