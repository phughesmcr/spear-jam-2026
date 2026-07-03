/**
 * First-person view adapter.
 *
 * Bridges the game session to the raycast renderer: bakes PNG assets into
 * 64x64 texel bands (with procedural fallbacks while images load), builds the
 * static terrain arrays once per map, and rebuilds the cheap dynamic scene
 * (doors as thin walls, drawables as billboard sprites) each frame.
 *
 * Enemy sprite sheets are 4x4 grids (rows: idle, walk, attack, death;
 * columns: front, facing-left, back, facing-right). The idle row is baked
 * into four directional sprites and the drawn one is picked from the enemy's
 * facing relative to the camera, Wolf3D style.
 */

import { DrawableKind } from "@/src/ecs/drawables.ts";
import type { DrawableEntity } from "@/src/ecs/drawables.ts";
import { EnemyArchetype } from "@/src/ecs/components.ts";
import type { GameSession } from "@/src/ecs/session.ts";
import { type CardinalDirection, directionDelta, normalizeDirection } from "@/src/grid/direction.ts";
import type { ItemIcon } from "@/src/game/items.ts";
import { KeyColor, mapDimensions, terrainAt, TexturePack } from "@/src/map/map.ts";
import type { CeilingTexture, DoorSlide, FloorTexture, GameMap, TexturePackRef, WallTexture } from "@/src/map/map.ts";
import { createImageAsset, loadedImage, preloadImageAssets } from "@/src/render/assets.ts";
import type { ImageAsset } from "@/src/render/assets.ts";
import {
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
const SPRITE_UPLINK_CODE = 88;
const SPRITE_CORPSE = 89;
const FIRST_ORB_SPRITE = 90;

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
const TARGET_MAX_DISTANCE = 6;
const TARGET_SIZE_FRACTION = 0.055;
const TARGET_INNER_FRACTION = 0.38;
const TARGET_Y_FRACTION = 0.47;
const TARGET_COLORS: Readonly<Record<TargetTone, string>> = {
  danger: "rgba(248, 113, 113, 0.92)",
  locked: "rgba(250, 204, 21, 0.9)",
  loot: "rgba(125, 211, 252, 0.9)",
  use: "rgba(52, 211, 153, 0.9)",
};

type TargetTone = "danger" | "locked" | "loot" | "use";

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

const TEXTURE_PACK_ASSETS: Readonly<Record<TexturePack, TexturePackAsset>> = {
  [TexturePack.Pack1]: texturePackAsset(new URL("../../assets/game/textures/pack1.png", import.meta.url).href),
  [TexturePack.Pack2]: texturePackAsset(new URL("../../assets/game/textures/pack2.png", import.meta.url).href),
  [TexturePack.Pack3]: texturePackAsset(new URL("../../assets/game/textures/pack3.png", import.meta.url).href),
};

// Asset URLs must be fully static `new URL` literals so Vite can resolve them.
const MANAGED_ASSETS: readonly ManagedAsset[] = [
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
  TEXTURE_PACK_ASSETS[TexturePack.Pack1],
  TEXTURE_PACK_ASSETS[TexturePack.Pack2],
  TEXTURE_PACK_ASSETS[TexturePack.Pack3],
];

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

const atlas: RaycastAtlas = buildAtlas();
const view = createRaycastView();
const sceneByMap = new WeakMap<GameMap, RaycastScene>();
const packWallSlots = new Map<TexturePackRef, number>();
const packPlaneSlots = new Map<TexturePackRef, number>();
const orbSpriteByColor = new Map<string, number>();
const drawableScratch: DrawableEntity[] = [];
let rasterCanvas: OffscreenCanvas | undefined;

const poseTween = createPoseTween();
const poseSample: PoseSample = { x: 0, y: 0, angle: 0, progress: 1, moving: false, settled: true };
const nudgeTween = createNudgeTween();
const nudgeSample: NudgeSample = { dx: 0, dy: 0, settled: true };
const spriteTweens = new Map<DrawableEntity["entity"], SpriteTween>();
const spritePoint: SpritePoint = { x: 0, y: 0, settled: true };
const doorTweens = new Map<DrawableEntity["entity"], ScalarTween>();
const doorSample: ScalarSample = { value: 0, settled: true };

/** Entities holding their attack pose, mapped to when the pose ends. */
const attackPoseUntil = new Map<DrawableEntity["entity"], number>();
/** Last rendered position and sheet base per enemy, for death placement. */
const lastSeenEnemies = new Map<DrawableEntity["entity"], { x: number; y: number; base: number }>();
type DeathEffect = { x: number; y: number; base: number; startMs: number };
const deathEffects: DeathEffect[] = [];
const corpses: { x: number; y: number }[] = [];

let lastSession: GameSession | undefined;
let repaintScheduled = false;
let lastRepaint: (() => void) | undefined;

/** One repaint per animation frame while the camera tween is unsettled. */
function scheduleRepaint(repaint: () => void): void {
  if (repaintScheduled || typeof requestAnimationFrame !== "function") return;
  repaintScheduled = true;
  requestAnimationFrame((): void => {
    repaintScheduled = false;
    repaint();
  });
}

/**
 * Play a short recoil lunge toward (dirX, dirY) — the presentation for a
 * move blocked by a wall or entity, which changes no game state. Repaints
 * with the last callback given to {@link renderFirstPersonView}.
 */
export function bumpFirstPersonView(dirX: number, dirY: number): void {
  startNudgeTween(nudgeTween, dirX, dirY, performance.now());
  if (lastRepaint !== undefined) scheduleRepaint(lastRepaint);
}

/** Show the entity in its attack pose briefly (it just struck something). */
export function markSpriteAttack(entity: DrawableEntity["entity"]): void {
  attackPoseUntil.set(entity, performance.now() + ATTACK_POSE_MS);
  if (lastRepaint !== undefined) scheduleRepaint(lastRepaint);
}

/**
 * Play the death sequence where the entity last stood, then leave a corpse.
 * The ECS destroys defeated entities immediately, so this echo is the only
 * record the renderer keeps of them.
 */
export function markSpriteDeath(entity: DrawableEntity["entity"]): void {
  const seen = lastSeenEnemies.get(entity);
  if (seen === undefined) return;
  deathEffects.push({ x: seen.x, y: seen.y, base: seen.base, startMs: performance.now() });
  lastSeenEnemies.delete(entity);
  spriteTweens.delete(entity);
  attackPoseUntil.delete(entity);
  if (lastRepaint !== undefined) scheduleRepaint(lastRepaint);
}

export async function preloadFirstPersonAssets(document: Document, onAssetLoad?: () => void): Promise<void> {
  await preloadImageAssets(document, MANAGED_ASSETS.map((entry) => entry.asset), onAssetLoad);
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

/** Content crop within a frame, in 64ths of the frame's span. */
type ContentCrop = {
  readonly left: number;
  readonly top: number;
  readonly size: number;
};

/**
 * Draw (a frame of) the image at 64x64, optionally zoomed to a crop within
 * the frame, and hand back its pixels for baking.
 */
function rasterize(
  image: HTMLImageElement,
  frame: SourceFrame | undefined,
  crop: ContentCrop | undefined,
): TexelSource | undefined {
  rasterCanvas ??= new OffscreenCanvas(TEX_SIZE, TEX_SIZE);
  const context = rasterCanvas.getContext("2d", { willReadFrequently: true });
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
function measureContentCrop(image: HTMLImageElement, frame: SourceFrame | undefined): ContentCrop | undefined {
  const pixels = rasterize(image, frame, undefined);
  if (pixels === undefined) return undefined;
  const bounds = opaqueBounds(pixels);
  if (bounds === undefined) return undefined;

  // Extra margin absorbs pose-to-pose size differences under a shared crop.
  const margin = 3;
  const size = Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top) + 1 + margin * 2;
  let left = (bounds.left + bounds.right + 1) / 2 - size / 2;
  let top = bounds.bottom + 1 + margin - size;
  if (left < 0) left = 0;
  if (left + size > TEX_SIZE) left = TEX_SIZE - size;
  if (top < 0) top = 0;
  if (top + size > TEX_SIZE) top = TEX_SIZE - size;
  return { left, top, size };
}

function bakeLoadedAssets(ctx: CanvasRenderingContext2D, onAssetLoad?: () => void): void {
  for (const entry of MANAGED_ASSETS) {
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
            sharedCrop = measureContentCrop(image, entry.cropFrame);
            sharedCropMeasured = true;
          }
          crop = sharedCrop;
        } else {
          crop = measureContentCrop(image, target.frame);
        }
      }
      const source = rasterize(image, target.frame, crop);
      if (source === undefined) continue;
      atlas[target.layer][target.slot] = bakeTexture(source, {
        transpose: target.layer !== "planes",
        ...(target.tint === undefined ? {} : { tint: target.tint }),
      });
      target.baked = true;
    }
  }
}

