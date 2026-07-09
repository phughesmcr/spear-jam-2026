/**
 * Sprite and transparent-thin-wall compositing pass.
 *
 * Sprites are projected and sorted back-to-front (insertion sort; counts stay
 * small), then drawn column by column. Each column first flushes any
 * transparent thin-wall stripes (open doors, grates) recorded during wall
 * casting that lie beyond the sprite's depth, so grates and see-through faces
 * interleave correctly with the sprites behind and in front of them.
 */

import { flushThinHits } from "@/src/render/raycast/cast_walls.ts";
import {
  CAMERA_HEIGHT,
  FIXED_ONE,
  lightTexel,
  type RaycastAtlas,
  type RaycastCamera,
  type RaycastFrame,
  type RaycastScene,
  shadeBand,
} from "@/src/render/raycast/scene_data.ts";
import { TRANSPARENT_TEXEL } from "@/src/render/raycast/textures.ts";

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

export function renderSpritesAndThinWalls(
  frame: RaycastFrame,
  scene: RaycastScene,
  atlas: RaycastAtlas,
  camera: RaycastCamera,
  focal: number,
  healthBarMaxDistance: number,
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
    const spriteX = scene.spriteX[sprite]!;
    const spriteY = scene.spriteY[sprite]!;
    const spriteCellX = spriteX | 0;
    const spriteCellY = spriteY | 0;
    const spriteCell = spriteCellY * scene.mapWidth + spriteCellX;
    const lit = spriteCellX >= 0 && spriteCellY >= 0 && spriteCellX < scene.mapWidth && spriteCellY < scene.mapHeight;
    const distance = Math.hypot(spriteX - camera.x, spriteY - camera.y);
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
      distance,
      healthBarMaxDistance,
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
  distance: number,
  healthBarMaxDistance: number,
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
  const healthBarWidth = spriteWidth >= HEALTH_BAR_MIN_WIDTH && healthMax > 0 &&
      distance <= healthBarMaxDistance ?
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
