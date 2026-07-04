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

import { DrawableKind } from "@/src/ecs/drawables.ts";
import type { DrawableEntity, DrawableEntityVisitor } from "@/src/ecs/drawables.ts";
import { EnemyArchetype } from "@/src/ecs/enemy_catalog.ts";
import { type CardinalDirection, directionDelta, normalizeDirection } from "@/src/grid/direction.ts";
import type { ItemIcon } from "@/src/game/items.ts";
import { DisplayName } from "@/src/game/names.ts";
import type { TargetMarkerTone } from "@/src/game/target_marker.ts";
import { KeyColor, mapDimensions, terrainAt, TexturePack } from "@/src/map/map.ts";
import type { CeilingTexture, DoorSlide, FloorTexture, GameMap, TexturePackRef, WallTexture } from "@/src/map/map.ts";
import { createImageAsset, loadedImage, preloadImageAssets } from "@/src/render/assets.ts";
import type { ImageAsset } from "@/src/render/assets.ts";
import {
  addSolidWall,
  addSprite,
  addThinWall,
  cameraForAngle,
  clearSceneDynamic,
  createScene,
  THIN_AXIS_X,
  THIN_AXIS_Y,
  THIN_SLIDE_DOWN,
  THIN_SLIDE_NEG,
  THIN_SLIDE_POS,
  THIN_SLIDE_UP,
} from "@/src/render/raycast/scene.ts";
import type { RaycastAtlas, RaycastScene, ThinWallAxis, ThinWallSlide } from "@/src/render/raycast/scene.ts";
import { bakeSolidTexture, bakeTexture, TEX_SIZE } from "@/src/render/raycast/textures.ts";
import type { BakedTexture, TexelSource } from "@/src/render/raycast/textures.ts";
import {
  createNudgeTween,
  createPoseTween,
  createScalarTween,
  createSpriteTween,
  headBobFraction,
  retargetPoseTween,
  retargetScalarTween,
  retargetSpriteTween,
  sampleNudgeTween,
  samplePoseTween,
  sampleScalarTween,
  sampleSpriteTween,
  snapPoseTween,
  startNudgeTween,
} from "@/src/render/raycast/tween.ts";
import type {
  NudgeSample,
  PoseSample,
  ScalarSample,
  ScalarTween,
  SpritePoint,
  SpriteTween,
} from "@/src/render/raycast/tween.ts";
import { createRaycastView } from "@/src/render/raycast/view.ts";
import type { ViewRect } from "@/src/render/raycast/view.ts";

type AtlasLayer = "walls" | "planes" | "sprites";

/** Region of the source image to bake, normalised 0-1: [x, y, w, h]. */
type SourceFrame = readonly [number, number, number, number];

type BakeTarget = {
  readonly layer: AtlasLayer;
  readonly slot: number;
  readonly tint?: readonly [number, number, number];
  readonly frame?: SourceFrame;
  baked: boolean;
};

type BakeTargetInput = {
  readonly layer: AtlasLayer;
  readonly slot: number;
  readonly tint?: readonly [number, number, number];
  readonly frame?: SourceFrame;
};

type ManagedAsset = {
  readonly asset: ImageAsset;
  readonly targets: BakeTarget[];
  /**
   * Frame to measure a shared content crop from. Sheet cells must all share
   * one crop or sprites would pulse in size when animation frames switch.
   */
  readonly cropFrame?: SourceFrame;
};

type TexturePackAsset = ManagedAsset & {
  readonly columns: number;
  readonly rows: number;
};

const TEXTURE_PACK_COLUMNS = 5;
const TEXTURE_PACK_ROWS = 4;

const WALL_TEX = 0;
const DOOR_TEX = 1;
const DOOR_TEX_BY_COLOR: Readonly<Record<KeyColor, number>> = {
  [KeyColor.Red]: 2,
  [KeyColor.Blue]: 3,
  [KeyColor.Yellow]: 4,
};
const FIRST_PACK_WALL_TEX = 5;

const FLOOR_TEX = 0;
const CEILING_TEX = 1;
const FIRST_PACK_PLANE_TEX = 2;

/** Enemy sheets are 4x4: rows idle/walk/attack/death, columns per view. */
const SHEET_COLUMNS = 4;
const SHEET_SLOTS = 16;
const ROW_IDLE = 0;
const ROW_WALK = 1;
const ROW_ATTACK = 2;
/** Death row frames play in sequence and are not directional. */
const ROW_DEATH = 3;
/** Relative facing (entity dir - camera dir) to enemy sheet column. */
const REL_DIR_TO_SHEET_COLUMN: readonly [number, number, number, number] = [2, 3, 0, 1];

const SPRITE_DOG = 0;
const SPRITE_GUNSLINGER = 16;
const SPRITE_NEOPHYTE = 32;
const SPRITE_SENTINEL = 48;
const SPRITE_ACOLYTE = 64;
const SPRITE_TERMINAL = 80;
const SPRITE_HEALTH = 81;
const SPRITE_KEY_BY_COLOR: Readonly<Record<KeyColor, number>> = {
  [KeyColor.Red]: 82,
  [KeyColor.Blue]: 83,
  [KeyColor.Yellow]: 84,
};
const SPRITE_WEAPON_2 = 85;
const SPRITE_WEAPON_3 = 86;
const SPRITE_NPC = 87;
const SPRITE_JOHN = 88;
const SPRITE_UPLINK_CODE = 89;
const SPRITE_CORPSE = 90;
const FIRST_ORB_SPRITE = 91;

