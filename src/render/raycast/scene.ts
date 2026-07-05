/**
 * Software raycast renderer core.
 *
 * Renders a grid scene (textured walls, floors, ceilings, thin walls such as
 * doors or grates, and billboard sprites) into a packed-RGBA Uint32 pixel
 * buffer. Pure typed-array code with no DOM dependencies and no per-frame
 * allocation: every scratch buffer lives on {@link RaycastFrame} or
 * {@link RaycastScene} and is reused across frames.
 *
 * Pipeline per frame:
 *   1. Floor and ceiling by horizontal scanline (distance and shade constant
 *      per row; one world step per pixel textures both planes).
 *   2. Walls by DDA per column into a 1D depth buffer, with fixed-point
 *      texture stepping. Opaque thin walls terminate rays like solid walls;
 *      transparent thin-wall hits stack per column for pass 3.
 *   3. Sprites back-to-front, merged per column with the stacked transparent
 *      stripes so grates and see-through faces composite correctly.
 */

import {
  type BakedTexture,
  type BakedTextureMip,
  SHADE_BANDS,
  TEX_MASK,
  TEX_SHIFT,
  TEX_SIZE,
  TRANSPARENT_TEXEL,
} from "@/src/render/raycast/textures.ts";

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

const PROJECTION_PLANE_LENGTH = CAMERA_PLANE_LENGTH;
/**
 * Eye height above the floor in world-tile units. Walls project symmetrically
 * about the horizon (`drawWallColumn` spans `horizon +- lineHeight / 2`),
 * which places the eye halfway up the one-tile-tall walls. Floor and ceiling
 * casting must use the same height (and its mirror, `1 - CAMERA_HEIGHT`, for
 * the ceiling) or plane tile boundaries detach from wall bases and the planes
 * render over-tiled. At 0.5 the mirror is free: one row distance serves both.
 */
const CAMERA_HEIGHT = 0.5;

const DEFAULT_SPRITE_CAPACITY = 128;
/** Transparent thin-wall hits recorded per screen column. */
const MAX_THIN_HITS = 8;
/** Shade bands advance one step per this many tiles of distance. */
const SHADE_BAND_DISTANCE = 1;
const CEILING_SHADE_OFFSET = 2;
const MIN_WALL_DISTANCE = 1e-4;
const MIN_SPRITE_DISTANCE = 0.05;
const SPRITE_EMISSIVE_GAIN = 2;
const HEALTH_BAR_WIDTH_FRACTION = 0.55;
const HEALTH_BAR_MIN_WIDTH = 8;
const HEALTH_BAR_MAX_WIDTH = 28;
const HEALTH_BAR_HEIGHT = 4;
const HEALTH_BAR_GAP = 2;
const HEALTH_BAR_BORDER = 1;
const HEALTH_BAR_BORDER_COLOR = 0xff000000;
const HEALTH_BAR_EMPTY_COLOR = 0xff1d1d7f;
const HEALTH_BAR_FILL_COLOR = 0xff5ec522;
const FIXED_ONE = 65536;
const SKY_NEAR_PARALLAX_SCALE = 0.035;
const SKY_FAR_PARALLAX_SCALE = 0.008;
const SKY_NEAR_SCREEN_REPEATS = 1;
const SKY_FAR_SCREEN_REPEATS = 1;
const SKY_NEAR_SCROLL_U_PER_MS = 0.000015;
const TAU = Math.PI * 2;

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

function shadeBand(distance: number): number {
  const band = (distance / SHADE_BAND_DISTANCE) | 0;
  return band >= SHADE_BANDS ? SHADE_BANDS - 1 : band;
}

function mipLevelForTexelsPerPixel(texelsPerPixel: number): number {
  if (texelsPerPixel >= 8) return 3;
  if (texelsPerPixel >= 4) return 2;
  if (texelsPerPixel >= 2) return 1;
  return 0;
}

function planeMipLevel(rowDistance: number, width: number): number {
  return mipLevelForTexelsPerPixel((rowDistance * PROJECTION_PLANE_LENGTH * 2 * TEX_SIZE) / width);
}

function wallMip(texture: BakedTexture, lineHeight: number): BakedTextureMip {
  return texture.mips[mipLevelForTexelsPerPixel(TEX_SIZE / lineHeight)]!;
}

function lightTexel(texel: number, red: number, green: number, blue: number): number {
  if (texel === TRANSPARENT_TEXEL || (red === 255 && green === 255 && blue === 255)) return texel;
  return ((texel & 0xff000000) |
    (((texel & 0xff) * red / 255) | 0) |
    (((((texel >>> 8) & 0xff) * green / 255) | 0) << 8) |
    (((((texel >>> 16) & 0xff) * blue / 255) | 0) << 16)) >>> 0;
}

