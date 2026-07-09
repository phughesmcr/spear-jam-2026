import { spriteAppearances } from "@/src/content/sprites.ts";
import {
  BarrierTexture,
  type BarrierTexture as BarrierTextureType,
  type CeilingTexture,
  type FloorTexture,
  KeyColor,
  SKY_CEILING_TEXTURE,
  TexturePack,
  type TexturePackRef,
  type WallTexture,
} from "@/src/map/map.ts";
import { parseTexturePackRef, TEXTURE_PACK_COLUMNS, TEXTURE_PACK_ROWS } from "@/src/map/terrain_palettes.ts";
import { createImageAsset, type ImageAsset, loadedImage, preloadImageAssets } from "@/src/render/assets.ts";
import type { RaycastAtlas } from "@/src/render/raycast/scene.ts";
import {
  type BakedTexture,
  bakeSolidTexture,
  bakeTexture,
  TEX_SIZE,
  type TexelSource,
} from "@/src/render/raycast/textures.ts";

type AtlasLayer = "walls" | "planes" | "sprites" | "spriteLightmaps";

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

export type AssetCatalog = {
  readonly managedAssets: readonly ManagedAsset[];
  readonly texturePackAssets: Readonly<Record<TexturePack, TexturePackAsset>>;
};

export type FirstPersonAssetState = {
  readonly atlas: RaycastAtlas;
  readonly assetCatalog: AssetCatalog;
  readonly packWallSlots: Map<TexturePackRef, number>;
  readonly packPlaneSlots: Map<TexturePackRef, number>;
  readonly spriteCropBySlot: Map<number, ContentCrop | undefined>;
  readonly spriteCropReady: Set<number>;
  readonly spriteAspectBySlot: Map<number, number>;
  rasterCanvas: OffscreenCanvas | undefined;
};

const WALL_TEX = 0;
const DOOR_TEX = 1;
const DOOR_TEX_BY_COLOR: Readonly<Record<KeyColor, number>> = {
  [KeyColor.Red]: 2,
  [KeyColor.Blue]: 3,
  [KeyColor.Yellow]: 4,
};
const BARRIER_TEX_BY_TEXTURE: Readonly<Record<BarrierTextureType, number>> = {
  [BarrierTexture.Bars]: 5,
  [BarrierTexture.Glass]: 6,
};
const FIRST_PACK_WALL_TEX = 7;

const FLOOR_TEX = 0;
const CEILING_TEX = 1;
const SKY_TEX = 2;
const SKY_FAR_TEX = 3;
const FIRST_PACK_PLANE_TEX = 4;

/** Enemy sheets are 4x4: rows idle/walk/attack/death, columns per view. */
export const ENEMY_SHEET_COLUMNS = 4;
const ENEMY_SHEET_SLOTS = 16;

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
function enemySheetTargets(
  baseSlot: number,
  layer: "sprites" | "spriteLightmaps" = "sprites",
): readonly BakeTargetInput[] {
  const targets: BakeTargetInput[] = [];
  for (let row = 0; row < ENEMY_SHEET_COLUMNS; row++) {
    for (let column = 0; column < ENEMY_SHEET_COLUMNS; column++) {
      targets.push({
        layer,
        slot: baseSlot + row * ENEMY_SHEET_COLUMNS + column,
        frame: [column / 4, row / 4, 1 / 4, 1 / 4],
      });
    }
  }
  return targets;
}

function spriteManagedAssets(): readonly ManagedAsset[] {
  const assets: ManagedAsset[] = [];
  for (const appearance of spriteAppearances()) {
    const slot = appearance.firstPersonSlot;
    const asset = appearance.asset;
    if (slot === undefined || asset === undefined) continue;

    if (appearance.enemySheet) {
      assets.push(managedAsset(asset.src, enemySheetTargets(slot), asset.cropFrame));
      if (asset.lightmapSrc !== undefined) {
        assets.push(managedAsset(asset.lightmapSrc, enemySheetTargets(slot, "spriteLightmaps")));
      }
      continue;
    }

    const frame = asset.frame === undefined ? {} : { frame: asset.frame };
    assets.push(managedAsset(asset.src, [{ layer: "sprites", slot, ...frame }]));
    if (asset.lightmapSrc !== undefined) {
      assets.push(managedAsset(asset.lightmapSrc, [{ layer: "spriteLightmaps", slot, ...frame }]));
    }
  }
  return assets;
}

