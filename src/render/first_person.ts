/**
 * First-person view adapter.
 *
 * Bridges the game session to the raycast renderer: bakes PNG assets into
 * TEX_SIZE texel bands (with procedural fallbacks while images load), builds the
 * static terrain arrays once per map, and rebuilds the cheap dynamic scene
 * (doors as thin walls, drawables as billboard sprites) each frame.
 *
 * Enemy sprite sheets are 4x4 grids (rows: idle, walk, attack, death;
 * columns: front, facing-left, back, facing-right). The idle row is baked
 * into four directional sprites and the drawn one is picked from the enemy's
 * facing relative to the camera, Wolf3D style.
 */

import {
  type DrawableEntity,
  type DrawableEntityVisitor,
  DrawableKind,
  type LightEntityVisitor,
} from "@/src/ecs/drawables.ts";
import type { TargetMarkerTone } from "@/src/game/state.ts";
import { type CardinalDirection, directionDelta, normalizeDirection } from "@/src/grid/direction.ts";
import type { GameMap, TexturePackRef } from "@/src/map/map.ts";
import {
  bakeLoadedAssets,
  buildAtlas,
  type ContentCrop,
  createAssetCatalog,
  preloadAssetCatalog,
} from "@/src/render/first_person_assets.ts";
import { addDrawable, drawTargetHighlight } from "@/src/render/first_person_drawables.ts";
import {
  addTerrainBarriers,
  sceneForMapForState,
  sceneHasSkyCeiling,
  type TerrainBarrier,
  updateSceneLights,
} from "@/src/render/first_person_scene.ts";
import { cameraForAngle, clearSceneDynamic, type RaycastScene } from "@/src/render/raycast/scene.ts";
import { createRaycastView, type ViewRect } from "@/src/render/raycast/view.ts";
import {
  createNudgeTween,
  createPoseTween,
  headBobFraction,
  type NudgeSample,
  type PoseSample,
  retargetPoseTween,
  sampleNudgeTween,
  samplePoseTween,
  type ScalarSample,
  type ScalarTween,
  snapPoseTween,
  type SpritePoint,
  type SpriteTween,
  startNudgeTween,
} from "@/src/render/tween.ts";

export interface FirstPersonRenderSession {
  getMap(): GameMap;
  forEachDrawable(visit: DrawableEntityVisitor): void;
  forEachLight(visit: LightEntityVisitor): void;
}

export type FirstPersonRenderResult = {
  readonly needsFrame: boolean;
  readonly cameraAngle?: number;
};

export interface FirstPersonRenderer {
  preloadAssets(document: Document, onAssetLoad?: () => void): Promise<void>;
  sceneForMap(map: GameMap): RaycastScene;
  reset(): void;
  bump(dirX: number, dirY: number, nowMs: number): void;
  render(
    ctx: CanvasRenderingContext2D,
    rect: ViewRect,
    session: FirstPersonRenderSession,
    nowMs: number,
    targetTone?: TargetMarkerTone,
    onAssetLoad?: () => void,
    healthBarMaxDistance?: number,
  ): FirstPersonRenderResult;
}

function createFirstPersonRendererState() {
  return {
    atlas: buildAtlas(),
    view: createRaycastView(),
    assetCatalog: createAssetCatalog(),
    sceneByMap: new WeakMap<GameMap, RaycastScene>(),
    terrainBarriersByScene: new WeakMap<RaycastScene, readonly TerrainBarrier[]>(),
    packWallSlots: new Map<TexturePackRef, number>(),
    packPlaneSlots: new Map<TexturePackRef, number>(),
    spriteCropBySlot: new Map<number, ContentCrop | undefined>(),
    spriteCropReady: new Set<number>(),
    spriteAspectBySlot: new Map<number, number>(),
    drawableScratch: [] as DrawableEntity[],
    rasterCanvas: undefined as OffscreenCanvas | undefined,
    poseTween: createPoseTween(),
    poseSample: { x: 0, y: 0, angle: 0, progress: 1, moving: false, settled: true } satisfies PoseSample,
    nudgeTween: createNudgeTween(),
    nudgeSample: { dx: 0, dy: 0, settled: true } satisfies NudgeSample,
    spriteTweens: new Map<DrawableEntity["entity"], SpriteTween>(),
    spritePoint: { x: 0, y: 0, settled: true } satisfies SpritePoint,
    doorTweens: new Map<DrawableEntity["entity"], ScalarTween>(),
    doorSample: { value: 0, settled: true } satisfies ScalarSample,
    poseInitialized: false,
  };
}