function lightmapTexel(litTexel: number, sourceTexel: number, maskTexel: number): number {
  if (maskTexel === TRANSPARENT_TEXEL || sourceTexel === TRANSPARENT_TEXEL) return litTexel;
  const intensity = Math.max(maskTexel & 0xff, (maskTexel >>> 8) & 0xff, (maskTexel >>> 16) & 0xff);
  if (intensity <= 0) return litTexel;

  const litRed = litTexel & 0xff;
  const litGreen = (litTexel >>> 8) & 0xff;
  const litBlue = (litTexel >>> 16) & 0xff;
  const sourceRed = emissiveChannel(sourceTexel & 0xff);
  const sourceGreen = emissiveChannel((sourceTexel >>> 8) & 0xff);
  const sourceBlue = emissiveChannel((sourceTexel >>> 16) & 0xff);
  if (intensity >= 255) {
    return ((sourceTexel & 0xff000000) | sourceRed | (sourceGreen << 8) | (sourceBlue << 16)) >>> 0;
  }

  return ((litTexel & 0xff000000) |
    (litRed + Math.round((sourceRed - litRed) * intensity / 255)) |
    ((litGreen + Math.round((sourceGreen - litGreen) * intensity / 255)) << 8) |
    ((litBlue + Math.round((sourceBlue - litBlue) * intensity / 255)) << 16)) >>> 0;
}

function emissiveChannel(value: number): number {
  const boosted = value * SPRITE_EMISSIVE_GAIN;
  return boosted >= 255 ? 255 : boosted | 0;
}

function unitFraction(value: number): number {
  return value - Math.floor(value);
}

function composeSkyTexel(farTexel: number, nearTexel: number): number {
  return nearTexel === TRANSPARENT_TEXEL ? farTexel : nearTexel;
}

export function renderFrame(
  frame: RaycastFrame,
  scene: RaycastScene,
  atlas: RaycastAtlas,
  camera: RaycastCamera,
  nowMs = 0,
): void {
  assertFrameCapacity(frame, scene);
  frame.pixels.fill(0xff000000);
  const focal = (0.5 * frame.width) / PROJECTION_PLANE_LENGTH;
  renderPlanes(frame, scene, atlas, camera, focal, nowMs);
  renderWalls(frame, scene, atlas, camera, focal);
  renderSpritesAndThinWalls(frame, scene, atlas, camera, focal);
}

function assertFrameCapacity(frame: RaycastFrame, scene: RaycastScene): void {
  if (scene.spriteCount <= frame.spriteOrder.length) return;
  throw new Error(
    `Raycast frame sprite scratch capacity ${frame.spriteOrder.length} cannot render ${scene.spriteCount} scene sprites.`,
  );
}