export function createAssetCatalog(): AssetCatalog {
  const texturePackAssets: Readonly<Record<TexturePack, TexturePackAsset>> = {
    [TexturePack.Pack1]: texturePackAsset(new URL("../../assets/game/textures/pack1.png", import.meta.url).href),
    [TexturePack.Pack2]: texturePackAsset(new URL("../../assets/game/textures/pack2.png", import.meta.url).href),
    [TexturePack.Pack3]: texturePackAsset(new URL("../../assets/game/textures/pack3.png", import.meta.url).href),
  };

  // Texture asset URLs must be fully static `new URL` literals so Vite can resolve them.
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
    managedAsset(new URL("../../assets/game/textures/sky.png", import.meta.url).href, [
      { layer: "planes", slot: SKY_TEX, frame: [0, 0, 0.5, 1] },
      { layer: "planes", slot: SKY_FAR_TEX, frame: [0.5, 0, 0.5, 1] },
    ]),
    managedAsset(new URL("../../assets/game/textures/bars.png", import.meta.url).href, [
      { layer: "walls", slot: BARRIER_TEX_BY_TEXTURE[BarrierTexture.Bars] },
    ]),
    managedAsset(new URL("../../assets/game/textures/glass.png", import.meta.url).href, [
      { layer: "walls", slot: BARRIER_TEX_BY_TEXTURE[BarrierTexture.Glass] },
    ]),
    ...spriteManagedAssets(),
    texturePackAssets[TexturePack.Pack1],
    texturePackAssets[TexturePack.Pack2],
    texturePackAssets[TexturePack.Pack3],
  ];

  return { managedAssets, texturePackAssets };
}

export function preloadAssetCatalog(
  document: Document,
  catalog: AssetCatalog,
  onAssetLoad?: () => void,
): Promise<void> {
  return preloadImageAssets(
    document,
    catalog.managedAssets.map((entry) => entry.asset),
    onAssetLoad,
  );
}

export function buildAtlas(): RaycastAtlas {
  const walls: BakedTexture[] = [];
  walls[WALL_TEX] = bakeSolidTexture(90, 95, 104);
  walls[DOOR_TEX] = bakeSolidTexture(154, 106, 58);
  walls[DOOR_TEX_BY_COLOR[KeyColor.Red]] = bakeSolidTexture(177, 75, 75);
  walls[DOOR_TEX_BY_COLOR[KeyColor.Blue]] = bakeSolidTexture(79, 141, 247);
  walls[DOOR_TEX_BY_COLOR[KeyColor.Yellow]] = bakeSolidTexture(244, 211, 94);
  walls[BARRIER_TEX_BY_TEXTURE[BarrierTexture.Bars]] = bakeBarrier(BarrierTexture.Bars);
  walls[BARRIER_TEX_BY_TEXTURE[BarrierTexture.Glass]] = bakeBarrier(BarrierTexture.Glass);

  const planes: BakedTexture[] = [];
  planes[FLOOR_TEX] = bakeSolidTexture(35, 40, 50);
  planes[CEILING_TEX] = bakeSolidTexture(16, 18, 23);
  planes[SKY_TEX] = bakeSky();
  planes[SKY_FAR_TEX] = bakeSkyFar();

  const sprites: BakedTexture[] = [];
  const spriteLightmaps: BakedTexture[] = [];
  for (const appearance of spriteAppearances()) {
    const slot = appearance.firstPersonSlot;
    const color = appearance.fallbackColor;
    if (slot === undefined || color === undefined) continue;
    if (appearance.enemySheet) {
      fillEnemyFallback(sprites, slot, color);
      continue;
    }
    sprites[slot] = bakeOrb(color);
  }

  return { walls, planes, skyPlane: SKY_TEX, skyFarPlane: SKY_FAR_TEX, sprites, spriteLightmaps };
}

function fillEnemyFallback(sprites: BakedTexture[], baseSlot: number, color: string): void {
  const orb = bakeOrb(color);
  for (let slot = 0; slot < ENEMY_SHEET_SLOTS; slot++) {
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

function skySource(): TexelSource {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++) {
    const vertical = y / (TEX_SIZE - 1);
    for (let x = 0; x < TEX_SIZE; x++) {
      const index = (y * TEX_SIZE + x) * 4;
      const grid = x % 16 === 0 || (y > TEX_SIZE * 0.7 && y % 12 === 0);
      const star = ((x * 73 + y * 151) % 503 === 0) && y < TEX_SIZE * 0.62;
      data[index] = star ? 160 : grid ? 36 : 8 + vertical * 24;
      data[index + 1] = star ? 240 : grid ? 118 : 20 + vertical * 54;
      data[index + 2] = star ? 255 : grid ? 196 : 58 + vertical * 116;
      data[index + 3] = 255;
    }
  }
  return { width: TEX_SIZE, height: TEX_SIZE, data };
}

function bakeSky(): BakedTexture {
  return bakeTexture(skySource());
}

function bakeSkyFar(): BakedTexture {
  return bakeTexture(skyFarSource());
}

function skyFarSource(): TexelSource {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++) {
    const vertical = y / (TEX_SIZE - 1);
    for (let x = 0; x < TEX_SIZE; x++) {
      const index = (y * TEX_SIZE + x) * 4;
      const band = ((x + y * 2) >> 4) & 3;
      data[index] = band === 0 ? 44 : 10 + vertical * 44;
      data[index + 1] = band === 0 ? 36 : 14 + vertical * 44;
      data[index + 2] = band === 0 ? 78 : 48 + vertical * 86;
      data[index + 3] = 255;
    }
  }
  return { width: TEX_SIZE, height: TEX_SIZE, data };
}