function orbSprite(color: string): number {
  const existing = orbSpriteByColor.get(color);
  if (existing !== undefined) return existing;

  const id = FIRST_ORB_SPRITE + orbSpriteByColor.size;
  atlas.sprites[id] = bakeOrb(color);
  orbSpriteByColor.set(color, id);
  return id;
}

function isTexturePack(value: string): value is TexturePack {
  return value === TexturePack.Pack1 || value === TexturePack.Pack2 || value === TexturePack.Pack3;
}

function parseTexturePackRef(texture: TexturePackRef): {
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
  const entry = TEXTURE_PACK_ASSETS[packText];
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

function texturePackFrame(texture: TexturePackRef, entry: TexturePackAsset): SourceFrame {
  const { column, row } = parseTexturePackRef(texture);
  return [column / entry.columns, row / entry.rows, 1 / entry.columns, 1 / entry.rows];
}

function texturePackSlot(
  layer: "walls" | "planes",
  texture: TexturePackRef,
  fallback: BakedTexture,
): number {
  const slots = layer === "walls" ? packWallSlots : packPlaneSlots;
  const existing = slots.get(texture);
  if (existing !== undefined) return existing;

  const { pack } = parseTexturePackRef(texture);
  const slot = (layer === "walls" ? FIRST_PACK_WALL_TEX : FIRST_PACK_PLANE_TEX) + slots.size;
  const entry = TEXTURE_PACK_ASSETS[pack];
  slots.set(texture, slot);
  atlas[layer][slot] = fallback;
  addBakeTarget(entry, { layer, slot, frame: texturePackFrame(texture, entry) });
  return slot;
}

function wallTextureSlot(texture: WallTexture | undefined): number {
  if (texture === undefined || texture === "wall") return WALL_TEX;
  return texturePackSlot("walls", texture, atlas.walls[WALL_TEX]!);
}

function floorTextureSlot(texture: FloorTexture): number {
  if (texture === "floor") return FLOOR_TEX;
  return texturePackSlot("planes", texture, atlas.planes[FLOOR_TEX]!);
}

function ceilingTextureSlot(texture: CeilingTexture): number {
  if (texture === "ceiling") return CEILING_TEX;
  return texturePackSlot("planes", texture, atlas.planes[CEILING_TEX]!);
}

export function sceneForMap(map: GameMap): RaycastScene {
  const cached = sceneByMap.get(map);
  if (cached !== undefined) return cached;

  const { width, height } = mapDimensions(map);
  const scene = createScene(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = y * width + x;
      const terrain = terrainAt(map, x, y);
      // Missing terrain blocks movement, so render it as wall to match.
      if (terrain === undefined) {
        scene.walls[cell] = wallTextureSlot(undefined) + 1;
        continue;
      }
      if (terrain.blocking === true) {
        scene.walls[cell] = wallTextureSlot("wall_texture" in terrain ? terrain.wall_texture : undefined) + 1;
        continue;
      }
      scene.floors[cell] = floorTextureSlot(terrain.floor_texture) + 1;
      scene.ceilings[cell] = ceilingTextureSlot(terrain.ceiling_texture) + 1;
    }
  }
  sceneByMap.set(map, scene);
  return scene;
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
function tweenedDoorOpenness(drawable: DrawableEntity & { open: boolean; openMs: number }, nowMs: number): void {
  const target = drawable.open ? 1 : 0;
  let tween = doorTweens.get(drawable.entity);
  if (tween === undefined) {
    tween = createScalarTween(target);
    doorTweens.set(drawable.entity, tween);
  } else {
    retargetScalarTween(tween, target, nowMs, drawable.openMs);
  }
  sampleScalarTween(tween, nowMs, doorSample);
}

function itemSprite(icon: ItemIcon): number {
  switch (icon.type) {
    case "key":
      return SPRITE_KEY_BY_COLOR[icon.color];
    case "weapon":
      return icon.slot === 2 ? SPRITE_WEAPON_2 : SPRITE_WEAPON_3;
    case "uplinkCode":
      return SPRITE_UPLINK_CODE;
    case "badge":
      return icon.label === "+" ? SPRITE_HEALTH : orbSprite(icon.color);
  }
}

function enemySprite(archetype: EnemyArchetype, dir: number, cameraDir: CardinalDirection, row: number): number {
  const relative = (normalizeDirection(dir) - cameraDir + 4) & 3;
  return ENEMY_SPRITES[archetype] + row * SHEET_COLUMNS + REL_DIR_TO_SHEET_COLUMN[relative]!;
}

/** Pick the sheet row for an enemy: attack pose, mid-stride gait, or idle. */
function enemySheetRow(entity: DrawableEntity["entity"], moving: boolean, nowMs: number): number {
  if (nowMs < (attackPoseUntil.get(entity) ?? 0)) return ROW_ATTACK;
  if (moving && ((nowMs / WALK_FRAME_MS) & 1) === 1) return ROW_WALK;
  return ROW_IDLE;
}

function targetToneFor(
  drawables: readonly DrawableEntity[],
  playerX: number,
  playerY: number,
  forward: ReturnType<typeof directionDelta>,
): TargetTone | undefined {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestPriority = -1;
  let bestTone: TargetTone | undefined;
  for (const drawable of drawables) {
    const distance = facingDistance(drawable, playerX, playerY, forward);
    if (distance === undefined || distance > TARGET_MAX_DISTANCE) continue;

    const tone = drawableTargetTone(drawable);
    if (tone === undefined) continue;
    const priority = targetPriority(tone);
    if (distance < bestDistance || (distance === bestDistance && priority > bestPriority)) {
      bestDistance = distance;
      bestPriority = priority;
      bestTone = tone;
    }
  }
  return bestTone;
}

function facingDistance(
  drawable: DrawableEntity,
  playerX: number,
  playerY: number,
  forward: ReturnType<typeof directionDelta>,
): number | undefined {
  const dx = drawable.x - playerX;
  const dy = drawable.y - playerY;
  if (forward.dx !== 0 && dy === 0 && dx * forward.dx > 0) return Math.abs(dx);
  if (forward.dy !== 0 && dx === 0 && dy * forward.dy > 0) return Math.abs(dy);
  return undefined;
}

function drawableTargetTone(drawable: DrawableEntity): TargetTone | undefined {
  switch (drawable.kind) {
    case DrawableKind.Enemy:
      return "danger";
    case DrawableKind.Door:
      if (drawable.open) return undefined;
      return drawable.locked ? "locked" : "use";
    case DrawableKind.Item:
      return "loot";
    case DrawableKind.Npc:
    case DrawableKind.UplinkTerminal:
      return "use";
    case DrawableKind.Player:
      return undefined;
  }
}

function targetPriority(tone: TargetTone): number {
  switch (tone) {
    case "danger":
      return 4;
    case "locked":
      return 3;
    case "use":
      return 2;
    case "loot":
      return 1;
  }
}

function drawTargetHighlight(ctx: CanvasRenderingContext2D, rect: ViewRect, tone: TargetTone): void {
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
function tweenedSpritePosition(drawable: DrawableEntity, nowMs: number): void {
  const centerX = drawable.x + 0.5;
  const centerY = drawable.y + 0.5;
  let tween = spriteTweens.get(drawable.entity);
  if (tween === undefined) {
    tween = createSpriteTween(centerX, centerY);
    spriteTweens.set(drawable.entity, tween);
  } else {
    retargetSpriteTween(tween, centerX, centerY, nowMs);
  }
  sampleSpriteTween(tween, nowMs, spritePoint);
}

/** Returns true when the drawable's animation still needs repaints. */
function addDrawable(
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
      addSprite(scene, centerX, centerY, SPRITE_NPC, ACTOR_SCALE);
      return false;
    case DrawableKind.Enemy: {
      tweenedSpritePosition(drawable, nowMs);
      if (drawable.enemyArchetype === undefined) {
        addSprite(scene, spritePoint.x, spritePoint.y, SPRITE_NPC, ACTOR_SCALE);
        return !spritePoint.settled;
      }
      const attacking = nowMs < (attackPoseUntil.get(drawable.entity) ?? 0);
      const row = enemySheetRow(drawable.entity, !spritePoint.settled, nowMs);
      const sprite = enemySprite(drawable.enemyArchetype, drawable.dir, cameraDir, row);
      let seen = lastSeenEnemies.get(drawable.entity);
      if (seen === undefined) {
        seen = { x: 0, y: 0, base: 0 };
        lastSeenEnemies.set(drawable.entity, seen);
      }
      seen.x = spritePoint.x;
      seen.y = spritePoint.y;
      seen.base = ENEMY_SPRITES[drawable.enemyArchetype];
      addSprite(scene, spritePoint.x, spritePoint.y, sprite, ACTOR_SCALE);
      return !spritePoint.settled || attacking;
    }
    case DrawableKind.Door: {
      tweenedDoorOpenness(drawable, nowMs);
      if (doorSample.value >= 1) return false;
      const axis = doorAxis(map, drawable.x, drawable.y);
      addThinWall(
        scene,
        drawable.x,
        drawable.y,
        doorTexture(drawable.locked, drawable.color),
        axis,
        doorSlideForAxis(drawable.slide, axis),
        doorSample.value,
      );
      return !doorSample.settled;
    }
    case DrawableKind.UplinkTerminal:
      addSprite(scene, centerX, centerY, SPRITE_TERMINAL, TERMINAL_SCALE);
      return false;
    case DrawableKind.Item:
      addSprite(scene, centerX, centerY, itemSprite(drawable.icon), ITEM_SCALE);
      return false;
  }
}

/**
 * Render the first-person view for the session's current state. `repaint`
 * doubles as the asset-load callback and the animation tick: while the camera
 * is tweening between grid poses, one requestAnimationFrame repaint at a time
 * is scheduled, so idle turns keep costing zero frames.
 */
export function renderFirstPersonView(
  ctx: CanvasRenderingContext2D,
  rect: ViewRect,
  session: GameSession,
  repaint?: () => void,
): void {
  const map = session.map;
  const scene = sceneForMap(map);
  bakeLoadedAssets(ctx, repaint);
  clearSceneDynamic(scene);

  // Two passes over the drawables: the camera pose must be known before
  // enemies pick a directional sprite.
  drawableScratch.length = 0;
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
    drawableScratch.push(drawable);
  });
  if (playerDir === undefined) return;

  const forward = directionDelta(playerDir);
  const targetAngle = Math.atan2(forward.dy, forward.dx);
  const nowMs = performance.now();
  lastRepaint = repaint;
  if (lastSession !== session) {
    // New session (map load, retry): spawn poses snap instead of animating,
    // and entity ids from the previous session no longer mean anything.
    lastSession = session;
    snapPoseTween(poseTween, playerX + 0.5, playerY + 0.5, targetAngle);
    nudgeTween.active = false;
    spriteTweens.clear();
    doorTweens.clear();
    attackPoseUntil.clear();
    lastSeenEnemies.clear();
    deathEffects.length = 0;
    corpses.length = 0;
  } else {
    retargetPoseTween(poseTween, playerX + 0.5, playerY + 0.5, targetAngle, nowMs);
  }

  // Corpses first so anything else on the tile draws over them.
  for (const corpse of corpses) {
    addSprite(scene, corpse.x, corpse.y, SPRITE_CORPSE, CORPSE_SCALE);
  }

  let spritesAnimating = false;
  for (const drawable of drawableScratch) {
    spritesAnimating = addDrawable(scene, map, drawable, playerDir, nowMs) || spritesAnimating;
  }

  // Death sequences play out where the entity last stood, then settle into
  // corpses that persist for the rest of the session.
  for (let i = deathEffects.length - 1; i >= 0; i--) {
    const death = deathEffects[i]!;
    const frame = ((nowMs - death.startMs) / DEATH_FRAME_MS) | 0;
    if (frame >= SHEET_COLUMNS) {
      if (corpses.length >= MAX_CORPSES) corpses.shift();
      corpses.push({ x: death.x, y: death.y });
      deathEffects.splice(i, 1);
      continue;
    }
    addSprite(scene, death.x, death.y, death.base + ROW_DEATH * SHEET_COLUMNS + frame, ACTOR_SCALE);
    spritesAnimating = true;
  }

  samplePoseTween(poseTween, nowMs, poseSample);
  sampleNudgeTween(nudgeTween, nowMs, nudgeSample);
  if ((!poseSample.settled || !nudgeSample.settled || spritesAnimating) && repaint !== undefined) {
    scheduleRepaint(repaint);
  }

  view.render(
    ctx,
    rect,
    scene,
    atlas,
    cameraForAngle(poseSample.x + nudgeSample.dx, poseSample.y + nudgeSample.dy, poseSample.angle),
    headBobFraction(poseSample),
  );

  const targetTone = targetToneFor(drawableScratch, playerX, playerY, forward);
  if (targetTone !== undefined) drawTargetHighlight(ctx, rect, targetTone);
}