function renderPlanes(
  frame: RaycastFrame,
  scene: RaycastScene,
  atlas: RaycastAtlas,
  camera: RaycastCamera,
  focal: number,
  nowMs: number,
): void {
  const width = frame.width;
  const height = frame.height;
  const horizon = height >> 1;
  const pixels = frame.pixels;
  const mapWidth = scene.mapWidth;
  const mapHeight = scene.mapHeight;
  const floors = scene.floors;
  const ceilings = scene.ceilings;
  const lightRed = scene.lightRed;
  const lightGreen = scene.lightGreen;
  const lightBlue = scene.lightBlue;
  const planes = atlas.planes;
  const leftRayX = camera.dirX - camera.planeX;
  const leftRayY = camera.dirY - camera.planeY;
  const raySpanX = 2 * camera.planeX;
  const raySpanY = 2 * camera.planeY;
  const cameraX = camera.x;
  const cameraY = camera.y;
  const skyPlane = atlas.skyPlane;
  const skyNearTexels = skyPlane === undefined ? undefined : planes[skyPlane]?.mips[0]?.bands[0];
  const skyFarPlane = atlas.skyFarPlane;
  const skyFarTexels = skyFarPlane === undefined ? undefined : planes[skyFarPlane]?.mips[0]?.bands[0];
  const skyLateral = cameraX * -camera.dirY + cameraY * camera.dirX;
  const skyHeadingU = Math.atan2(camera.dirY, camera.dirX) / TAU;
  const skyNearCenterU = unitFraction(
    skyHeadingU + skyLateral * SKY_NEAR_PARALLAX_SCALE + nowMs * SKY_NEAR_SCROLL_U_PER_MS,
  );
  const skyFarCenterU = unitFraction(skyHeadingU + skyLateral * SKY_FAR_PARALLAX_SCALE);
  const skyNearLeftU = unitFraction(skyNearCenterU - SKY_NEAR_SCREEN_REPEATS * 0.5);
  const skyFarLeftU = unitFraction(skyFarCenterU - SKY_FAR_SCREEN_REPEATS * 0.5);
  const skyNearStepU = width === 0 ? 0 : SKY_NEAR_SCREEN_REPEATS / width;
  const skyFarStepU = width === 0 ? 0 : SKY_FAR_SCREEN_REPEATS / width;
  const skyVerticalDenominator = horizon > 0 ? horizon : 1;

  for (let y = horizon; y < height; y++) {
    // Sample the row centre; +0.5 also keeps the horizon row finite.
    const rowDistance = (CAMERA_HEIGHT * focal) / (y - horizon + 0.5);
    const floorBand = shadeBand(rowDistance);
    const ceilingBand = offsetShadeBand(floorBand, CEILING_SHADE_OFFSET);
    const mipLevel = planeMipLevel(rowDistance, width);
    const mipSize = TEX_SIZE >> mipLevel;
    const mipShift = TEX_SHIFT - mipLevel;
    const mipMask = mipSize - 1;
    const stepX = (rowDistance * raySpanX) / width;
    const stepY = (rowDistance * raySpanY) / width;
    let worldX = cameraX + rowDistance * leftRayX;
    let worldY = cameraY + rowDistance * leftRayY;
    const floorRow = y * width;
    const ceilingY = height - 1 - y;
    const ceilingRow = ceilingY * width;
    let cachedCell = -1;
    let floorTexels: Uint32Array | undefined;
    let ceilingTexels: Uint32Array | undefined;
    let ceilingIsSky = false;
    let red = 255;
    let green = 255;
    let blue = 255;
    const skyTexY = (((ceilingY * TEX_SIZE) / skyVerticalDenominator) | 0) & TEX_MASK;

    for (let x = 0; x < width; x++) {
      const cellX = worldX | 0;
      const cellY = worldY | 0;
      if (worldX >= 0 && worldY >= 0 && cellX < mapWidth && cellY < mapHeight) {
        const cell = cellY * mapWidth + cellX;
        if (cell !== cachedCell) {
          cachedCell = cell;
          const floorId = floors[cell]!;
          const ceilingId = ceilings[cell]!;
          floorTexels = floorId === 0 ? undefined : planes[floorId - 1]?.mips[mipLevel]?.bands[floorBand];
          ceilingIsSky = skyNearTexels !== undefined && skyPlane !== undefined && ceilingId === skyPlane + 1;
          ceilingTexels = ceilingId === 0 || ceilingIsSky ?
            undefined :
            planes[ceilingId - 1]?.mips[mipLevel]?.bands[ceilingBand];
          red = lightRed[cell]!;
          green = lightGreen[cell]!;
          blue = lightBlue[cell]!;
        }
        if (floorTexels !== undefined || ceilingTexels !== undefined) {
          const texX = (((worldX - cellX) * mipSize) | 0) & mipMask;
          const texY = (((worldY - cellY) * mipSize) | 0) & mipMask;
          const texel = (texY << mipShift) | texX;
          if (floorTexels !== undefined) pixels[floorRow + x] = lightTexel(floorTexels[texel]!, red, green, blue);
          if (ceilingTexels !== undefined) {
            pixels[ceilingRow + x] = lightTexel(ceilingTexels[texel]!, red, green, blue);
          }
        }
        if (ceilingIsSky && skyNearTexels !== undefined) {
          const skyNearTexX = (((skyNearLeftU + x * skyNearStepU) * TEX_SIZE) | 0) & TEX_MASK;
          const nearTexel = skyNearTexels[(skyTexY << TEX_SHIFT) | skyNearTexX]!;
          if (skyFarTexels === undefined) {
            pixels[ceilingRow + x] = nearTexel;
          } else {
            const skyFarTexX = (((skyFarLeftU + x * skyFarStepU) * TEX_SIZE) | 0) & TEX_MASK;
            const farTexel = skyFarTexels[(skyTexY << TEX_SHIFT) | skyFarTexX]!;
            pixels[ceilingRow + x] = composeSkyTexel(farTexel, nearTexel);
          }
        }
      }
      worldX += stepX;
      worldY += stepY;
    }
  }
}

