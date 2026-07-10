/**
 * Raycast scene and frame data model.
 *
 * Owns the typed-array layout for map terrain, thin walls, sliding solid
 * walls, and sprites (all mutated in place, no per-frame allocation), plus
 * the scratch buffers a frame needs to hand data between the render passes
 * in {@link ../scene.ts}. Also holds the small pixel-math helpers
 * (shade banding, mip selection, per-channel lighting) shared by every pass.
 */

import type { BakedTexture } from "@/src/render/raycast/textures.ts";
import { SHADE_BANDS, TRANSPARENT_TEXEL } from "@/src/render/raycast/textures.ts";

/** Thin wall plane at `cellX + 0.5`, crossed by rays travelling along x. */
export const THIN_AXIS_X = 0;
/** Thin wall plane at `cellY + 0.5`, crossed by rays travelling along y. */
export const THIN_AXIS_Y = 1;

export type ThinWallAxis = typeof THIN_AXIS_X | typeof THIN_AXIS_Y;

/** Thin wall slides open toward the negative end of its span axis. */
export const THIN_SLIDE_NEG = 0;
/** Thin wall slides open toward the positive end of its span axis. */
export const THIN_SLIDE_POS = 1;
/** Thin wall rises into the ceiling as it opens. */
export const THIN_SLIDE_UP = 2;
/** Thin wall sinks into the floor as it opens. */
export const THIN_SLIDE_DOWN = 3;

export type ThinWallSlide =
  | typeof THIN_SLIDE_NEG
  | typeof THIN_SLIDE_POS
  | typeof THIN_SLIDE_UP
  | typeof THIN_SLIDE_DOWN;

/** Half the horizontal field of view, as camera plane length. */
export const CAMERA_PLANE_LENGTH = 0.66;

export const PROJECTION_PLANE_LENGTH = CAMERA_PLANE_LENGTH;
/**
 * Eye height above the floor in world-tile units. Walls project symmetrically
 * about the horizon (`drawWallColumn` spans `horizon +- lineHeight / 2`),
 * which places the eye halfway up the one-tile-tall walls. Floor and ceiling
 * casting must use the same height (and its mirror, `1 - CAMERA_HEIGHT`, for
 * the ceiling) or plane tile boundaries detach from wall bases and the planes
 * render over-tiled. At 0.5 the mirror is free: one row distance serves both.
 */
export const CAMERA_HEIGHT = 0.5;

export const DEFAULT_SPRITE_CAPACITY = 128;
/** Transparent thin-wall hits recorded per screen column. */
export const MAX_THIN_HITS = 8;
/** Shade bands advance one step per this many tiles of distance. */
const SHADE_BAND_DISTANCE = 1;
export const FIXED_ONE = 65536;

export type RaycastCamera = {
  readonly x: number;
  readonly y: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly planeX: number;
  readonly planeY: number;
};

/** Camera for a cardinal-facing grid actor standing on cell (x, y). */
export function cameraForGridPose(x: number, y: number, dirX: number, dirY: number): RaycastCamera {
  return {
    x: x + 0.5,
    y: y + 0.5,
    dirX,
    dirY,
    planeX: -dirY * CAMERA_PLANE_LENGTH,
    planeY: dirX * CAMERA_PLANE_LENGTH,
  };
}

/** Camera at a world-space point facing `angle` (radians, atan2 convention). */
export function cameraForAngle(x: number, y: number, angle: number): RaycastCamera {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  return {
    x,
    y,
    dirX,
    dirY,
    planeX: -dirY * CAMERA_PLANE_LENGTH,
    planeY: dirX * CAMERA_PLANE_LENGTH,
  };
}

export type RaycastAtlas = {
  /** Column-major (transposed) wall textures, indexed by wall texture id. */
  readonly walls: BakedTexture[];
  /** Row-major floor and ceiling textures. */
  readonly planes: BakedTexture[];
  /** Plane texture id that renders as a distant parallax sky when used as a ceiling. */
  readonly skyPlane?: number;
  /** Optional second sky layer sampled behind `skyPlane` with weaker parallax. */
  readonly skyFarPlane?: number;
  /**
   * Wall texture id for door jamb faces (solid walls flanking an opaque thin
   * wall). When unset, jambs reuse the thin wall's own texture.
   */
  readonly jambWall?: number;
  /** Column-major (transposed) sprite textures. */
  readonly sprites: BakedTexture[];
  /** Column-major sprite emissive masks, indexed by sprite texture id. */
  readonly spriteLightmaps: BakedTexture[];
};