/** Alternate walk and idle poses at this cadence while an enemy moves. */
const WALK_FRAME_MS = 90;
/** How long an enemy holds its attack pose after striking. */
const ATTACK_POSE_MS = 380;
/** Per-frame duration of the four-frame death sequence. */
const DEATH_FRAME_MS = 140;
const MAX_CORPSES = 48;
const CORPSE_SCALE = 0.6;

const ENEMY_SPRITES: Readonly<Record<EnemyArchetype, number>> = {
  [EnemyArchetype.MeleeDog]: SPRITE_DOG,
  [EnemyArchetype.Gunslinger]: SPRITE_GUNSLINGER,
  [EnemyArchetype.NetworkNeophyte]: SPRITE_NEOPHYTE,
  [EnemyArchetype.SystemSentinel]: SPRITE_SENTINEL,
  [EnemyArchetype.AgenticAcolyte]: SPRITE_ACOLYTE,
};

const ACTOR_SCALE = 0.75;
const TERMINAL_SCALE = 0.9;
const ITEM_SCALE = 0.4;
const TARGET_SIZE_FRACTION = 0.055;
const TARGET_INNER_FRACTION = 0.38;
const TARGET_Y_FRACTION = 0.47;
const TARGET_COLORS: Readonly<Record<TargetMarkerTone, string>> = {
  danger: "rgba(248, 113, 113, 0.92)",
  locked: "rgba(250, 204, 21, 0.9)",
  loot: "rgba(125, 211, 252, 0.9)",
  use: "rgba(52, 211, 153, 0.9)",
};

/** Tints are relative to mid-grey so the wall texture keeps its detail. */
const DOOR_TINT: readonly [number, number, number] = [1.2, 0.83, 0.45];
const DOOR_TINTS_BY_COLOR: Readonly<Record<KeyColor, readonly [number, number, number]>> = {
  [KeyColor.Red]: [1.55, 0.55, 0.5],
  [KeyColor.Blue]: [0.6, 1.05, 1.85],
  [KeyColor.Yellow]: [1.7, 1.5, 0.65],
};

function managedAsset(src: string, targets: readonly BakeTargetInput[], cropFrame?: SourceFrame): ManagedAsset {
  return {
    asset: createImageAsset(src),
    targets: targets.map((target) => ({ ...target, baked: false })),
    ...(cropFrame === undefined ? {} : { cropFrame }),
  };
}

function texturePackAsset(src: string): TexturePackAsset {
  return { ...managedAsset(src, []), columns: TEXTURE_PACK_COLUMNS, rows: TEXTURE_PACK_ROWS };
}

function addBakeTarget(entry: ManagedAsset, target: BakeTargetInput): void {
  entry.targets.push({ ...target, baked: false });
}

/** All sixteen cells of a 4x4 enemy sheet; slot = base + row * 4 + column. */
function enemySheetTargets(baseSlot: number): readonly BakeTargetInput[] {
  const targets: BakeTargetInput[] = [];
  for (let row = 0; row < SHEET_COLUMNS; row++) {
    for (let column = 0; column < SHEET_COLUMNS; column++) {
      targets.push({
        layer: "sprites",
        slot: baseSlot + row * SHEET_COLUMNS + column,
        frame: [column / 4, row / 4, 1 / 4, 1 / 4],
      });
    }
  }
  return targets;
}

/** Enemy sheets share the idle-front cell's content crop across all frames. */
const ENEMY_CROP_FRAME: SourceFrame = [0, 0, 1 / 4, 1 / 4];

type AssetCatalog = {
  readonly managedAssets: readonly ManagedAsset[];
  readonly texturePackAssets: Readonly<Record<TexturePack, TexturePackAsset>>;
};

