import { AUTHORING_TILE_SIZE } from "@/src/map/authoring/catalog.ts";
import type { RgbaImage } from "./png.ts";

export function setPixel(
  target: Uint8Array,
  targetWidth: number,
  x: number,
  y: number,
  color: readonly [number, number, number, number],
): void {
  const offset = ((y * targetWidth) + x) * 4;
  target[offset] = color[0];
  target[offset + 1] = color[1];
  target[offset + 2] = color[2];
  target[offset + 3] = color[3];
}

export function fillRect(
  target: Uint8Array,
  targetWidth: number,
  left: number,
  top: number,
  width: number,
  height: number,
  color: readonly [number, number, number, number],
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      setPixel(target, targetWidth, left + x, top + y, color);
    }
  }
}

export function drawTileBorder(
  target: Uint8Array,
  targetWidth: number,
  tileIndex: number,
  columns: number,
  color: readonly [number, number, number, number],
): void {
  const left = (tileIndex % columns) * AUTHORING_TILE_SIZE;
  const top = Math.floor(tileIndex / columns) * AUTHORING_TILE_SIZE;
  for (let offset = 0; offset < AUTHORING_TILE_SIZE; offset++) {
    setPixel(target, targetWidth, left + offset, top, color);
    setPixel(target, targetWidth, left + offset, top + AUTHORING_TILE_SIZE - 1, color);
    setPixel(target, targetWidth, left, top + offset, color);
    setPixel(target, targetWidth, left + AUTHORING_TILE_SIZE - 1, top + offset, color);
  }
}

export function averageSourcePixel(
  image: RgbaImage,
  left: number,
  top: number,
  size: number,
): readonly [number, number, number, number] {
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  let count = 0;
  for (let y = top; y < top + size; y++) {
    for (let x = left; x < left + size; x++) {
      const offset = ((y * image.width) + x) * 4;
      red += image.pixels[offset]!;
      green += image.pixels[offset + 1]!;
      blue += image.pixels[offset + 2]!;
      alpha += image.pixels[offset + 3]!;
      count++;
    }
  }
  return [
    Math.round(red / count),
    Math.round(green / count),
    Math.round(blue / count),
    Math.round(alpha / count),
  ];
}
