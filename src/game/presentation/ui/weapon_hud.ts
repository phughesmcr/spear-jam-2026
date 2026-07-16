import type { CommandSlot } from "@/src/game/model/state.ts";
import type { WeaponHudPhase } from "@/src/game/model/presentation_state.ts";
import { imageForAsset } from "@/src/engine/canvas/mod.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import type { WeaponHudAssets } from "@/src/game/presentation/asset_view.ts";

export type WeaponHudImageSize = {
  readonly width: number;
  readonly height: number;
};

export type WeaponHudSpriteRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const MAX_WIDTH_FRACTION = 0.82;
const MAX_HEIGHT_FRACTION = 0.6;
const RIGHT_OFFSET_FRACTION = 0.08;
const LOWER_OFFSET_FRACTION = 0.06;
const MIN_IMAGE_SIZE = 1;

export function renderWeaponHud(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  assets: WeaponHudAssets,
  selectedWeapon: CommandSlot,
  phase: WeaponHudPhase,
): void {
  const selectedAsset = assets[selectedWeapon][phase];
  const fallbackAsset = phase === "active" ? assets[selectedWeapon].idle : undefined;
  const image = imageForAsset(selectedAsset) ??
    (fallbackAsset === undefined ? undefined : imageForAsset(fallbackAsset));
  if (image === undefined) return;

  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const rect = weaponHudSpriteRect(canvasSize, { width: imageWidth, height: imageHeight });

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, canvasSize.width, canvasSize.height);
  ctx.clip();
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  ctx.imageSmoothingEnabled = smoothing;
  ctx.restore();
}

export function weaponHudSpriteRect(
  canvasSize: GameCanvasSize,
  imageSize: WeaponHudImageSize,
): WeaponHudSpriteRect {
  const imageWidth = Math.max(MIN_IMAGE_SIZE, imageSize.width);
  const imageHeight = Math.max(MIN_IMAGE_SIZE, imageSize.height);
  const scale = Math.min(
    (canvasSize.width * MAX_WIDTH_FRACTION) / imageWidth,
    (canvasSize.height * MAX_HEIGHT_FRACTION) / imageHeight,
  );
  const width = Math.max(MIN_IMAGE_SIZE, Math.round(imageWidth * scale));
  const height = Math.max(MIN_IMAGE_SIZE, Math.round(imageHeight * scale));

  return {
    x: Math.min(
      canvasSize.width - width,
      Math.round((canvasSize.width - width) / 2 + canvasSize.width * RIGHT_OFFSET_FRACTION),
    ),
    y: Math.round(canvasSize.height - height + height * LOWER_OFFSET_FRACTION),
    width,
    height,
  };
}