function createAssetCatalog(): AssetCatalog {
  const texturePackAssets: Readonly<Record<TexturePack, TexturePackAsset>> = {
    [TexturePack.Pack1]: texturePackAsset(new URL("../../assets/game/textures/pack1.png", import.meta.url).href),
    [TexturePack.Pack2]: texturePackAsset(new URL("../../assets/game/textures/pack2.png", import.meta.url).href),
    [TexturePack.Pack3]: texturePackAsset(new URL("../../assets/game/textures/pack3.png", import.meta.url).href),
  };

  // Asset URLs must be fully static `new URL` literals so Vite can resolve them.
  const managedAssets: readonly ManagedAsset[] = [
    managedAsset(new URL("../../assets/game/textures/wall.png", import.meta.url).href, [
      { layer: "walls", slot: WALL_TEX },
      { layer: "walls", slot: DOOR_TEX, tint: DOOR_TINT },
      { layer: "walls", slot: DOOR_TEX_BY_COLOR[KeyColor.Red], tint: DOOR_TINTS_BY_COLOR[KeyColor.Red] },
      { layer: "walls", slot: DOOR_TEX_BY_COLOR[KeyColor.Blue], tint: DOOR_TINTS_BY_COLOR[KeyColor.Blue] },
      { layer: "walls", slot: DOOR_TEX_BY_COLOR[KeyColor.Yellow], tint: DOOR_TINTS_BY_COLOR[KeyColor.Yellow] },
    ]),
    managedAsset(new URL("../../assets/game/textures/floor.png", import.meta.url).href, [
      { layer: "planes", slot: FLOOR_TEX },
    ]),
    managedAsset(new URL("../../assets/game/textures/ceiling.png", import.meta.url).href, [
      { layer: "planes", slot: CEILING_TEX },
    ]),
    managedAsset(
      new URL("../../assets/game/sprites/digital_dog.png", import.meta.url).href,
      enemySheetTargets(SPRITE_DOG),
      ENEMY_CROP_FRAME,
    ),
    managedAsset(
      new URL("../../assets/game/sprites/gigabit_gun_slinger.png", import.meta.url).href,
      enemySheetTargets(SPRITE_GUNSLINGER),
      ENEMY_CROP_FRAME,
    ),
    managedAsset(
      new URL("../../assets/game/sprites/network_neophyte.png", import.meta.url).href,
      enemySheetTargets(SPRITE_NEOPHYTE),
      ENEMY_CROP_FRAME,
    ),
    managedAsset(
      new URL("../../assets/game/sprites/system_sentinel.png", import.meta.url).href,
      enemySheetTargets(SPRITE_SENTINEL),
      ENEMY_CROP_FRAME,
    ),
    managedAsset(
      new URL("../../assets/game/sprites/agentic_acolyte.png", import.meta.url).href,
      enemySheetTargets(SPRITE_ACOLYTE),
      ENEMY_CROP_FRAME,
    ),
    managedAsset(new URL("../../assets/game/sprites/corpse.png", import.meta.url).href, [
      { layer: "sprites", slot: SPRITE_CORPSE },
    ]),
    managedAsset(new URL("../../assets/game/sprites/uplink_terminal.png", import.meta.url).href, [
      // Left half of the sheet is the inactive terminal, right half is active.
      { layer: "sprites", slot: SPRITE_TERMINAL, frame: [0.5, 0, 0.5, 1] },
    ]),
    managedAsset(new URL("../../assets/game/sprites/health.png", import.meta.url).href, [
      { layer: "sprites", slot: SPRITE_HEALTH },
    ]),
    managedAsset(new URL("../../assets/game/sprites/red_key.png", import.meta.url).href, [
      { layer: "sprites", slot: SPRITE_KEY_BY_COLOR[KeyColor.Red] },
    ]),
    managedAsset(new URL("../../assets/game/sprites/blue_key.png", import.meta.url).href, [
      { layer: "sprites", slot: SPRITE_KEY_BY_COLOR[KeyColor.Blue] },
    ]),
    managedAsset(new URL("../../assets/game/sprites/yellow_key.png", import.meta.url).href, [
      { layer: "sprites", slot: SPRITE_KEY_BY_COLOR[KeyColor.Yellow] },
    ]),
    managedAsset(new URL("../../assets/game/sprites/weapon_2.png", import.meta.url).href, [
      { layer: "sprites", slot: SPRITE_WEAPON_2 },
    ]),
    managedAsset(new URL("../../assets/game/sprites/weapon_3.png", import.meta.url).href, [
      { layer: "sprites", slot: SPRITE_WEAPON_3 },
    ]),
    managedAsset(new URL("../../assets/game/sprites/john.png", import.meta.url).href, [
      { layer: "sprites", slot: SPRITE_JOHN },
    ]),
    texturePackAssets[TexturePack.Pack1],
    texturePackAssets[TexturePack.Pack2],
    texturePackAssets[TexturePack.Pack3],
  ];

  return { managedAssets, texturePackAssets };
}

function buildAtlas(): RaycastAtlas {
  const walls: BakedTexture[] = [];
  walls[WALL_TEX] = bakeSolidTexture(90, 95, 104);
  walls[DOOR_TEX] = bakeSolidTexture(154, 106, 58);
  walls[DOOR_TEX_BY_COLOR[KeyColor.Red]] = bakeSolidTexture(177, 75, 75);
  walls[DOOR_TEX_BY_COLOR[KeyColor.Blue]] = bakeSolidTexture(79, 141, 247);
  walls[DOOR_TEX_BY_COLOR[KeyColor.Yellow]] = bakeSolidTexture(244, 211, 94);

  const planes: BakedTexture[] = [];
  planes[FLOOR_TEX] = bakeSolidTexture(35, 40, 50);
  planes[CEILING_TEX] = bakeSolidTexture(16, 18, 23);

  const sprites: BakedTexture[] = [];
  fillEnemyFallback(sprites, SPRITE_DOG, "#ef4444");
  fillEnemyFallback(sprites, SPRITE_GUNSLINGER, "#38bdf8");
  fillEnemyFallback(sprites, SPRITE_NEOPHYTE, "#34d399");
  fillEnemyFallback(sprites, SPRITE_SENTINEL, "#f59e0b");
  fillEnemyFallback(sprites, SPRITE_ACOLYTE, "#a78bfa");
  sprites[SPRITE_TERMINAL] = bakeOrb("#22c55e");
  sprites[SPRITE_HEALTH] = bakeOrb("#59d39b");
  sprites[SPRITE_KEY_BY_COLOR[KeyColor.Red]] = bakeOrb("#df4f45");
  sprites[SPRITE_KEY_BY_COLOR[KeyColor.Blue]] = bakeOrb("#4f8df7");
  sprites[SPRITE_KEY_BY_COLOR[KeyColor.Yellow]] = bakeOrb("#f4d35e");
  sprites[SPRITE_WEAPON_2] = bakeOrb("#c084fc");
  sprites[SPRITE_WEAPON_3] = bakeOrb("#c084fc");
  sprites[SPRITE_NPC] = bakeOrb("#59d39b");
  sprites[SPRITE_UPLINK_CODE] = bakeOrb("#7dd3fc");
  sprites[SPRITE_CORPSE] = bakeOrb("#4b5563");

  return { walls, planes, sprites };
}

