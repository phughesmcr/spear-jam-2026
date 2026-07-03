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
import { KeyColor, mapDimensions, terrainAt } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";
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
} from "@/src/render/raycast/scene.ts";
import type { RaycastAtlas, RaycastScene, ThinWallAxis } from "@/src/render/raycast/scene.ts";
import { bakeSolidTexture, bakeTexture, TEX_SIZE } from "@/src/render/raycast/textures.ts";
import type { BakedTexture, TexelSource } from "@/src/render/raycast/textures.ts";
import {
  createNudgeTween,
  createPoseTween,
  createSpriteTween,
  headBobFraction,
  retargetPoseTween,
  retargetSpriteTween,
  sampleNudgeTween,
  samplePoseTween,
  sampleSpriteTween,
  snapPoseTween,
  startNudgeTween,
} from "@/src/render/raycast/tween.ts";
import type { NudgeSample, PoseSample, SpritePoint, SpriteTween } from "@/src/render/raycast/tween.ts";
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
};

type ManagedAsset = {
  readonly asset: ImageAsset;
  readonly targets: readonly BakeTarget[];
  baked: boolean;
};

const WALL_TEX = 0;
const DOOR_TEX = 1;
const DOOR_TEX_BY_COLOR: Readonly<Record<KeyColor, number>> = {
  [KeyColor.Red]: 2,
  [KeyColor.Blue]: 3,
  [KeyColor.Yellow]: 4,
};

const FLOOR_TEX = 0;
const CEILING_TEX = 1;

/** Enemy sheets bake one sprite per view column; ids are base + column. */
const SPRITE_VIEW_COLUMNS = 4;
/** Relative facing (entity dir - camera dir) to enemy sheet column. */
const REL_DIR_TO_SHEET_COLUMN: readonly [number, number, number, number] = [2, 3, 0, 1];

const SPRITE_DOG = 0;
const SPRITE_GUNSLINGER = 4;
const SPRITE_NEOPHYTE = 8;
const SPRITE_SENTINEL = 12;
const SPRITE_ACOLYTE = 16;
const SPRITE_TERMINAL = 20;
const SPRITE_HEALTH = 21;
const SPRITE_KEY_BY_COLOR: Readonly<Record<KeyColor, number>> = {
  [KeyColor.Red]: 22,
  [KeyColor.Blue]: 23,
  [KeyColor.Yellow]: 24,
};
const SPRITE_WEAPON_2 = 25;
const SPRITE_WEAPON_3 = 26;
const SPRITE_NPC = 27;
const SPRITE_UPLINK_CODE = 28;
const FIRST_ORB_SPRITE = 29;

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

/** Tints are relative to mid-grey so the wall texture keeps its detail. */
const DOOR_TINT: readonly [number, number, number] = [1.2, 0.83, 0.45];
const DOOR_TINTS_BY_COLOR: Readonly<Record<KeyColor, readonly [number, number, number]>> = {
  [KeyColor.Red]: [1.55, 0.55, 0.5],
  [KeyColor.Blue]: [0.6, 1.05, 1.85],
  [KeyColor.Yellow]: [1.7, 1.5, 0.65],
};

function managedAsset(src: string, targets: readonly BakeTarget[]): ManagedAsset {
  return { asset: createImageAsset(src), targets, baked: false };
}

/** Four directional sprites from the idle row of a 4x4 enemy sheet. */
function enemySheetTargets(baseSlot: number): readonly BakeTarget[] {
  const targets: BakeTarget[] = [];
  for (let column = 0; column < SPRITE_VIEW_COLUMNS; column++) {
    targets.push({ layer: "sprites", slot: baseSlot + column, frame: [column / 4, 0, 1 / 4, 1 / 4] });
  }
  return targets;
}

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
  ),
  managedAsset(
    new URL("../../assets/game/sprites/gigabit_gun_slinger.png", import.meta.url).href,
    enemySheetTargets(SPRITE_GUNSLINGER),
  ),
  managedAsset(
    new URL("../../assets/game/sprites/network_neophyte.png", import.meta.url).href,
    enemySheetTargets(SPRITE_NEOPHYTE),
  ),
  managedAsset(
    new URL("../../assets/game/sprites/system_sentinel.png", import.meta.url).href,
    enemySheetTargets(SPRITE_SENTINEL),
  ),
  managedAsset(
    new URL("../../assets/game/sprites/agentic_acolyte.png", import.meta.url).href,
    enemySheetTargets(SPRITE_ACOLYTE),
  ),
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

  return { walls, planes, sprites };
}