function renderWalls(
  frame: RaycastFrame,
  scene: RaycastScene,
  atlas: RaycastAtlas,
  camera: RaycastCamera,
  focal: number,
): void {
  const width = frame.width;
  const mapWidth = scene.mapWidth;
  const mapHeight = scene.mapHeight;
  const walls = scene.walls;
  const thinByCell = scene.thinByCell;
  const slidingSolidByCell = scene.slidingSolidByCell;
  const lightRed = scene.lightRed;
  const lightGreen = scene.lightGreen;
  const lightBlue = scene.lightBlue;
  const maxSteps = (mapWidth + mapHeight) * 2;
  const startCellX = camera.x | 0;
  const startCellY = camera.y | 0;

  for (let x = 0; x < width; x++) {
    const cameraPlaneX = (2 * x) / width - 1;
    const rayX = camera.dirX + camera.planeX * cameraPlaneX;
    const rayY = camera.dirY + camera.planeY * cameraPlaneX;
    const deltaDistX = rayX !== 0 ? Math.abs(1 / rayX) : 1e30;
    const deltaDistY = rayY !== 0 ? Math.abs(1 / rayY) : 1e30;
    const stepX = rayX < 0 ? -1 : 1;
    const stepY = rayY < 0 ? -1 : 1;
    let mapX = startCellX;
    let mapY = startCellY;
    let sideDistX = rayX < 0 ? (camera.x - mapX) * deltaDistX : (mapX + 1 - camera.x) * deltaDistX;
    let sideDistY = rayY < 0 ? (camera.y - mapY) * deltaDistY : (mapY + 1 - camera.y) * deltaDistY;
    let side = 0;
    let hitDistance = Number.POSITIVE_INFINITY;
    let hitTexture: BakedTexture | undefined;
    let hitTexX = 0;
    let hitLightRed = 255;
    let hitLightGreen = 255;
    let hitLightBlue = 255;
    let thinHits = 0;
    const thinBase = x * MAX_THIN_HITS;

    for (let step = 0; step < maxSteps; step++) {
      const previousCell = mapY * mapWidth + mapX;
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }
      if (mapX < 0 || mapY < 0 || mapX >= mapWidth || mapY >= mapHeight) break;

      const cell = mapY * mapWidth + mapX;
      const wallId = walls[cell]!;
      if (wallId !== 0) {
        hitDistance = solidFaceDistance(side, mapX, mapY, stepX, stepY, rayX, rayY, camera);
        const wallX = side === 0 ? camera.y + hitDistance * rayY : camera.x + hitDistance * rayX;
        const texX = solidFaceTexX(side, rayX, rayY, wallX - Math.floor(wallX));
        hitTexture = jambTextureFromPreviousCell(scene, atlas, previousCell, side) ?? atlas.walls[wallId - 1];
        hitTexX = texX;
        hitLightRed = lightRed[previousCell]!;
        hitLightGreen = lightGreen[previousCell]!;
        hitLightBlue = lightBlue[previousCell]!;
        break;
      }

      const slidingSolidIndex = slidingSolidByCell[cell]!;
      if (slidingSolidIndex >= 0 && side === scene.slidingSolidAxis[slidingSolidIndex]!) {
        const slide = scene.slidingSolidSlide[slidingSolidIndex]!;
        const offset = scene.slidingSolidOffset[slidingSolidIndex]!;
        if (offset < 1) {
          const distance = solidFaceDistance(side, mapX, mapY, stepX, stepY, rayX, rayY, camera);
          const planeHit = side === 0 ? camera.y + distance * rayY : camera.x + distance * rayX;
          const planeCell = side === 0 ? mapY : mapX;
          const local = planeHit - planeCell;
          const texLocal = slideTexLocal(local, slide, offset);
          if (texLocal >= 0) {
            const textureId = scene.slidingSolidTex[slidingSolidIndex]!;
            const texture = atlas.walls[textureId];
            if (texture !== undefined) {
              const texX = solidFaceTexX(side, rayX, rayY, texLocal);
              const verticalSlide = offset > 0 && (slide === THIN_SLIDE_UP || slide === THIN_SLIDE_DOWN);
              if (texture.opaque && !verticalSlide) {
                hitDistance = distance;
                hitTexture = texture;
                hitTexX = texX;
                hitLightRed = lightRed[cell]!;
                hitLightGreen = lightGreen[cell]!;
                hitLightBlue = lightBlue[cell]!;
                break;
              }
              if (thinHits < MAX_THIN_HITS) {
                const slot = thinBase + thinHits++;
                frame.thinHitDist[slot] = distance;
                frame.thinHitTex[slot] = textureId;
                frame.thinHitTexX[slot] = texX;
                frame.thinHitBand[slot] = thinShadeBand(distance, side);
                frame.thinHitLightRed[slot] = lightRed[cell]!;
                frame.thinHitLightGreen[slot] = lightGreen[cell]!;
                frame.thinHitLightBlue[slot] = lightBlue[cell]!;
                frame.thinHitSlide[slot] = verticalSlide ? slide : THIN_SLIDE_NEG;
                frame.thinHitOffset[slot] = verticalSlide ? offset : 0;
              }
            }
          }
        }
      }

      const thinIndex = thinByCell[cell]!;
      if (thinIndex < 0) continue;

      // Intersect the mid-cell plane; the ray may cross the cell corner and
      // miss the plane's in-cell span entirely.
      const axis = scene.thinAxis[thinIndex]!;
      let thinDistance: number;
      let planeHit: number;
      let planeCell: number;
      if (axis === THIN_AXIS_Y) {
        if (rayY === 0) continue;
        thinDistance = (mapY + 0.5 - camera.y) / rayY;
        planeHit = camera.x + thinDistance * rayX;
        planeCell = mapX;
      } else {
        if (rayX === 0) continue;
        thinDistance = (mapX + 0.5 - camera.x) / rayX;
        planeHit = camera.y + thinDistance * rayY;
        planeCell = mapY;
      }
      if (thinDistance <= 0 || planeHit < planeCell || planeHit >= planeCell + 1) continue;

      const texture = atlas.walls[scene.thinTex[thinIndex]!];
      if (texture === undefined) continue;

      // A sliding thin wall covers only part of its span (horizontal slides)
      // or its height (vertical slides). Horizontal slides resolve per column
      // here: the ray either hits the shifted slab or passes the gap.
      const slide = scene.thinSlide[thinIndex]!;
      const offset = scene.thinOffset[thinIndex]!;
      const local = planeHit - planeCell;
      let texLocal = local;
      if (offset > 0 && slide === THIN_SLIDE_NEG) {
        if (local >= 1 - offset) continue;
        texLocal = local + offset;
      } else if (offset > 0 && slide === THIN_SLIDE_POS) {
        if (local < offset) continue;
        texLocal = local - offset;
      } else if (offset >= 1) {
        continue;
      }
      const texX = ((texLocal * TEX_SIZE) | 0) & TEX_MASK;
      const verticalSlide = offset > 0 && (slide === THIN_SLIDE_UP || slide === THIN_SLIDE_DOWN);

      if (texture.opaque && !verticalSlide) {
        hitDistance = thinDistance;
        hitTexture = texture;
        hitTexX = texX;
        hitLightRed = lightRed[cell]!;
        hitLightGreen = lightGreen[cell]!;
        hitLightBlue = lightBlue[cell]!;
        side = axis === THIN_AXIS_Y ? 1 : 0;
        break;
      }
      if (thinHits < MAX_THIN_HITS) {
        const slot = thinBase + thinHits++;
        frame.thinHitDist[slot] = thinDistance;
        frame.thinHitTex[slot] = scene.thinTex[thinIndex]!;
        frame.thinHitTexX[slot] = texX;
        frame.thinHitBand[slot] = thinShadeBand(thinDistance, axis === THIN_AXIS_Y ? 1 : 0);
        frame.thinHitLightRed[slot] = lightRed[cell]!;
        frame.thinHitLightGreen[slot] = lightGreen[cell]!;
        frame.thinHitLightBlue[slot] = lightBlue[cell]!;
        frame.thinHitSlide[slot] = verticalSlide ? slide : THIN_SLIDE_NEG;
        frame.thinHitOffset[slot] = verticalSlide ? offset : 0;
      }
    }

    frame.thinHitCount[x] = thinHits;
    frame.zbuffer[x] = hitDistance;
    if (hitTexture === undefined) continue;

    drawWallColumn(
      frame,
      x,
      hitDistance,
      focal,
      hitTexture,
      thinShadeBand(hitDistance, side),
      hitTexX,
      hitLightRed,
      hitLightGreen,
      hitLightBlue,
      true,
    );
  }
}