function fillEnemyFallback(sprites: BakedTexture[], baseSlot: number, color: string): void {
  const orb = bakeOrb(color);
  for (let slot = 0; slot < SHEET_SLOTS; slot++) {
    sprites[baseSlot + slot] = orb;
  }
}

function npcSprite(displayName: number | undefined): number {
  return displayName === DisplayName.John ? SPRITE_JOHN : SPRITE_NPC;
}

/** Procedural billboard for entities without a dedicated sprite asset. */
function orbSource(red: number, green: number, blue: number): TexelSource {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  const center = TEX_SIZE / 2 - 0.5;
  const radius = TEX_SIZE * 0.32;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const distance = Math.hypot(x - center, y - (center + TEX_SIZE * 0.16));
      if (distance > radius) continue;
      const rim = distance > radius * 0.78 ? 0.55 : 1;
      const index = (y * TEX_SIZE + x) * 4;
      data[index] = red * rim;
      data[index + 1] = green * rim;
      data[index + 2] = blue * rim;
      data[index + 3] = 255;
    }
  }
  return { width: TEX_SIZE, height: TEX_SIZE, data };
}

function bakeOrb(hexColor: string): BakedTexture {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  return bakeTexture(orbSource(red, green, blue), { transpose: true });
}

type DeathEffect = { x: number; y: number; base: number; startMs: number };

export interface FirstPersonRenderSession {
  readonly map: GameMap;
  forEachDrawable(visit: DrawableEntityVisitor): void;
}

export interface FirstPersonRenderer {
  preloadAssets(document: Document, onAssetLoad?: () => void): Promise<void>;
  sceneForMap(map: GameMap): RaycastScene;
  reset(): void;
  bump(dirX: number, dirY: number): void;
  markSpriteAttack(entity: DrawableEntity["entity"]): void;
  markSpriteDeath(entity: DrawableEntity["entity"]): void;
  render(
    ctx: CanvasRenderingContext2D,
    rect: ViewRect,
    session: FirstPersonRenderSession,
    targetTone?: TargetMarkerTone,
    repaint?: () => void,
  ): void;
}

function createFirstPersonRendererState() {
  return {
    atlas: buildAtlas(),
    view: createRaycastView(),
    assetCatalog: createAssetCatalog(),
    sceneByMap: new WeakMap<GameMap, RaycastScene>(),
    packWallSlots: new Map<TexturePackRef, number>(),
    packPlaneSlots: new Map<TexturePackRef, number>(),
    orbSpriteByColor: new Map<string, number>(),
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
    attackPoseUntil: new Map<DrawableEntity["entity"], number>(),
    lastSeenEnemies: new Map<DrawableEntity["entity"], { x: number; y: number; base: number }>(),
    deathEffects: [] as DeathEffect[],
    corpses: [] as { x: number; y: number }[],
    poseInitialized: false,
    repaintScheduled: false,
    lastRepaint: undefined as (() => void) | undefined,
  };
}

type FirstPersonRendererState = ReturnType<typeof createFirstPersonRendererState>;

class OwnedFirstPersonRenderer implements FirstPersonRenderer {
  private readonly state = createFirstPersonRendererState();

  preloadAssets(document: Document, onAssetLoad?: () => void): Promise<void> {
    return preloadImageAssets(
      document,
      this.state.assetCatalog.managedAssets.map((entry) => entry.asset),
      onAssetLoad,
    );
  }

  sceneForMap(map: GameMap): RaycastScene {
    return sceneForMapForState(this.state, map);
  }

  reset(): void {
    resetFirstPersonRendererState(this.state);
  }

  bump(dirX: number, dirY: number): void {
    bumpFirstPersonRenderer(this.state, dirX, dirY);
  }

  markSpriteAttack(entity: DrawableEntity["entity"]): void {
    markFirstPersonSpriteAttack(this.state, entity);
  }

  markSpriteDeath(entity: DrawableEntity["entity"]): void {
    markFirstPersonSpriteDeath(this.state, entity);
  }

  render(
    ctx: CanvasRenderingContext2D,
    rect: ViewRect,
    session: FirstPersonRenderSession,
    targetTone?: TargetMarkerTone,
    repaint?: () => void,
  ): void {
    renderFirstPersonView(this.state, ctx, rect, session, targetTone, repaint);
  }
}

export function createFirstPersonRenderer(): FirstPersonRenderer {
  return new OwnedFirstPersonRenderer();
}

export function sceneForMap(map: GameMap): RaycastScene {
  return createFirstPersonRenderer().sceneForMap(map);
}