export type RaycastScene = {
  readonly mapWidth: number;
  readonly mapHeight: number;
  /** Wall texture id + 1 per cell; 0 means open. */
  readonly walls: Uint8Array;
  /** Plane texture id + 1 per cell; 0 means untextured (left black). */
  readonly floors: Uint8Array;
  /** Plane texture id + 1 per cell; 0 means untextured (left black). */
  readonly ceilings: Uint8Array;
  /** Per-cell red light multiplier, 255 leaves source texels unchanged. */
  readonly lightRed: Uint8Array;
  /** Per-cell green light multiplier, 255 leaves source texels unchanged. */
  readonly lightGreen: Uint8Array;
  /** Per-cell blue light multiplier, 255 leaves source texels unchanged. */
  readonly lightBlue: Uint8Array;
  /** Index into the thin-wall arrays per cell; -1 means none. */
  readonly thinByCell: Int32Array;
  thinCount: number;
  readonly thinTex: Int16Array;
  readonly thinAxis: Uint8Array;
  /** How the thin wall slides open; one of the THIN_SLIDE_* constants. */
  readonly thinSlide: Uint8Array;
  /** Openness 0 (closed) to 1 (fully open). */
  readonly thinOffset: Float32Array;
  readonly thinCell: Int32Array;
  /** Index into sliding solid-wall arrays per cell; -1 means none. */
  readonly slidingSolidByCell: Int32Array;
  slidingSolidCount: number;
  readonly slidingSolidTex: Int16Array;
  readonly slidingSolidAxis: Uint8Array;
  readonly slidingSolidSlide: Uint8Array;
  readonly slidingSolidOffset: Float32Array;
  readonly slidingSolidCell: Int32Array;
  spriteCount: number;
  readonly spriteX: Float64Array;
  readonly spriteY: Float64Array;
  readonly spriteTex: Int16Array;
  readonly spriteWidth: Float32Array;
  readonly spriteHeight: Float32Array;
  /** Vertical world-tile offset above the floor for floor-anchored sprites. */
  readonly spriteElevation: Float32Array;
  /** Optional sprite health bar values; max 0 means no bar. */
  readonly spriteHealthCurrent: Uint8Array;
  readonly spriteHealthMax: Uint8Array;
};

export type RaycastSceneOptions = {
  readonly spriteCapacity?: number;
  readonly thinCapacity?: number;
};

export function createScene(mapWidth: number, mapHeight: number, options: RaycastSceneOptions = {}): RaycastScene {
  const cellCount = mapCellCount(mapWidth, mapHeight);
  const spriteCapacity = checkedCapacity(
    options.spriteCapacity ?? Math.max(DEFAULT_SPRITE_CAPACITY, cellCount),
    "Sprite",
  );
  const thinCapacity = checkedCapacity(options.thinCapacity ?? cellCount, "Thin wall");
  const lightRed = new Uint8Array(cellCount);
  const lightGreen = new Uint8Array(cellCount);
  const lightBlue = new Uint8Array(cellCount);
  lightRed.fill(255);
  lightGreen.fill(255);
  lightBlue.fill(255);

  return {
    mapWidth,
    mapHeight,
    walls: new Uint8Array(cellCount),
    floors: new Uint8Array(cellCount),
    ceilings: new Uint8Array(cellCount),
    lightRed,
    lightGreen,
    lightBlue,
    thinByCell: new Int32Array(cellCount).fill(-1),
    thinCount: 0,
    thinTex: new Int16Array(thinCapacity),
    thinAxis: new Uint8Array(thinCapacity),
    thinSlide: new Uint8Array(thinCapacity),
    thinOffset: new Float32Array(thinCapacity),
    thinCell: new Int32Array(thinCapacity),
    slidingSolidByCell: new Int32Array(cellCount).fill(-1),
    slidingSolidCount: 0,
    slidingSolidTex: new Int16Array(cellCount),
    slidingSolidAxis: new Uint8Array(cellCount),
    slidingSolidSlide: new Uint8Array(cellCount),
    slidingSolidOffset: new Float32Array(cellCount),
    slidingSolidCell: new Int32Array(cellCount),
    spriteCount: 0,
    spriteX: new Float64Array(spriteCapacity),
    spriteY: new Float64Array(spriteCapacity),
    spriteTex: new Int16Array(spriteCapacity),
    spriteWidth: new Float32Array(spriteCapacity),
    spriteHeight: new Float32Array(spriteCapacity),
    spriteElevation: new Float32Array(spriteCapacity),
    spriteHealthCurrent: new Uint8Array(spriteCapacity),
    spriteHealthMax: new Uint8Array(spriteCapacity),
  };
}

