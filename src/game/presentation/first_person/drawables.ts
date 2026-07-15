import type { SpriteId } from "@/src/game/content/sprite_ids.ts";
import {
  type DrawableEntity,
  DrawableKind,
  SpriteAnimationKind,
  type SpriteAnimationSnapshot,
} from "@/src/game/model/render_snapshot.ts";
import { type CardinalDirection, normalizeDirection } from "@/src/game/world/direction.ts";
import type { GameMap } from "@/src/game/world/map.ts";
import {
  type FirstPersonDeathFrame,
  type FirstPersonMaterials,
  type FirstPersonSpriteAnimation,
  type FirstPersonSpriteFacing,
  type FirstPersonSpriteMaterial,
} from "@/src/game/presentation/first_person/assets/mod.ts";
import { doorAxis, doorSlideForAxis, secretWallTextureSlot } from "@/src/game/presentation/first_person/scene.ts";
import { addSlidingSolidWall, addSprite, addThinWall, type RaycastScene } from "@/src/engine/raycast/mod.ts";
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
} from "@/src/game/presentation/first_person/tween.ts";

export type FirstPersonDrawableState = {
  readonly spriteTweens: Map<DrawableEntity["entity"], SpriteTween>;
  readonly spritePoint: SpritePoint;
  readonly doorTweens: Map<DrawableEntity["entity"], ScalarTween>;
  readonly doorSample: ScalarSample;
};

/** Relative facing (entity dir - camera dir) as seen by the camera. */
const RELATIVE_FACING: readonly [
  FirstPersonSpriteFacing,
  FirstPersonSpriteFacing,
  FirstPersonSpriteFacing,
  FirstPersonSpriteFacing,
] = ["back", "right", "front", "left"];

const ITEM_BOB_PERIOD_MS = 1_200;
const ITEM_BOB_BASE_ELEVATION = 0.03;
const ITEM_BOB_ELEVATION_AMPLITUDE = 0.025;

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
  scene: RaycastScene,
  x: number,
  y: number,
  material: FirstPersonSpriteMaterial,
  elevation = material.elevation,
  healthCurrent = 0,
  healthMax = 0,
  ceilingClipDistance = material.ceilingClipDistance,
): void {
  addSprite(
    scene,
    x,
    y,
    material.slot,
    material.scale,
    elevation,
    material.scale * material.aspect,
    healthCurrent,
    healthMax,
    ceilingClipDistance,
  );
}

function addMaterialSprite(
  materials: FirstPersonMaterials,
  scene: RaycastScene,
  x: number,
  y: number,
  spriteId: SpriteId,
  nowMs: number,
): boolean {
  const material = materials.sprite(spriteId);
  if (material === undefined) return false;
  addFirstPersonSprite(
    scene,
    x,
    y,
    material,
    material.elevation + (material.itemBob ? itemElevation(nowMs) : 0),
    0,
    0,
    material.ceilingClipDistance,
  );
  return material.itemBob;
}

/** Per-drawable animation demand: interactive stays at full fps; ambient may throttle. */
export type DrawableFrameDemand = {
  readonly interactive: boolean;
  readonly ambient: boolean;
};

const NO_FRAME_DEMAND: DrawableFrameDemand = { interactive: false, ambient: false };
const INTERACTIVE_FRAME_DEMAND: DrawableFrameDemand = { interactive: true, ambient: false };
const AMBIENT_FRAME_DEMAND: DrawableFrameDemand = { interactive: false, ambient: true };
const INTERACTIVE_AMBIENT_FRAME_DEMAND: DrawableFrameDemand = { interactive: true, ambient: true };

function frameDemand(interactive: boolean, ambient = false): DrawableFrameDemand {
  if (interactive) return ambient ? INTERACTIVE_AMBIENT_FRAME_DEMAND : INTERACTIVE_FRAME_DEMAND;
  return ambient ? AMBIENT_FRAME_DEMAND : NO_FRAME_DEMAND;
}

function relativeSpriteFacing(dir: number, cameraDir: CardinalDirection): FirstPersonSpriteFacing {
  const relative = (normalizeDirection(dir) - cameraDir + 4) & 3;
  return RELATIVE_FACING[relative]!;
}

function animationIsActive(animation: SpriteAnimationSnapshot | undefined, nowMs: number): boolean {
  return animation !== undefined && nowMs < animation.startedAtMs + animation.durationMs;
}