function resetFirstPersonRendererState(state: FirstPersonRendererState): void {
  state.sceneByMap = new WeakMap<GameMap, RaycastScene>();
  state.drawableScratch.length = 0;
  state.poseInitialized = false;
  state.nudgeTween.active = false;
  state.spriteTweens.clear();
  state.doorTweens.clear();
  state.attackPoseUntil.clear();
  state.lastSeenEnemies.clear();
  state.deathEffects.length = 0;
  state.corpses.length = 0;
  state.repaintScheduled = false;
  state.lastRepaint = undefined;
}

/** One repaint per animation frame while the camera tween is unsettled. */
function scheduleRepaint(state: FirstPersonRendererState, repaint: () => void): void {
  if (state.repaintScheduled || typeof requestAnimationFrame !== "function") return;
  state.repaintScheduled = true;
  requestAnimationFrame((): void => {
    state.repaintScheduled = false;
    repaint();
  });
}

/**
 * Play a short recoil lunge toward (dirX, dirY) — the presentation for a
 * move blocked by a wall or entity, which changes no game state. Repaints
 * with the last callback given to the renderer.
 */
function bumpFirstPersonRenderer(state: FirstPersonRendererState, dirX: number, dirY: number): void {
  startNudgeTween(state.nudgeTween, dirX, dirY, performance.now());
  if (state.lastRepaint !== undefined) scheduleRepaint(state, state.lastRepaint);
}

/** Show the entity in its attack pose briefly (it just struck something). */
function markFirstPersonSpriteAttack(state: FirstPersonRendererState, entity: DrawableEntity["entity"]): void {
  state.attackPoseUntil.set(entity, performance.now() + ATTACK_POSE_MS);
  if (state.lastRepaint !== undefined) scheduleRepaint(state, state.lastRepaint);
}

/**
 * Play the death sequence where the entity last stood, then leave a corpse.
 * The ECS destroys defeated entities immediately, so this echo is the only
 * record the renderer keeps of them.
 */
function markFirstPersonSpriteDeath(state: FirstPersonRendererState, entity: DrawableEntity["entity"]): void {
  const seen = state.lastSeenEnemies.get(entity);
  if (seen === undefined) return;
  state.deathEffects.push({ x: seen.x, y: seen.y, base: seen.base, startMs: performance.now() });
  state.lastSeenEnemies.delete(entity);
  state.spriteTweens.delete(entity);
  state.attackPoseUntil.delete(entity);
  if (state.lastRepaint !== undefined) scheduleRepaint(state, state.lastRepaint);
}

type OpaqueBounds = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

function opaqueBounds(pixels: TexelSource): OpaqueBounds | undefined {
  let left = TEX_SIZE;
  let top = TEX_SIZE;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      if (pixels.data[(y * TEX_SIZE + x) * 4 + 3]! < 128) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return undefined;
  return { left, top, right, bottom };
}

/** Content crop within a frame, in TEX_SIZE-ths of the frame's span. */
type ContentCrop = {
  readonly left: number;
  readonly top: number;
  readonly size: number;
};

/**
 * Draw (a frame of) the image at TEX_SIZE square, optionally zoomed to a crop within
 * the frame, and hand back its pixels for baking.
 */
function rasterize(
  state: FirstPersonRendererState,
  image: HTMLImageElement,
  frame: SourceFrame | undefined,
  crop: ContentCrop | undefined,
): TexelSource | undefined {
  state.rasterCanvas ??= new OffscreenCanvas(TEX_SIZE, TEX_SIZE);
  const context = state.rasterCanvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return undefined;

  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  let sourceX = (frame?.[0] ?? 0) * imageWidth;
  let sourceY = (frame?.[1] ?? 0) * imageHeight;
  let sourceWidth = (frame?.[2] ?? 1) * imageWidth;
  let sourceHeight = (frame?.[3] ?? 1) * imageHeight;
  if (crop !== undefined) {
    sourceX += (crop.left / TEX_SIZE) * sourceWidth;
    sourceY += (crop.top / TEX_SIZE) * sourceHeight;
    sourceWidth *= crop.size / TEX_SIZE;
    sourceHeight *= crop.size / TEX_SIZE;
  }

  context.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
  context.imageSmoothingEnabled = true;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, TEX_SIZE, TEX_SIZE);
  return context.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
}

/**
 * Measure a frame's opaque bounding box, expanded to a square with margin
 * that keeps the content's feet at the bottom edge, so sprites fill their
 * billboard quad instead of floating in sheet padding.
 */
function measureContentCrop(
  state: FirstPersonRendererState,
  image: HTMLImageElement,
  frame: SourceFrame | undefined,
): ContentCrop | undefined {
  const pixels = rasterize(state, image, frame, undefined);
  if (pixels === undefined) return undefined;
  const bounds = opaqueBounds(pixels);
  if (bounds === undefined) return undefined;

  // Extra margin absorbs pose-to-pose size differences under a shared crop.
  const margin = Math.round(TEX_SIZE * 0.05);
  const size = Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top) + 1 + margin * 2;
  let left = (bounds.left + bounds.right + 1) / 2 - size / 2;
  let top = bounds.bottom + 1 + margin - size;
  if (left < 0) left = 0;
  if (left + size > TEX_SIZE) left = TEX_SIZE - size;
  if (top < 0) top = 0;
  if (top + size > TEX_SIZE) top = TEX_SIZE - size;
  return { left, top, size };
}