function mapCellCount(mapWidth: number, mapHeight: number): number {
  if (!Number.isSafeInteger(mapWidth) || mapWidth < 0) {
    throw new Error(`Map width must be a non-negative safe integer, received ${mapWidth}.`);
  }
  if (!Number.isSafeInteger(mapHeight) || mapHeight < 0) {
    throw new Error(`Map height must be a non-negative safe integer, received ${mapHeight}.`);
  }
  return checkedCapacity(mapWidth * mapHeight, "Map cell");
}

function checkedCapacity(capacity: number, label: string): number {
  if (!Number.isSafeInteger(capacity) || capacity < 0) {
    throw new Error(`${label} capacity must be a non-negative safe integer, received ${capacity}.`);
  }
  return capacity;
}

/** Remove all thin walls and sprites; static terrain arrays are untouched. */
export function clearSceneDynamic(scene: RaycastScene): void {
  for (let i = 0; i < scene.thinCount; i++) {
    scene.thinByCell[scene.thinCell[i]!] = -1;
  }
  scene.thinCount = 0;
  for (let i = 0; i < scene.slidingSolidCount; i++) {
    scene.slidingSolidByCell[scene.slidingSolidCell[i]!] = -1;
  }
  scene.slidingSolidCount = 0;
  scene.spriteCount = 0;
}

export function addSlidingSolidWall(
  scene: RaycastScene,
  cellX: number,
  cellY: number,
  textureId: number,
  axis: ThinWallAxis,
  slide: ThinWallSlide = THIN_SLIDE_NEG,
  offset = 0,
): void {
  const cell = cellY * scene.mapWidth + cellX;
  if (cell < 0 || cell >= scene.slidingSolidByCell.length) return;
  if (scene.slidingSolidCount >= scene.slidingSolidTex.length) {
    throw new Error(
      `Raycast scene sliding solid wall capacity ${scene.slidingSolidTex.length} exceeded while adding cell (${cellX}, ${cellY}).`,
    );
  }

  const index = scene.slidingSolidCount++;
  scene.slidingSolidByCell[cell] = index;
  scene.slidingSolidTex[index] = textureId;
  scene.slidingSolidAxis[index] = axis;
  scene.slidingSolidSlide[index] = slide;
  scene.slidingSolidOffset[index] = offset;
  scene.slidingSolidCell[index] = cell;
}

export function addThinWall(
  scene: RaycastScene,
  cellX: number,
  cellY: number,
  textureId: number,
  axis: ThinWallAxis,
  slide: ThinWallSlide = THIN_SLIDE_NEG,
  offset = 0,
): void {
  const cell = cellY * scene.mapWidth + cellX;
  if (cell < 0 || cell >= scene.thinByCell.length) return;
  if (scene.thinCount >= scene.thinTex.length) {
    throw new Error(
      `Raycast scene thin wall capacity ${scene.thinTex.length} exceeded while adding cell (${cellX}, ${cellY}).`,
    );
  }

  const index = scene.thinCount++;
  scene.thinByCell[cell] = index;
  scene.thinTex[index] = textureId;
  scene.thinAxis[index] = axis;
  scene.thinSlide[index] = slide;
  scene.thinOffset[index] = offset;
  scene.thinCell[index] = cell;
}

export function addSprite(
  scene: RaycastScene,
  x: number,
  y: number,
  textureId: number,
  height: number,
  elevation = 0,
  width = height,
  healthCurrent = 0,
  healthMax = 0,
): void {
  if (scene.spriteCount >= scene.spriteX.length) {
    throw new Error(
      `Raycast scene sprite capacity ${scene.spriteX.length} exceeded while adding sprite at (${x}, ${y}).`,
    );
  }
  const index = scene.spriteCount++;
  scene.spriteX[index] = x;
  scene.spriteY[index] = y;
  scene.spriteTex[index] = textureId;
  scene.spriteWidth[index] = width;
  scene.spriteHeight[index] = height;
  scene.spriteElevation[index] = elevation;
  scene.spriteHealthCurrent[index] = healthCurrent;
  scene.spriteHealthMax[index] = healthMax;
}