type FirstPersonRendererState = ReturnType<typeof createFirstPersonRendererState>;

export function createFirstPersonRenderer(): FirstPersonRenderer {
  const state = createFirstPersonRendererState();
  return {
    preloadAssets(document, onAssetLoad) {
      return preloadAssetCatalog(document, state.assetCatalog, onAssetLoad);
    },
    sceneForMap(map) {
      return sceneForMapForState(state, map);
    },
    reset() {
      resetFirstPersonRendererState(state);
    },
    bump(dirX, dirY, nowMs) {
      bumpFirstPersonRenderer(state, dirX, dirY, nowMs);
    },
    render(ctx, rect, session, nowMs, targetTone, onAssetLoad, healthBarMaxDistance) {
      return renderFirstPersonView(state, ctx, rect, session, nowMs, targetTone, onAssetLoad, healthBarMaxDistance);
    },
  };
}

function resetFirstPersonRendererState(state: FirstPersonRendererState): void {
  state.sceneByMap = new WeakMap<GameMap, RaycastScene>();
  state.terrainBarriersByScene = new WeakMap<RaycastScene, readonly TerrainBarrier[]>();
  state.drawableScratch.length = 0;
  state.poseInitialized = false;
  state.nudgeTween.active = false;
  state.spriteTweens.clear();
  state.doorTweens.clear();
}

/**
 * Play a short recoil lunge toward (dirX, dirY) — the presentation for a
 * move blocked by a wall or entity, which changes no game state.
 */
function bumpFirstPersonRenderer(state: FirstPersonRendererState, dirX: number, dirY: number, nowMs: number): void {
  startNudgeTween(state.nudgeTween, dirX, dirY, nowMs);
}

/**
 * Render the first-person view for the session's current state.
 */
function renderFirstPersonView(
  state: FirstPersonRendererState,
  ctx: CanvasRenderingContext2D,
  rect: ViewRect,
  session: FirstPersonRenderSession,
  nowMs: number,
  targetTone?: TargetMarkerTone,
  onAssetLoad?: () => void,
  healthBarMaxDistance = 0,
): FirstPersonRenderResult {
  const map = session.getMap();
  const scene = sceneForMapForState(state, map);
  bakeLoadedAssets(state, ctx, onAssetLoad);
  clearSceneDynamic(scene);
  addTerrainBarriers(state, scene);
  const lightsAnimating = updateSceneLights(scene, session, nowMs);

  // Two passes over the drawables: the camera pose must be known before
  // enemies pick a directional sprite.
  state.drawableScratch.length = 0;
  let playerX = 0;
  let playerY = 0;
  let playerDir: CardinalDirection | undefined;
  session.forEachDrawable((drawable): void => {
    if (drawable.kind === DrawableKind.Player) {
      playerX = drawable.x;
      playerY = drawable.y;
      playerDir = normalizeDirection(drawable.dir);
      return;
    }
    state.drawableScratch.push(drawable);
  });
  if (playerDir === undefined) return { needsFrame: false };

  const forward = directionDelta(playerDir);
  const targetAngle = Math.atan2(forward.dy, forward.dx);
  if (!state.poseInitialized) {
    state.poseInitialized = true;
    snapPoseTween(state.poseTween, playerX + 0.5, playerY + 0.5, targetAngle);
  } else {
    retargetPoseTween(state.poseTween, playerX + 0.5, playerY + 0.5, targetAngle, nowMs);
  }

  let spritesAnimating = false;
  for (const drawable of state.drawableScratch) {
    spritesAnimating = addDrawable(state, scene, map, drawable, playerDir, nowMs) || spritesAnimating;
  }

  samplePoseTween(state.poseTween, nowMs, state.poseSample);
  sampleNudgeTween(state.nudgeTween, nowMs, state.nudgeSample);
  const skyAnimating = sceneHasSkyCeiling(scene, state.atlas);
  const needsFrame = !state.poseSample.settled || !state.nudgeSample.settled || spritesAnimating || lightsAnimating ||
    skyAnimating;

  state.view.render(
    ctx,
    rect,
    scene,
    state.atlas,
    cameraForAngle(
      state.poseSample.x + state.nudgeSample.dx,
      state.poseSample.y + state.nudgeSample.dy,
      state.poseSample.angle,
    ),
    headBobFraction(state.poseSample),
    nowMs,
    healthBarMaxDistance,
  );

  if (targetTone !== undefined) drawTargetHighlight(ctx, rect, targetTone);
  return { needsFrame, cameraAngle: state.poseSample.angle };
}
