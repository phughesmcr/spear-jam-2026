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

import type { SpriteId } from "@/src/game/content/sprite_ids.ts";
import {
  type DrawableEntity,
  type DrawableEntityVisitor,
  type LightEntityVisitor,
} from "@/src/game/simulation/drawables.ts";
import { DrawableKind } from "@/src/game/simulation/drawable_kind.ts";
import { type CardinalDirection, Direction, directionDelta, normalizeDirection } from "@/src/game/world/direction.ts";
import type { GameMap, TexturePackRef } from "@/src/game/world/map.ts";
import { preloadImageAssets } from "@/src/platform/web/assets.ts";
import {
  bakeLoadedAssets,
  buildAtlas,
  type ContentCrop,
  createAssetCatalog,
  deferredCatalogAssets,
  preloadAssetCatalogForSprites,
} from "@/src/game/presentation/first_person/assets.ts";
import { addDrawable } from "@/src/game/presentation/first_person/drawables.ts";
import {
  addTerrainBarriers,
  createLightUpdateThrottle,
  sceneForMapForState,
  sceneHasSkyCeiling,
  type TerrainBarrier,
  updateSceneLights,
} from "@/src/game/presentation/first_person/scene.ts";
import { cameraForAngle, clearSceneDynamic, type RaycastScene } from "@/src/engine/raycast/scene.ts";
import { createRaycastView, type ViewRect } from "@/src/engine/raycast/view.ts";
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
} from "@/src/game/presentation/first_person/tween.ts";

export interface FirstPersonRenderSession {
  getMap(): GameMap;
  forEachDrawable(visit: DrawableEntityVisitor): void;
  forEachLight(visit: LightEntityVisitor): void;
}

export type FirstPersonFrameScratch = {
  needsFrame: boolean;
  ambientOnly: boolean;
  cameraAngle: number;
};

export interface FirstPersonRenderer {
  preloadAssets(document: Document, spriteIds: ReadonlySet<SpriteId>, onAssetLoad?: () => void): Promise<void>;
  warmDeferredAssets(
    document: Document,
    spriteIds: ReadonlySet<SpriteId>,
    onAssetLoad?: () => void,
  ): Promise<void>;
  bakeLoadedAssets(ctx: CanvasRenderingContext2D): void;
  sceneForMap(map: GameMap): RaycastScene;
  reset(): void;
  bump(dirX: number, dirY: number, nowMs: number): void;
  render(
    ctx: CanvasRenderingContext2D,
    rect: ViewRect,
    session: FirstPersonRenderSession,
    nowMs: number,
    out: FirstPersonFrameScratch,
    onAssetLoad?: () => void,
    healthBarMaxDistance?: number,
  ): void;
}

function createFirstPersonRendererState() {
  const state = {
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
    allTargetsBaked: false,
    drawableMap: undefined as GameMap | undefined,
    drawableScene: undefined as RaycastScene | undefined,
    drawableNowMs: 0,
    drawableCameraDir: Direction.North as CardinalDirection,
    playerX: 0,
    playerY: 0,
    playerDir: undefined as CardinalDirection | undefined,
    spritesInteractive: false,
    spritesAmbient: false,
    visitPlayerDrawable: (_drawable: DrawableEntity): void => {},
    visitSceneDrawable: (_drawable: DrawableEntity): void => {},
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
    lightThrottle: createLightUpdateThrottle(),
  };
  state.visitPlayerDrawable = (drawable): void => {
    if (drawable.kind !== DrawableKind.Player) return;
    state.playerX = drawable.x;
    state.playerY = drawable.y;
    state.playerDir = normalizeDirection(drawable.dir);
  };
  state.visitSceneDrawable = (drawable): void => {
    if (drawable.kind === DrawableKind.Player) return;
    const demand = addDrawable(
      state,
      state.drawableScene!,
      state.drawableMap!,
      drawable,
      state.drawableCameraDir,
      state.drawableNowMs,
    );
    state.spritesInteractive ||= demand.interactive;
    state.spritesAmbient ||= demand.ambient;
  };
  return state;
}

type FirstPersonRendererState = ReturnType<typeof createFirstPersonRendererState>;

export function createFirstPersonRenderer(): FirstPersonRenderer {
  const state = createFirstPersonRendererState();
  return {
    preloadAssets(document, spriteIds, onAssetLoad) {
      return preloadAssetCatalogForSprites(document, state.assetCatalog, spriteIds, onAssetLoad);
    },
    warmDeferredAssets(document, spriteIds, onAssetLoad) {
      return preloadImageAssets(document, deferredCatalogAssets(state.assetCatalog, spriteIds), onAssetLoad);
    },
    bakeLoadedAssets(ctx) {
      bakeLoadedAssets(state, ctx);
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
    render(ctx, rect, session, nowMs, out, onAssetLoad, healthBarMaxDistance) {
      renderFirstPersonView(state, ctx, rect, session, nowMs, out, onAssetLoad, healthBarMaxDistance);
    },
  };
}

function resetFirstPersonRendererState(state: FirstPersonRendererState): void {
  state.sceneByMap = new WeakMap<GameMap, RaycastScene>();
  state.terrainBarriersByScene = new WeakMap<RaycastScene, readonly TerrainBarrier[]>();
  state.poseInitialized = false;
  state.nudgeTween.active = false;
  state.spriteTweens.clear();
  state.doorTweens.clear();
  state.lightThrottle = createLightUpdateThrottle();
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
  out: FirstPersonFrameScratch,
  onAssetLoad?: () => void,
  healthBarMaxDistance = 0,
): void {
  const map = session.getMap();
  const scene = sceneForMapForState(state, map);
  bakeLoadedAssets(state, ctx, onAssetLoad);
  clearSceneDynamic(scene);
  addTerrainBarriers(state, scene);
  const lightsAnimating = updateSceneLights(scene, session, nowMs, state.lightThrottle);

  // Two passes over the drawables: the camera pose must be known before
  // enemies pick a directional sprite.
  state.playerDir = undefined;
  session.forEachDrawable(state.visitPlayerDrawable);
  const playerDir = state.playerDir;
  if (playerDir === undefined) {
    out.needsFrame = false;
    out.ambientOnly = false;
    out.cameraAngle = 0;
    return;
  }

  const forward = directionDelta(playerDir);
  const targetAngle = Math.atan2(forward.dy, forward.dx);
  if (!state.poseInitialized) {
    state.poseInitialized = true;
    snapPoseTween(state.poseTween, state.playerX + 0.5, state.playerY + 0.5, targetAngle);
  } else {
    retargetPoseTween(state.poseTween, state.playerX + 0.5, state.playerY + 0.5, targetAngle, nowMs);
  }

  state.drawableScene = scene;
  state.drawableMap = map;
  state.drawableNowMs = nowMs;
  state.drawableCameraDir = playerDir;
  state.spritesInteractive = false;
  state.spritesAmbient = false;
  session.forEachDrawable(state.visitSceneDrawable);

  samplePoseTween(state.poseTween, nowMs, state.poseSample);
  sampleNudgeTween(state.nudgeTween, nowMs, state.nudgeSample);
  const skyAnimating = sceneHasSkyCeiling(scene, state.atlas);
  const interactive = !state.poseSample.settled || !state.nudgeSample.settled || state.spritesInteractive;
  const ambient = state.spritesAmbient || lightsAnimating || skyAnimating;
  const needsFrame = interactive || ambient;

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

  out.needsFrame = needsFrame;
  out.ambientOnly = needsFrame && !interactive;
  out.cameraAngle = state.poseSample.angle;
}