function solidFaceDistance(
  side: number,
  mapX: number,
  mapY: number,
  stepX: number,
  stepY: number,
  rayX: number,
  rayY: number,
  camera: RaycastCamera,
): number {
  return side === 0 ? (mapX - camera.x + (1 - stepX) / 2) / rayX : (mapY - camera.y + (1 - stepY) / 2) / rayY;
}

function solidFaceTexX(side: number, rayX: number, rayY: number, local: number): number {
  let texX = ((local * TEX_SIZE) | 0) & TEX_MASK;
  if ((side === 0 && rayX > 0) || (side === 1 && rayY < 0)) texX = TEX_MASK - texX;
  return texX;
}

function slideTexLocal(local: number, slide: number, offset: number): number {
  if (local < 0 || local >= 1) return -1;
  if (offset > 0 && slide === THIN_SLIDE_NEG) {
    return local >= 1 - offset ? -1 : local + offset;
  }
  if (offset > 0 && slide === THIN_SLIDE_POS) {
    return local < offset ? -1 : local - offset;
  }
  return offset >= 1 ? -1 : local;
}

function jambTextureFromPreviousCell(
  scene: RaycastScene,
  atlas: RaycastAtlas,
  previousCell: number,
  side: number,
): BakedTexture | undefined {
  const thinIndex = scene.thinByCell[previousCell]!;
  if (thinIndex < 0) return undefined;

  const thinSide = scene.thinAxis[thinIndex]! === THIN_AXIS_Y ? 1 : 0;
  if (side === thinSide) return undefined;

  const texture = atlas.walls[scene.thinTex[thinIndex]!];
  return texture?.opaque === true ? texture : undefined;
}

function thinShadeBand(distance: number, sideOffset: number): number {
  return offsetShadeBand(shadeBand(distance), sideOffset);
}