function bakeLoadedAssets(
  state: FirstPersonRendererState,
  ctx: CanvasRenderingContext2D,
  onAssetLoad?: () => void,
): void {
  for (const entry of state.assetCatalog.managedAssets) {
    const image = loadedImage(ctx, entry.asset, onAssetLoad);
    if (image === undefined) continue;

    let sharedCrop: ContentCrop | undefined;
    let sharedCropMeasured = false;
    for (const target of entry.targets) {
      if (target.baked) continue;
      let crop: ContentCrop | undefined;
      if (target.layer === "sprites") {
        if (entry.cropFrame !== undefined) {
          if (!sharedCropMeasured) {
            sharedCrop = measureContentCrop(state, image, entry.cropFrame);
            sharedCropMeasured = true;
          }
          crop = sharedCrop;
        } else {
          crop = measureContentCrop(state, image, target.frame);
        }
      }
      const source = rasterize(state, image, target.frame, crop);
      if (source === undefined) continue;
      state.atlas[target.layer][target.slot] = bakeTexture(source, {
        transpose: target.layer !== "planes",
        ...(target.tint === undefined ? {} : { tint: target.tint }),
      });
      target.baked = true;
    }
  }
}

function orbSprite(state: FirstPersonRendererState, color: string): number {
  const existing = state.orbSpriteByColor.get(color);
  if (existing !== undefined) return existing;

  const id = FIRST_ORB_SPRITE + state.orbSpriteByColor.size;
  state.atlas.sprites[id] = bakeOrb(color);
  state.orbSpriteByColor.set(color, id);
  return id;
}

function isTexturePack(value: string): value is TexturePack {
  return value === TexturePack.Pack1 || value === TexturePack.Pack2 || value === TexturePack.Pack3;
}

function parseTexturePackRef(
  texture: TexturePackRef,
  texturePackAssets: Readonly<Record<TexturePack, TexturePackAsset>>,
): {
  readonly pack: TexturePack;
  readonly column: number;
  readonly row: number;
} {
  const packParts = texture.split(":");
  const packText = packParts[0];
  const cellText = packParts[1];
  if (packParts.length !== 2 || packText === undefined || cellText === undefined || !isTexturePack(packText)) {
    throw new Error(`Unknown texture pack ref: ${texture}`);
  }

  const cellParts = cellText.split(",");
  const columnText = cellParts[0];
  const rowText = cellParts[1];
  const column = Number(columnText);
  const row = Number(rowText);
  const entry = texturePackAssets[packText];
  if (
    cellParts.length !== 2 ||
    !Number.isInteger(column) ||
    !Number.isInteger(row) ||
    column < 0 ||
    row < 0 ||
    column >= entry.columns ||
    row >= entry.rows
  ) {
    throw new Error(`Texture pack ref "${texture}" must address a ${entry.columns}x${entry.rows} grid.`);
  }

  return { pack: packText, column, row };
}

function texturePackFrame(
  texture: TexturePackRef,
  entry: TexturePackAsset,
  texturePackAssets: Readonly<Record<TexturePack, TexturePackAsset>>,
): SourceFrame {
  const { column, row } = parseTexturePackRef(texture, texturePackAssets);
  return [column / entry.columns, row / entry.rows, 1 / entry.columns, 1 / entry.rows];
}

function texturePackSlot(
  state: FirstPersonRendererState,
  layer: "walls" | "planes",
  texture: TexturePackRef,
  fallback: BakedTexture,
): number {
  const slots = layer === "walls" ? state.packWallSlots : state.packPlaneSlots;
  const existing = slots.get(texture);
  if (existing !== undefined) return existing;

  const { pack } = parseTexturePackRef(texture, state.assetCatalog.texturePackAssets);
  const slot = (layer === "walls" ? FIRST_PACK_WALL_TEX : FIRST_PACK_PLANE_TEX) + slots.size;
  const entry = state.assetCatalog.texturePackAssets[pack];
  slots.set(texture, slot);
  state.atlas[layer][slot] = fallback;
  addBakeTarget(entry, { layer, slot, frame: texturePackFrame(texture, entry, state.assetCatalog.texturePackAssets) });
  return slot;
}

function wallTextureSlot(state: FirstPersonRendererState, texture: WallTexture | undefined): number {
  if (texture === undefined || texture === "wall") return WALL_TEX;
  return texturePackSlot(state, "walls", texture, state.atlas.walls[WALL_TEX]!);
}

function floorTextureSlot(state: FirstPersonRendererState, texture: FloorTexture): number {
  if (texture === "floor") return FLOOR_TEX;
  return texturePackSlot(state, "planes", texture, state.atlas.planes[FLOOR_TEX]!);
}

function ceilingTextureSlot(state: FirstPersonRendererState, texture: CeilingTexture): number {
  if (texture === "ceiling") return CEILING_TEX;
  return texturePackSlot(state, "planes", texture, state.atlas.planes[CEILING_TEX]!);
}