function fillEnemyFallback(sprites: BakedTexture[], baseSlot: number, color: string): void {
  const orb = bakeOrb(color);
  for (let column = 0; column < SPRITE_VIEW_COLUMNS; column++) {
    sprites[baseSlot + column] = orb;
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
const orbSpriteByColor = new Map<string, number>();
const drawableScratch: DrawableEntity[] = [];
let rasterCanvas: OffscreenCanvas | undefined;

const poseTween = createPoseTween();
const poseSample: PoseSample = { x: 0, y: 0, angle: 0, progress: 1, moving: false, settled: true };
const nudgeTween = createNudgeTween();
const nudgeSample: NudgeSample = { dx: 0, dy: 0, settled: true };
const spriteTweens = new Map<DrawableEntity["entity"], SpriteTween>();
const spritePoint: SpritePoint = { x: 0, y: 0, settled: true };
let poseTweenMap: GameMap | undefined;
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

/**
 * Draw (a frame of) the image at 64x64 and hand back its pixels for baking.
 * With `cropToContent`, redraws zoomed to the opaque bounding box expanded to
 * a square that keeps the content's feet at the bottom edge, so sprites fill
 * their billboard quad instead of floating in sheet padding.
 */
function rasterize(
  image: HTMLImageElement,
  frame: SourceFrame | undefined,
  cropToContent: boolean,
): TexelSource | undefined {
  rasterCanvas ??= new OffscreenCanvas(TEX_SIZE, TEX_SIZE);
  const context = rasterCanvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return undefined;

  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const sourceX = (frame?.[0] ?? 0) * imageWidth;
  const sourceY = (frame?.[1] ?? 0) * imageHeight;
  const sourceWidth = (frame?.[2] ?? 1) * imageWidth;
  const sourceHeight = (frame?.[3] ?? 1) * imageHeight;

  const draw = (x: number, y: number, width: number, height: number): ImageData => {
    context.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
    context.imageSmoothingEnabled = true;
    context.drawImage(image, x, y, width, height, 0, 0, TEX_SIZE, TEX_SIZE);
    return context.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
  };

  const pixels = draw(sourceX, sourceY, sourceWidth, sourceHeight);
  if (!cropToContent) return pixels;

  const bounds = opaqueBounds(pixels);
  if (bounds === undefined) return pixels;

  const margin = 1;
  const size = Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top) + 1 + margin * 2;
  let cropLeft = (bounds.left + bounds.right + 1) / 2 - size / 2;
  let cropTop = bounds.bottom + 1 + margin - size;
  if (cropLeft < 0) cropLeft = 0;
  if (cropLeft + size > TEX_SIZE) cropLeft = TEX_SIZE - size;
  if (cropTop < 0) cropTop = 0;
  if (cropTop + size > TEX_SIZE) cropTop = TEX_SIZE - size;

  const scaleX = sourceWidth / TEX_SIZE;
  const scaleY = sourceHeight / TEX_SIZE;
  return draw(sourceX + cropLeft * scaleX, sourceY + cropTop * scaleY, size * scaleX, size * scaleY);
}

function bakeLoadedAssets(ctx: CanvasRenderingContext2D, onAssetLoad?: () => void): void {
  for (const entry of MANAGED_ASSETS) {
    if (entry.baked) continue;
    const image = loadedImage(ctx, entry.asset, onAssetLoad);
    if (image === undefined) continue;

    for (const target of entry.targets) {
      const source = rasterize(image, target.frame, target.layer === "sprites");
      if (source === undefined) continue;
      atlas[target.layer][target.slot] = bakeTexture(source, {
        transpose: target.layer !== "planes",
        ...(target.tint === undefined ? {} : { tint: target.tint }),
      });
    }
    entry.baked = true;
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

function sceneForMap(map: GameMap): RaycastScene {
  const cached = sceneByMap.get(map);
  if (cached !== undefined) return cached;

  const { width, height } = mapDimensions(map);
  const scene = createScene(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = y * width + x;
      const terrain = terrainAt(map, x, y);
      // Missing terrain blocks movement, so render it as wall to match.
      if (terrain === undefined || terrain.blocking === true) {
        scene.walls[cell] = WALL_TEX + 1;
        continue;
      }
      scene.floors[cell] = FLOOR_TEX + 1;
      scene.ceilings[cell] = CEILING_TEX + 1;
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

function enemySprite(archetype: EnemyArchetype, dir: number, cameraDir: CardinalDirection): number {
  const relative = (normalizeDirection(dir) - cameraDir + 4) & 3;
  return ENEMY_SPRITES[archetype] + REL_DIR_TO_SHEET_COLUMN[relative]!;
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
      const sprite = drawable.enemyArchetype === undefined ?
        SPRITE_NPC :
        enemySprite(drawable.enemyArchetype, drawable.dir, cameraDir);
      tweenedSpritePosition(drawable, nowMs);
      addSprite(scene, spritePoint.x, spritePoint.y, sprite, ACTOR_SCALE);
      return !spritePoint.settled;
    }
    case DrawableKind.Door:
      if (drawable.open) return false;
      addThinWall(
        scene,
        drawable.x,
        drawable.y,
        doorTexture(drawable.locked, drawable.color),
        doorAxis(map, drawable.x, drawable.y),
      );
      return false;
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
  bakeLoadedAssets(ctx, repaint);

  const map = session.map;
  const scene = sceneForMap(map);
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
  if (poseTweenMap !== map) {
    // New map (or first render): spawn poses snap instead of animating,
    // and entity ids from the previous session no longer mean anything.
    poseTweenMap = map;
    snapPoseTween(poseTween, playerX + 0.5, playerY + 0.5, targetAngle);
    nudgeTween.active = false;
    spriteTweens.clear();
  } else {
    retargetPoseTween(poseTween, playerX + 0.5, playerY + 0.5, targetAngle, nowMs);
  }

  let spritesAnimating = false;
  for (const drawable of drawableScratch) {
    spritesAnimating = addDrawable(scene, map, drawable, playerDir, nowMs) || spritesAnimating;
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
}