function offsetShadeBand(band: number, offset: number): number {
  band += offset;
  return band >= SHADE_BANDS ? SHADE_BANDS - 1 : band;
}

/** Draw one textured vertical strip from a column-major texture. */
function drawWallColumn(
  frame: RaycastFrame,
  x: number,
  distance: number,
  focal: number,
  texture: BakedTexture,
  band: number,
  texX: number,
  lightRed: number,
  lightGreen: number,
  lightBlue: number,
  opaque: boolean,
): void {
  const height = frame.height;
  const horizon = height >> 1;
  const pixels = frame.pixels;
  const width = frame.width;
  const lineHeight = focal / (distance < MIN_WALL_DISTANCE ? MIN_WALL_DISTANCE : distance);
  const halfLine = lineHeight * 0.5;
  const top = horizon - halfLine;
  let yStart = Math.ceil(top);
  let yEnd = Math.ceil(horizon + halfLine);
  if (yStart < 0) yStart = 0;
  if (yEnd > height) yEnd = height;
  if (yStart >= yEnd) return;

  const mip = wallMip(texture, lineHeight);
  const texels = mip.bands[band]!;
  const texStep = ((mip.size * FIXED_ONE) / lineHeight) | 0;
  let texPos = (((yStart - top) * mip.size * FIXED_ONE) / lineHeight) | 0;
  const columnBase = (((texX * mip.size) / TEX_SIZE) | 0) << mip.shift;
  let offset = yStart * width + x;
  if (opaque) {
    for (let y = yStart; y < yEnd; y++) {
      pixels[offset] = lightTexel(texels[columnBase + ((texPos >>> 16) & mip.mask)]!, lightRed, lightGreen, lightBlue);
      texPos += texStep;
      offset += width;
    }
    return;
  }
  for (let y = yStart; y < yEnd; y++) {
    const texel = texels[columnBase + ((texPos >>> 16) & mip.mask)]!;
    if (texel !== TRANSPARENT_TEXEL) pixels[offset] = lightTexel(texel, lightRed, lightGreen, lightBlue);
    texPos += texStep;
    offset += width;
  }
}

function renderSpritesAndThinWalls(
  frame: RaycastFrame,
  scene: RaycastScene,
  atlas: RaycastAtlas,
  camera: RaycastCamera,
  focal: number,
): void {
  const width = frame.width;

  // Cursors walk each column's thin-hit stack from farthest to nearest so
  // transparent stripes interleave back-to-front with the sprites.
  for (let x = 0; x < width; x++) {
    frame.thinHitCursor[x] = frame.thinHitCount[x]! - 1;
  }

  const visible = projectSprites(frame, scene, camera);
  for (let order = 0; order < visible; order++) {
    const sprite = frame.spriteOrder[order]!;
    const spriteCellX = scene.spriteX[sprite]! | 0;
    const spriteCellY = scene.spriteY[sprite]! | 0;
    const spriteCell = spriteCellY * scene.mapWidth + spriteCellX;
    const lit = spriteCellX >= 0 && spriteCellY >= 0 && spriteCellX < scene.mapWidth && spriteCellY < scene.mapHeight;
    drawSprite(
      frame,
      atlas,
      focal,
      frame.spriteDepth[sprite]!,
      frame.spriteScreenX[sprite]!,
      scene.spriteTex[sprite]!,
      scene.spriteWidth[sprite]!,
      scene.spriteHeight[sprite]!,
      scene.spriteElevation[sprite]!,
      scene.spriteHealthCurrent[sprite]!,
      scene.spriteHealthMax[sprite]!,
      lit ? scene.lightRed[spriteCell]! : 255,
      lit ? scene.lightGreen[spriteCell]! : 255,
      lit ? scene.lightBlue[spriteCell]! : 255,
    );
  }

  for (let x = 0; x < width; x++) {
    flushThinHits(frame, atlas, focal, x, 0);
  }
}

/** Project sprites to screen space and sort far-to-near. Returns the count. */
function projectSprites(frame: RaycastFrame, scene: RaycastScene, camera: RaycastCamera): number {
  const determinant = camera.planeX * camera.dirY - camera.dirX * camera.planeY;
  if (determinant === 0) return 0;
  const invDet = 1 / determinant;
  let visible = 0;

  for (let i = 0; i < scene.spriteCount; i++) {
    const relX = scene.spriteX[i]! - camera.x;
    const relY = scene.spriteY[i]! - camera.y;
    const depth = invDet * (-camera.planeY * relX + camera.planeX * relY);
    if (depth < MIN_SPRITE_DISTANCE) continue;

    const transformX = invDet * (camera.dirY * relX - camera.dirX * relY);
    frame.spriteDepth[i] = depth;
    frame.spriteScreenX[i] = (frame.width / 2) * (1 + transformX / depth);

    // Insertion sort, farthest first; sprite counts stay small.
    let slot = visible;
    while (slot > 0 && frame.spriteDepth[frame.spriteOrder[slot - 1]!]! < depth) {
      frame.spriteOrder[slot] = frame.spriteOrder[slot - 1]!;
      slot--;
    }
    frame.spriteOrder[slot] = i;
    visible++;
  }
  return visible;
}