function sceneForMapForState(state: FirstPersonRendererState, map: GameMap): RaycastScene {
  const cached = state.sceneByMap.get(map);
  if (cached !== undefined) return cached;

  const { width, height } = mapDimensions(map);
  const scene = createScene(width, height, { spriteCapacity: raycastSpriteCapacity(map, width * height) });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = y * width + x;
      const terrain = terrainAt(map, x, y);
      // Missing terrain blocks movement, so render it as wall to match.
      if (terrain === undefined) {
        scene.walls[cell] = wallTextureSlot(state, undefined) + 1;
        continue;
      }
      if (terrain.blocking === true) {
        scene.walls[cell] = wallTextureSlot(state, "wall_texture" in terrain ? terrain.wall_texture : undefined) + 1;
        continue;
      }
      scene.floors[cell] = floorTextureSlot(state, terrain.floor_texture) + 1;
      scene.ceilings[cell] = ceilingTextureSlot(state, terrain.ceiling_texture) + 1;
    }
  }
  state.sceneByMap.set(map, scene);
  return scene;
}

function raycastSpriteCapacity(map: GameMap, cellCount: number): number {
  return Math.max(cellCount, map.entities.length + MAX_CORPSES);
}

function isBlocking(map: GameMap, x: number, y: number): boolean {
  const terrain = terrainAt(map, x, y);
  return terrain === undefined || terrain.blocking === true;
}

/** Doors span the gap between their flanking walls. */
function doorAxis(map: GameMap, x: number, y: number): ThinWallAxis {
  if (isBlocking(map, x - 1, y) && isBlocking(map, x + 1, y)) return THIN_AXIS_Y;
  return THIN_AXIS_X;
}

/**
 * Texture for a disguised secret door: match a flanking wall so it blends into
 * the surrounding terrain, falling back to the default wall texture.
 */
function secretWallTextureSlot(state: FirstPersonRendererState, map: GameMap, x: number, y: number): number {
  for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
    const terrain = terrainAt(map, nx, ny);
    if (terrain?.blocking === true) {
      return wallTextureSlot(state, "wall_texture" in terrain ? terrain.wall_texture : undefined);
    }
  }
  return wallTextureSlot(state, undefined);
}

function doorTexture(locked: boolean, color: KeyColor | undefined): number {
  if (locked && color !== undefined) return DOOR_TEX_BY_COLOR[color];
  return DOOR_TEX;
}

/**
 * Map an authored slide direction onto the door's span axis. Horizontal
 * directions perpendicular to the span (or unset) fall back to sliding
 * toward the negative end (north/west).
 */
function doorSlideForAxis(slide: DoorSlide | undefined, axis: ThinWallAxis): ThinWallSlide {
  switch (slide) {
    case "up":
      return THIN_SLIDE_UP;
    case "down":
      return THIN_SLIDE_DOWN;
    case "east":
      return axis === THIN_AXIS_Y ? THIN_SLIDE_POS : THIN_SLIDE_NEG;
    case "south":
      return axis === THIN_AXIS_X ? THIN_SLIDE_POS : THIN_SLIDE_NEG;
    case "north":
    case "west":
    default:
      return THIN_SLIDE_NEG;
  }
}

