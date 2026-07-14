export type ImageAsset = {
  readonly src: string;
  image?: HTMLImageElement;
  loaded: boolean;
  failed: boolean;
};

type PendingImageAsset = ImageAsset & {
  loadPromise?: Promise<void>;
  loadCallbacks?: Set<() => void>;
};

export function createImageAsset(src: string): ImageAsset {
  return { src, loaded: false, failed: false };
}

export function loadedImage(
  ctx: CanvasRenderingContext2D,
  asset: ImageAsset,
  onAssetLoad?: () => void,
): HTMLImageElement | undefined {
  if (asset.loaded) return asset.image;
  if (asset.failed) return undefined;

  void ensureImageAsset(ctx.canvas.ownerDocument, asset, onAssetLoad);
  return undefined;
}

export async function preloadImageAssets(
  document: Document,
  assets: readonly ImageAsset[],
  onAssetLoad?: () => void,
): Promise<void> {
  await Promise.all(assets.map((asset) => preloadImageAsset(document, asset, onAssetLoad)));
}

export async function preloadImageAsset(
  document: Document,
  asset: ImageAsset,
  onAssetLoad?: () => void,
): Promise<void> {
  if (asset.loaded || asset.failed) return;

  await ensureImageAsset(document, asset, onAssetLoad);
}

function ensureImageAsset(
  document: Document,
  asset: ImageAsset,
  onAssetLoad?: () => void,
): Promise<void> {
  if (asset.loaded || asset.failed) return Promise.resolve();

  const pending = asset as PendingImageAsset;
  if (onAssetLoad !== undefined) {
    pending.loadCallbacks ??= new Set();
    pending.loadCallbacks.add(onAssetLoad);
  }
  if (pending.loadPromise !== undefined) return pending.loadPromise;

  const image = pending.image ?? document.createElement("img");
  image.decoding = "async";
  pending.image = image;

  let settled = false;
  pending.loadPromise = new Promise((resolve) => {
    const finish = (loaded: boolean): void => {
      if (settled) return;
      settled = true;
      pending.loaded = loaded;
      pending.failed = !loaded;
      const callbacks = pending.loadCallbacks;
      pending.loadCallbacks = undefined;
      pending.loadPromise = undefined;
      callbacks?.forEach((callback) => callback());
      resolve();
    };

    image.addEventListener("load", () => finish(true), { once: true });
    image.addEventListener("error", () => finish(false), { once: true });
  });
  if (image.src !== pending.src) image.src = pending.src;
  return pending.loadPromise;
}
