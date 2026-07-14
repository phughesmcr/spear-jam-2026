export type CanvasSize = {
  readonly width: number;
  readonly height: number;
  readonly scale?: number;
};

export { createImageAsset, imageForAsset, preloadImageAsset, preloadImageAssets } from "./image_assets.ts";
export type { ImageAsset } from "./image_assets.ts";