export type RaycastFrame = {
  readonly width: number;
  readonly height: number;
  /** Packed RGBA pixels, row-major, byte order matching ImageData. */
  readonly pixels: Uint32Array;
  /** Perpendicular distance of the nearest ray-stopping hit per column. */
  readonly zbuffer: Float64Array;
  readonly thinHitDist: Float64Array;
  readonly thinHitTex: Int16Array;
  readonly thinHitTexX: Uint8Array;
  readonly thinHitBand: Uint8Array;
  readonly thinHitLightRed: Uint8Array;
  readonly thinHitLightGreen: Uint8Array;
  readonly thinHitLightBlue: Uint8Array;
  readonly thinHitSlide: Uint8Array;
  readonly thinHitOffset: Float32Array;
  readonly thinHitCount: Uint8Array;
  readonly thinHitCursor: Int8Array;
  readonly spriteOrder: Int32Array;
  readonly spriteDepth: Float64Array;
  readonly spriteScreenX: Float64Array;
};

/** Pass `pixels` to render straight into an ImageData-backed buffer. */
export function createFrame(
  width: number,
  height: number,
  pixels?: Uint32Array,
  spriteCapacity = DEFAULT_SPRITE_CAPACITY,
): RaycastFrame {
  const buffer = pixels ?? new Uint32Array(width * height);
  if (buffer.length !== width * height) {
    throw new Error(`Pixel buffer length ${buffer.length} does not match ${width}x${height}.`);
  }
  const checkedSpriteCapacity = checkedCapacity(spriteCapacity, "Sprite scratch");
  return {
    width,
    height,
    pixels: buffer,
    zbuffer: new Float64Array(width),
    thinHitDist: new Float64Array(width * MAX_THIN_HITS),
    thinHitTex: new Int16Array(width * MAX_THIN_HITS),
    thinHitTexX: new Uint8Array(width * MAX_THIN_HITS),
    thinHitBand: new Uint8Array(width * MAX_THIN_HITS),
    thinHitLightRed: new Uint8Array(width * MAX_THIN_HITS),
    thinHitLightGreen: new Uint8Array(width * MAX_THIN_HITS),
    thinHitLightBlue: new Uint8Array(width * MAX_THIN_HITS),
    thinHitSlide: new Uint8Array(width * MAX_THIN_HITS),
    thinHitOffset: new Float32Array(width * MAX_THIN_HITS),
    thinHitCount: new Uint8Array(width),
    thinHitCursor: new Int8Array(width),
    spriteOrder: new Int32Array(checkedSpriteCapacity),
    spriteDepth: new Float64Array(checkedSpriteCapacity),
    spriteScreenX: new Float64Array(checkedSpriteCapacity),
  };
}

/** Throws if `scene` has more sprites than `frame`'s scratch buffers can sort. */
export function assertFrameCapacity(frame: RaycastFrame, scene: RaycastScene): void {
  if (scene.spriteCount <= frame.spriteOrder.length) return;
  throw new Error(
    `Raycast frame sprite scratch capacity ${frame.spriteOrder.length} cannot render ${scene.spriteCount} scene sprites.`,
  );
}

export function shadeBand(distance: number): number {
  const band = (distance / SHADE_BAND_DISTANCE) | 0;
  return band >= SHADE_BANDS ? SHADE_BANDS - 1 : band;
}

export function offsetShadeBand(band: number, offset: number): number {
  band += offset;
  return band >= SHADE_BANDS ? SHADE_BANDS - 1 : band;
}

export function mipLevelForTexelsPerPixel(texelsPerPixel: number): number {
  if (texelsPerPixel >= 8) return 3;
  if (texelsPerPixel >= 4) return 2;
  if (texelsPerPixel >= 2) return 1;
  return 0;
}

export function lightTexel(texel: number, red: number, green: number, blue: number): number {
  if (texel === TRANSPARENT_TEXEL || (red === 255 && green === 255 && blue === 255)) return texel;
  return ((texel & 0xff000000) |
    (((texel & 0xff) * red / 255) | 0) |
    (((((texel >>> 8) & 0xff) * green / 255) | 0) << 8) |
    (((((texel >>> 16) & 0xff) * blue / 255) | 0) << 16)) >>> 0;
}

/** Blend `src` over `dst` using src's alpha. Output alpha is always opaque. */
export function blendTexel(src: number, dst: number): number {
  const alpha = src >>> 24;
  if (alpha === 0) return dst;
  if (alpha === 255) return (src | 0xff000000) >>> 0;
  const inv = 255 - alpha;
  return (0xff000000 |
    ((((src & 0xff) * alpha + (dst & 0xff) * inv) / 255) | 0) |
    ((((((src >>> 8) & 0xff) * alpha + ((dst >>> 8) & 0xff) * inv) / 255) | 0) << 8) |
    ((((((src >>> 16) & 0xff) * alpha + ((dst >>> 16) & 0xff) * inv) / 255) | 0) << 16)) >>> 0;
}