/** Animated openness for a door entity; updates doorSample. */
function tweenedDoorOpenness(
  state: FirstPersonRendererState,
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

function itemSprite(state: FirstPersonRendererState, icon: ItemIcon): number {
  switch (icon.type) {
    case "key":
      return SPRITE_KEY_BY_COLOR[icon.color];
    case "weapon":
      return icon.slot === 2 ? SPRITE_WEAPON_2 : SPRITE_WEAPON_3;
    case "uplinkCode":
      return SPRITE_UPLINK_CODE;
    case "badge":
      return icon.label === "+" ? SPRITE_HEALTH : orbSprite(state, icon.color);
  }
}

function enemySprite(archetype: EnemyArchetype, dir: number, cameraDir: CardinalDirection, row: number): number {
  const relative = (normalizeDirection(dir) - cameraDir + 4) & 3;
  return ENEMY_SPRITES[archetype] + row * SHEET_COLUMNS + REL_DIR_TO_SHEET_COLUMN[relative]!;
}

/** Pick the sheet row for an enemy: attack pose, mid-stride gait, or idle. */
function enemySheetRow(
  state: FirstPersonRendererState,
  entity: DrawableEntity["entity"],
  moving: boolean,
  nowMs: number,
): number {
  if (nowMs < (state.attackPoseUntil.get(entity) ?? 0)) return ROW_ATTACK;
  if (moving && ((nowMs / WALK_FRAME_MS) & 1) === 1) return ROW_WALK;
  return ROW_IDLE;
}

function drawTargetHighlight(ctx: CanvasRenderingContext2D, rect: ViewRect, tone: TargetMarkerTone): void {
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
function tweenedSpritePosition(state: FirstPersonRendererState, drawable: DrawableEntity, nowMs: number): void {
  const centerX = drawable.x + 0.5;
  const centerY = drawable.y + 0.5;
  let tween = state.spriteTweens.get(drawable.entity);
  if (tween === undefined) {
    tween = createSpriteTween(centerX, centerY);
    state.spriteTweens.set(drawable.entity, tween);
  } else {
    retargetSpriteTween(tween, centerX, centerY, nowMs);
  }
  sampleSpriteTween(tween, nowMs, state.spritePoint);
}

/** Returns true when the drawable's animation still needs repaints. */
function addDrawable(
  state: FirstPersonRendererState,
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
    case DrawableKind.Npc:
      addSprite(scene, centerX, centerY, npcSprite(drawable.displayName), ACTOR_SCALE);
      return false;
    case DrawableKind.Enemy: {
      tweenedSpritePosition(state, drawable, nowMs);
      if (drawable.enemyArchetype === undefined) {
        addSprite(scene, state.spritePoint.x, state.spritePoint.y, SPRITE_NPC, ACTOR_SCALE);
        return !state.spritePoint.settled;
      }
      const attacking = nowMs < (state.attackPoseUntil.get(drawable.entity) ?? 0);
      const row = enemySheetRow(state, drawable.entity, !state.spritePoint.settled, nowMs);
      const sprite = enemySprite(drawable.enemyArchetype, drawable.dir, cameraDir, row);
      let seen = state.lastSeenEnemies.get(drawable.entity);
      if (seen === undefined) {
        seen = { x: 0, y: 0, base: 0 };
        state.lastSeenEnemies.set(drawable.entity, seen);
      }
      seen.x = state.spritePoint.x;
      seen.y = state.spritePoint.y;
      seen.base = ENEMY_SPRITES[drawable.enemyArchetype];
      addSprite(scene, state.spritePoint.x, state.spritePoint.y, sprite, ACTOR_SCALE);
      return !state.spritePoint.settled || attacking;
    }
    case DrawableKind.Door: {
      // A secret door stays disguised as its surrounding wall for its whole
      // lifecycle. While shut it is a flush full-cell wall (no mid-tile slab, no
      // jambs); once opened it slides a wall-textured panel away — using the
      // wall texture also makes the flanking jamb faces blend into the wall.
      if (drawable.secret) {
        tweenedDoorOpenness(state, drawable, nowMs);
        if (!drawable.open) {
          addSolidWall(scene, drawable.x, drawable.y, secretWallTextureSlot(state, map, drawable.x, drawable.y));
          return false;
        }
        const secretAxis = doorAxis(map, drawable.x, drawable.y);
        addThinWall(
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
    case DrawableKind.UplinkTerminal:
      addSprite(scene, centerX, centerY, SPRITE_TERMINAL, TERMINAL_SCALE);
      return false;
    case DrawableKind.Item:
      addSprite(scene, centerX, centerY, itemSprite(state, drawable.icon), ITEM_SCALE);
      return false;
  }
}

/**
 * Render the first-person view for the session's current state. `repaint`
 * doubles as the asset-load callback and the animation tick: while the camera
 * is tweening between grid poses, one requestAnimationFrame repaint at a time
 * is scheduled, so idle turns keep costing zero frames.
 */
function renderFirstPersonView(
  state: FirstPersonRendererState,
  ctx: CanvasRenderingContext2D,
  rect: ViewRect,
  session: FirstPersonRenderSession,
  targetTone?: TargetMarkerTone,
  repaint?: () => void,
): void {
  const map = session.map;
  const scene = sceneForMapForState(state, map);
  bakeLoadedAssets(state, ctx, repaint);
  clearSceneDynamic(scene);

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
  if (playerDir === undefined) return;

  const forward = directionDelta(playerDir);
  const targetAngle = Math.atan2(forward.dy, forward.dx);
  const nowMs = performance.now();
  state.lastRepaint = repaint;
  if (!state.poseInitialized) {
    state.poseInitialized = true;
    snapPoseTween(state.poseTween, playerX + 0.5, playerY + 0.5, targetAngle);
  } else {
    retargetPoseTween(state.poseTween, playerX + 0.5, playerY + 0.5, targetAngle, nowMs);
  }

  // Corpses first so anything else on the tile draws over them.
  for (const corpse of state.corpses) {
    addSprite(scene, corpse.x, corpse.y, SPRITE_CORPSE, CORPSE_SCALE);
  }

  let spritesAnimating = false;
  for (const drawable of state.drawableScratch) {
    spritesAnimating = addDrawable(state, scene, map, drawable, playerDir, nowMs) || spritesAnimating;
  }

  // Death sequences play out where the entity last stood, then settle into
  // corpses that persist for the rest of the session.
  for (let i = state.deathEffects.length - 1; i >= 0; i--) {
    const death = state.deathEffects[i]!;
    const frame = ((nowMs - death.startMs) / DEATH_FRAME_MS) | 0;
    if (frame >= SHEET_COLUMNS) {
      if (state.corpses.length >= MAX_CORPSES) state.corpses.shift();
      state.corpses.push({ x: death.x, y: death.y });
      state.deathEffects.splice(i, 1);
      continue;
    }
    addSprite(scene, death.x, death.y, death.base + ROW_DEATH * SHEET_COLUMNS + frame, ACTOR_SCALE);
    spritesAnimating = true;
  }

  samplePoseTween(state.poseTween, nowMs, state.poseSample);
  sampleNudgeTween(state.nudgeTween, nowMs, state.nudgeSample);
  if ((!state.poseSample.settled || !state.nudgeSample.settled || spritesAnimating) && repaint !== undefined) {
    scheduleRepaint(state, repaint);
  }

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
  );

  if (targetTone !== undefined) drawTargetHighlight(ctx, rect, targetTone);
}