function animationFrame(animation: SpriteAnimationSnapshot, nowMs: number, frameCount: number): number {
  if (animation.durationMs <= 0) return frameCount - 1;
  const elapsed = Math.max(0, nowMs - animation.startedAtMs);
  const progress = Math.min(1, elapsed / animation.durationMs);
  return Math.min(frameCount - 1, (progress * frameCount) | 0);
}

/** Pick the sheet row for an enemy: ECS presentation state or default idle. */
function enemySpriteAnimation(
  animation: SpriteAnimationSnapshot | undefined,
  nowMs: number,
): FirstPersonSpriteAnimation {
  if (animation === undefined || !animationIsActive(animation, nowMs)) return "idle";
  if (animation.kind === SpriteAnimationKind.Attack) return "attack";
  if (animation.kind === SpriteAnimationKind.Walk) {
    return animationFrame(animation, nowMs, 2) === 0 ? "idle" : "walk";
  }
  return "idle";
}

function deathSpriteFrame(animation: SpriteAnimationSnapshot, nowMs: number): FirstPersonDeathFrame {
  const frame = animationFrame(animation, nowMs, 4);
  return frame === 0 || frame === 1 || frame === 2 ? frame : 3;
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

/** Returns whether this drawable still needs interactive and/or ambient frames. */
export function addDrawable(
  state: FirstPersonDrawableState,
  materials: FirstPersonMaterials,
  scene: RaycastScene,
  map: GameMap,
  drawable: DrawableEntity,
  cameraDir: CardinalDirection,
  nowMs: number,
): DrawableFrameDemand {
  const centerX = drawable.x + 0.5;
  const centerY = drawable.y + 0.5;
  switch (drawable.kind) {
    case DrawableKind.Player:
      return NO_FRAME_DEMAND;
    case DrawableKind.Actor: {
      tweenedSpritePosition(state, drawable, nowMs);
      const material = materials.directionalSprite(
        drawable.spriteId,
        enemySpriteAnimation(drawable.animation, nowMs),
        relativeSpriteFacing(drawable.dir, cameraDir),
      );
      if (material === undefined) return frameDemand(!state.spritePoint.settled);
      addFirstPersonSprite(
        scene,
        state.spritePoint.x,
        state.spritePoint.y,
        material,
        material.elevation,
        drawable.health?.current ?? 0,
        drawable.health?.max ?? 0,
      );
      return frameDemand(!state.spritePoint.settled || animationIsActive(drawable.animation, nowMs));
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
          secretWallTextureSlot(materials, map, drawable.x, drawable.y),
          secretAxis,
          doorSlideForAxis(drawable.slide, secretAxis),
          state.doorSample.value,
        );
        return frameDemand(!state.doorSample.settled);
      }
      // Glass doors stay in place: intact vs smashed is a texture swap, not a slide.
      if (drawable.glass) {
        const axis = doorAxis(map, drawable.x, drawable.y);
        addThinWall(
          scene,
          drawable.x,
          drawable.y,
          materials.glassDoor(drawable.open),
          axis,
        );
        return frameDemand(false);
      }
      tweenedDoorOpenness(state, drawable, nowMs);
      const axis = doorAxis(map, drawable.x, drawable.y);
      addThinWall(
        scene,
        drawable.x,
        drawable.y,
        materials.door(drawable.locked, drawable.color),
        axis,
        doorSlideForAxis(drawable.slide, axis),
        state.doorSample.value,
      );
      return frameDemand(!state.doorSample.settled);
    }
    case DrawableKind.Sprite: {
      if (drawable.animation?.kind === SpriteAnimationKind.Death) {
        const material = materials.deathSprite(
          drawable.spriteId,
          deathSpriteFrame(drawable.animation, nowMs),
        );
        if (material === undefined) return frameDemand(animationIsActive(drawable.animation, nowMs));
        addFirstPersonSprite(
          scene,
          centerX,
          centerY,
          material,
        );
        return frameDemand(animationIsActive(drawable.animation, nowMs));
      }
      return frameDemand(false, addMaterialSprite(materials, scene, centerX, centerY, drawable.spriteId, nowMs));
    }
    default: {
      const _exhaustive: never = drawable;
      return _exhaustive;
    }
  }
}
