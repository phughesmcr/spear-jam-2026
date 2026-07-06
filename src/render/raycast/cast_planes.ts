/**
 * Floor and ceiling casting pass.
 *
 * Draws by horizontal scanline: distance and shade are constant per row, so
 * one world-space step per pixel textures both the floor and ceiling in the
 * same inner loop. Ceilings mapped to the atlas's sky plane(s) instead sample
 * a parallax-scrolling band rather than a tiled texture.
 */

import {
  CAMERA_HEIGHT,
  lightTexel,
  mipLevelForTexelsPerPixel,
  offsetShadeBand,
  PROJECTION_PLANE_LENGTH,
  type RaycastAtlas,
  type RaycastCamera,
  type RaycastFrame,
  type RaycastScene,
  shadeBand,
} from "@/src/render/raycast/scene_data.ts";
import { TEX_MASK, TEX_SHIFT, TEX_SIZE, TRANSPARENT_TEXEL } from "@/src/render/raycast/textures.ts";

const CEILING_SHADE_OFFSET = 2;
const SKY_NEAR_PARALLAX_SCALE = 0.035;
const SKY_FAR_PARALLAX_SCALE = 0.008;
const SKY_NEAR_SCREEN_REPEATS = 1;
const SKY_FAR_SCREEN_REPEATS = 1;
const SKY_NEAR_SCROLL_U_PER_MS = 0.000015;
const TAU = Math.PI * 2;

function planeMipLevel(rowDistance: number, width: number): number {
  return mipLevelForTexelsPerPixel((rowDistance * PROJECTION_PLANE_LENGTH * 2 * TEX_SIZE) / width);
}

function unitFraction(value: number): number {
  return value - Math.floor(value);
}

function composeSkyTexel(farTexel: number, nearTexel: number): number {
  return nearTexel === TRANSPARENT_TEXEL ? farTexel : nearTexel;
}

export function renderPlanes(
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