function drawSprite(
  frame: RaycastFrame,
  atlas: RaycastAtlas,
  focal: number,
  depth: number,
  screenX: number,
  textureId: number,
  widthScale: number,
  heightScale: number,
  elevation: number,
  healthCurrent: number,
  healthMax: number,
  lightRed: number,
  lightGreen: number,
  lightBlue: number,
): void {
  const texture = atlas.sprites[textureId];
  if (texture === undefined) return;
  const lightmap = atlas.spriteLightmaps[textureId];

  const width = frame.width;
  const height = frame.height;
  const horizon = height >> 1;
  const pixels = frame.pixels;
  const zbuffer = frame.zbuffer;
  const spriteWidth = (focal * widthScale) / depth;
  const spriteHeight = (focal * heightScale) / depth;
  if (spriteWidth < 1 || spriteHeight < 1) return;

  // Floor-anchored: the sprite's feet sit where a wall's base would project.
  const bottom = horizon + ((CAMERA_HEIGHT - elevation) * focal) / depth;
  const top = bottom - spriteHeight;
  const left = screenX - spriteWidth * 0.5;
  const healthRatio = healthRatioFor(healthCurrent, healthMax);
  const healthBarWidth = spriteWidth >= HEALTH_BAR_MIN_WIDTH && healthMax > 0 ?
    Math.max(
      HEALTH_BAR_MIN_WIDTH,
      Math.min(HEALTH_BAR_MAX_WIDTH, Math.round(spriteWidth * HEALTH_BAR_WIDTH_FRACTION)),
    ) :
    0;
  const healthBarLeft = Math.round(screenX - healthBarWidth * 0.5);
  const healthBarRight = healthBarLeft + healthBarWidth;
  const healthBarTop = Math.round(top) - HEALTH_BAR_GAP - HEALTH_BAR_HEIGHT;
  const healthBarBottom = healthBarTop + HEALTH_BAR_HEIGHT;
  const healthBarFillRight = healthBarLeft + HEALTH_BAR_BORDER +
    Math.round((healthBarWidth - HEALTH_BAR_BORDER * 2) * healthRatio);
  let yStart = Math.ceil(top);
  let yEnd = Math.ceil(bottom);
  if (yStart < 0) yStart = 0;
  if (yEnd > height) yEnd = height;
  let xStart = Math.ceil(left);
  let xEnd = Math.ceil(left + spriteWidth);
  if (xStart < 0) xStart = 0;
  if (xEnd > width) xEnd = width;
  if (yStart >= yEnd || xStart >= xEnd) return;

  const mip = texture.mips[0]!;
  const texels = mip.bands[shadeBand(depth)]!;
  const sourceTexels = lightmap === undefined ? undefined : mip.bands[0]!;
  const lightmapTexels = lightmap?.mips[0]?.bands[0];
  const texStepX = ((mip.size * FIXED_ONE) / spriteWidth) | 0;
  const texStepY = ((mip.size * FIXED_ONE) / spriteHeight) | 0;
  const texYStart = (((yStart - top) * mip.size * FIXED_ONE) / spriteHeight) | 0;
  let texXPos = (((xStart - left) * mip.size * FIXED_ONE) / spriteWidth) | 0;

  for (let x = xStart; x < xEnd; x++) {
    flushThinHits(frame, atlas, focal, x, depth);
    const texX = (texXPos >>> 16) & mip.mask;
    texXPos += texStepX;
    if (depth >= zbuffer[x]!) continue;

    const columnBase = texX << mip.shift;
    let texYPos = texYStart;
    let offset = yStart * width + x;
    for (let y = yStart; y < yEnd; y++) {
      const texelIndex = columnBase + ((texYPos >>> 16) & mip.mask);
      const texel = texels[texelIndex]!;
      if (texel !== TRANSPARENT_TEXEL) {
        const litTexel = lightTexel(texel, lightRed, lightGreen, lightBlue);
        pixels[offset] = lightmapTexels === undefined || sourceTexels === undefined ?
          litTexel :
          lightmapTexel(litTexel, sourceTexels[texelIndex]!, lightmapTexels[texelIndex]!);
      }
      texYPos += texStepY;
      offset += width;
    }
    if (healthBarWidth > 0) {
      drawHealthBarColumn(frame, x, healthBarLeft, healthBarRight, healthBarTop, healthBarBottom, healthBarFillRight);
    }
  }
}

function healthRatioFor(current: number, max: number): number {
  if (max <= 0 || current <= 0) return 0;
  if (current >= max) return 1;
  return current / max;
}

