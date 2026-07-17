/**
 * Wall casting pass.
 *
 * DDA per screen column into a 1D depth buffer, with fixed-point texture
 * stepping. Opaque solid walls, sliding solid walls, and opaque thin walls
 * terminate a ray like a normal wall face; transparent thin-wall hits (open
 * doors, grates) stack per column in `frame.thinHit*` for the sprite pass to
 * composite back-to-front via {@link flushThinHits}.
 */

import {
  blendTexel,
  FIXED_ONE,
  lightTexel,
  MAX_THIN_HITS,
  mipLevelForTexelsPerPixel,
  offsetShadeBand,
  type RaycastAtlas,
  type RaycastCamera,
  type RaycastFrame,
  type RaycastScene,
  shadeBand,
  THIN_AXIS_Y,
  THIN_SLIDE_DOWN,
  THIN_SLIDE_NEG,
  THIN_SLIDE_POS,
  THIN_SLIDE_UP,
} from "@/src/engine/raycast/scene_data.ts";
import {
  type BakedTexture,
  type BakedTextureMip,
  TEX_MASK,
  TEX_SIZE,
  TRANSPARENT_TEXEL,
} from "@/src/engine/raycast/textures.ts";

const MIN_WALL_DISTANCE = 1e-4;

function wallMip(texture: BakedTexture, lineHeight: number): BakedTextureMip {
  return texture.mips[mipLevelForTexelsPerPixel(TEX_SIZE / lineHeight)]!;
}

function thinShadeBand(distance: number, sideOffset: number): number {
  return offsetShadeBand(shadeBand(distance), sideOffset);
}

export function renderWalls(
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

  const thinTexture = atlas.walls[scene.thinTex[thinIndex]!];
  if (thinTexture?.opaque !== true) return undefined;

  if (atlas.jambWall === undefined) return thinTexture;
  return atlas.walls[atlas.jambWall];
}

/** Draw one textured vertical strip from a column-major texture. */
export function drawWallColumn(
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
  const texels = mip.texels;
  const texStep = ((mip.size * FIXED_ONE) / lineHeight) | 0;
  let texPos = (((yStart - top) * mip.size * FIXED_ONE) / lineHeight) | 0;
  const columnBase = (((texX * mip.size) / TEX_SIZE) | 0) << mip.shift;
  let offset = yStart * width + x;
  if (opaque) {
    for (let y = yStart; y < yEnd; y++) {
      pixels[offset] = lightTexel(
        texels[columnBase + ((texPos >>> 16) & mip.mask)]!,
        lightRed,
        lightGreen,
        lightBlue,
        band,
      );
      texPos += texStep;
      offset += width;
    }
    return;
  }
  for (let y = yStart; y < yEnd; y++) {
    const texel = texels[columnBase + ((texPos >>> 16) & mip.mask)]!;
    if (texel !== TRANSPARENT_TEXEL) {
      pixels[offset] = blendTexel(lightTexel(texel, lightRed, lightGreen, lightBlue, band), pixels[offset]!);
    }
    texPos += texStep;
    offset += width;
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
  const texels = mip.texels;
  // Texture rows track the slab: a risen slab shows its lower rows.
  const texStep = ((mip.size * FIXED_ONE) / lineHeight) | 0;
  const slabTexTop = slide === THIN_SLIDE_UP ? offset : 0;
  let texPos = ((slabTexTop + (yStart - slabTop) / lineHeight) * mip.size * FIXED_ONE) | 0;
  const columnBase = (((texX * mip.size) / TEX_SIZE) | 0) << mip.shift;
  let pixelOffset = yStart * width + x;
  for (let y = yStart; y < yEnd; y++) {
    const texel = texels[columnBase + ((texPos >>> 16) & mip.mask)]!;
    if (texel !== TRANSPARENT_TEXEL) {
      pixels[pixelOffset] = blendTexel(
        lightTexel(texel, lightRed, lightGreen, lightBlue, band),
        pixels[pixelOffset]!,
      );
    }
    texPos += texStep;
    pixelOffset += width;
  }
}

/** Draw this column's transparent stripes that lie at or beyond `depth`. */
export function flushThinHits(frame: RaycastFrame, atlas: RaycastAtlas, focal: number, x: number, depth: number): void {
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
