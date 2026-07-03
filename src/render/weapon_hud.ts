import type { CommandSlot } from "@/src/game/state.ts";
import { createImageAsset, loadedImage, preloadImageAssets } from "@/src/render/assets.ts";
import type { ImageAsset } from "@/src/render/assets.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";

export type WeaponHudPhase = "idle" | "active";

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

const WEAPON_SLOTS = [1, 2, 3] as const satisfies readonly CommandSlot[];
const WEAPON_HUD_PHASES = ["idle", "active"] as const satisfies readonly WeaponHudPhase[];
const MAX_WIDTH_FRACTION = 0.96;
const MAX_HEIGHT_FRACTION = 0.72;
const MIN_IMAGE_SIZE = 1;

const weaponHudAssets: Readonly<Record<CommandSlot, Readonly<Record<WeaponHudPhase, ImageAsset>>>> = {
  1: {
    idle: createImageAsset(new URL("../../assets/game/ui/weapon_1_idle.png", import.meta.url).href),
    active: createImageAsset(new URL("../../assets/game/ui/weapon_1_active.png", import.meta.url).href),
  },
  2: {
    idle: createImageAsset(new URL("../../assets/game/ui/weapon_2_idle.png", import.meta.url).href),
    active: createImageAsset(new URL("../../assets/game/ui/weapon_2_active.png", import.meta.url).href),
  },
  3: {
    idle: createImageAsset(new URL("../../assets/game/ui/weapon_3_idle.png", import.meta.url).href),
    active: createImageAsset(new URL("../../assets/game/ui/weapon_3_active.png", import.meta.url).href),
  },
};

const IMAGE_ASSETS = Object.freeze(
  WEAPON_SLOTS.flatMap((slot) => WEAPON_HUD_PHASES.map((phase) => weaponHudAssets[slot][phase])),
);

export async function preloadWeaponHudAssets(document: Document, onAssetLoad?: () => void): Promise<void> {
  await preloadImageAssets(document, IMAGE_ASSETS, onAssetLoad);
}

export function renderWeaponHud(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  selectedWeapon: CommandSlot,
  phase: WeaponHudPhase,
  onAssetLoad?: () => void,
): void {
  const selectedAsset = weaponHudAssets[selectedWeapon][phase];
  const fallbackAsset = phase === "active" ? weaponHudAssets[selectedWeapon].idle : undefined;
  const image = loadedImage(ctx, selectedAsset, onAssetLoad) ??
    (fallbackAsset === undefined ? undefined : loadedImage(ctx, fallbackAsset, onAssetLoad));
  if (image === undefined) return;

  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const rect = weaponHudSpriteRect(canvasSize, { width: imageWidth, height: imageHeight });

  ctx.save();
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
    x: Math.round((canvasSize.width - width) / 2),
    y: Math.round(canvasSize.height - height),
    width,
    height,
  };
}