function drawHealthBarColumn(
  frame: RaycastFrame,
  x: number,
  left: number,
  right: number,
  top: number,
  bottom: number,
  fillRight: number,
): void {
  if (x < left || x >= right) return;

  const frameHeight = frame.height;
  let yStart = top;
  let yEnd = bottom;
  if (yStart < 0) yStart = 0;
  if (yEnd > frameHeight) yEnd = frameHeight;
  if (yStart >= yEnd) return;

  const borderRight = right - HEALTH_BAR_BORDER;
  const borderBottom = bottom - HEALTH_BAR_BORDER;
  let offset = yStart * frame.width + x;
  for (let y = yStart; y < yEnd; y++) {
    frame.pixels[offset] = x < left + HEALTH_BAR_BORDER || x >= borderRight || y < top + HEALTH_BAR_BORDER ||
        y >= borderBottom ?
      HEALTH_BAR_BORDER_COLOR :
      x < fillRight ?
      HEALTH_BAR_FILL_COLOR :
      HEALTH_BAR_EMPTY_COLOR;
    offset += frame.width;
  }
}

/**
 * Draw one strip of a vertically sliding thin wall: the slab rises into the
 * ceiling (or sinks into the floor) by `offset` of its height, so the strip
 * is clipped and the texture rows shift with the slab.
 */
function drawVerticalSlideColumn(
  frame: RaycastFrame,
  x: number,
  distance: number,
  focal: number,
  texture: BakedTexture,
  band: number,
  texX: number,
  lightRed: number,
  lightGreen: number,
  lightBlue: number,
  slide: number,
  offset: number,
): void {
  const height = frame.height;
  const horizon = height >> 1;
  const pixels = frame.pixels;
  const width = frame.width;
  const lineHeight = focal / (distance < MIN_WALL_DISTANCE ? MIN_WALL_DISTANCE : distance);
  const halfLine = lineHeight * 0.5;
  const top = horizon - halfLine;
  const slabTop = slide === THIN_SLIDE_DOWN ? top + offset * lineHeight : top;
  const slabBottom = slide === THIN_SLIDE_UP ? horizon + halfLine - offset * lineHeight : horizon + halfLine;
  let yStart = Math.ceil(slabTop);
  let yEnd = Math.ceil(slabBottom);
  if (yStart < 0) yStart = 0;
  if (yEnd > height) yEnd = height;
  if (yStart >= yEnd) return;

  const mip = wallMip(texture, lineHeight);
  const texels = mip.bands[band]!;
  // Texture rows track the slab: a risen slab shows its lower rows.
  const texStep = ((mip.size * FIXED_ONE) / lineHeight) | 0;
  const slabTexTop = slide === THIN_SLIDE_UP ? offset : 0;
  let texPos = ((slabTexTop + (yStart - slabTop) / lineHeight) * mip.size * FIXED_ONE) | 0;
  const columnBase = (((texX * mip.size) / TEX_SIZE) | 0) << mip.shift;
  let pixelOffset = yStart * width + x;
  for (let y = yStart; y < yEnd; y++) {
    const texel = texels[columnBase + ((texPos >>> 16) & mip.mask)]!;
    if (texel !== TRANSPARENT_TEXEL) pixels[pixelOffset] = lightTexel(texel, lightRed, lightGreen, lightBlue);
    texPos += texStep;
    pixelOffset += width;
  }
}

/** Draw this column's transparent stripes that lie at or beyond `depth`. */
function flushThinHits(frame: RaycastFrame, atlas: RaycastAtlas, focal: number, x: number, depth: number): void {
  let cursor = frame.thinHitCursor[x]!;
  const base = x * MAX_THIN_HITS;
  while (cursor >= 0 && frame.thinHitDist[base + cursor]! >= depth) {
    const slot = base + cursor;
    const texture = atlas.walls[frame.thinHitTex[slot]!];
    if (texture !== undefined) {
      const offset = frame.thinHitOffset[slot]!;
      if (offset > 0) {
        drawVerticalSlideColumn(
          frame,
          x,
          frame.thinHitDist[slot]!,
          focal,
          texture,
          frame.thinHitBand[slot]!,
          frame.thinHitTexX[slot]!,
          frame.thinHitLightRed[slot]!,
          frame.thinHitLightGreen[slot]!,
          frame.thinHitLightBlue[slot]!,
          frame.thinHitSlide[slot]!,
          offset,
        );
      } else {
        drawWallColumn(
          frame,
          x,
          frame.thinHitDist[slot]!,
          focal,
          texture,
          frame.thinHitBand[slot]!,
          frame.thinHitTexX[slot]!,
          frame.thinHitLightRed[slot]!,
          frame.thinHitLightGreen[slot]!,
          frame.thinHitLightBlue[slot]!,
          false,
        );
      }
    }
    cursor--;
  }
  frame.thinHitCursor[x] = cursor;
}