function bakeBarrier(texture: BarrierTextureType): BakedTexture {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      if (!barrierPixelOpaque(texture, x, y)) continue;
      const index = (y * TEX_SIZE + x) * 4;
      if (texture === BarrierTexture.Bars) {
        data[index] = 148;
        data[index + 1] = 163;
        data[index + 2] = 184;
      } else {
        data[index] = 125;
        data[index + 1] = 211;
        data[index + 2] = 252;
      }
      data[index + 3] = 255;
    }
  }
  return bakeTexture({ width: TEX_SIZE, height: TEX_SIZE, data }, { transpose: true });
}

function barrierPixelOpaque(texture: BarrierTextureType, x: number, y: number): boolean {
  if (texture === BarrierTexture.Bars) {
    return x < 7 || x > TEX_SIZE - 8 || y < 7 || y > TEX_SIZE - 8 || x % 24 < 7;
  }
  return x < 4 || x > TEX_SIZE - 5 || y < 4 || y > TEX_SIZE - 5 || x === y || x + y === TEX_SIZE - 1 ||
    (x > 76 && x < 84 && y > 16 && y < 112);
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
export type ContentCrop = {
  readonly left: number;
  readonly top: number;
  readonly size: number;
};

/**
 * Draw (a frame of) the image at TEX_SIZE square, optionally zoomed to a crop within
 * the frame, and hand back its pixels for baking.
 */
function rasterize(
  state: FirstPersonAssetState,
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

function sourceFrameAspect(image: HTMLImageElement, frame: SourceFrame | undefined): number {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const sourceWidth = (frame?.[2] ?? 1) * imageWidth;
  const sourceHeight = (frame?.[3] ?? 1) * imageHeight;
  if (sourceWidth <= 0 || sourceHeight <= 0) return 1;
  return sourceWidth / sourceHeight;
}

/**
 * Measure a frame's opaque bounding box, expanded to a square with margin
 * that keeps the content's feet at the bottom edge, so sprites fill their
 * billboard quad instead of floating in sheet padding.
 */
function measureContentCrop(
  state: FirstPersonAssetState,
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

export function bakeLoadedAssets(
  state: FirstPersonAssetState,
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
      if (target.layer === "spriteLightmaps") {
        if (!state.spriteCropReady.has(target.slot)) continue;
        crop = state.spriteCropBySlot.get(target.slot);
      } else if (target.layer === "sprites") {
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
      if (target.layer === "sprites") {
        state.spriteCropBySlot.set(target.slot, crop);
        state.spriteCropReady.add(target.slot);
        state.spriteAspectBySlot.set(target.slot, sourceFrameAspect(image, target.frame));
      }
      target.baked = true;
    }
  }
}

function texturePackFrame(
  texture: TexturePackRef,
  entry: TexturePackAsset,
): SourceFrame {
  const { column, row } = parseTexturePackRef(texture);
  return [column / entry.columns, row / entry.rows, 1 / entry.columns, 1 / entry.rows];
}

function texturePackSlot(
  state: FirstPersonAssetState,
  layer: "walls" | "planes",
  texture: TexturePackRef,
  fallback: BakedTexture,
): number {
  const slots = layer === "walls" ? state.packWallSlots : state.packPlaneSlots;
  const existing = slots.get(texture);
  if (existing !== undefined) return existing;

  const { pack } = parseTexturePackRef(texture);
  const slot = (layer === "walls" ? FIRST_PACK_WALL_TEX : FIRST_PACK_PLANE_TEX) + slots.size;
  const entry = state.assetCatalog.texturePackAssets[pack];
  slots.set(texture, slot);
  state.atlas[layer][slot] = fallback;
  addBakeTarget(entry, { layer, slot, frame: texturePackFrame(texture, entry) });
  return slot;
}

export function wallTextureSlot(state: FirstPersonAssetState, texture: WallTexture): number {
  if (texture === "wall") return WALL_TEX;
  return texturePackSlot(state, "walls", texture, state.atlas.walls[WALL_TEX]!);
}

export function floorTextureSlot(state: FirstPersonAssetState, texture: FloorTexture): number {
  if (texture === "floor") return FLOOR_TEX;
  return texturePackSlot(state, "planes", texture, state.atlas.planes[FLOOR_TEX]!);
}

export function ceilingTextureSlot(state: FirstPersonAssetState, texture: CeilingTexture): number {
  if (texture === "ceiling") return CEILING_TEX;
  if (texture === SKY_CEILING_TEXTURE) return SKY_TEX;
  return texturePackSlot(state, "planes", texture, state.atlas.planes[CEILING_TEX]!);
}

export function barrierTextureSlot(texture: BarrierTextureType): number {
  return BARRIER_TEX_BY_TEXTURE[texture];
}

export function doorTexture(locked: boolean, color: KeyColor | undefined): number {
  if (locked && color !== undefined) return DOOR_TEX_BY_COLOR[color];
  return DOOR_TEX;
}
