export type ImageAssetIssue = {
  readonly source: string;
  readonly stage: "load";
};

export type ImageAssetResult =
  | { readonly kind: "ready"; readonly image: HTMLImageElement }
  | { readonly kind: "unavailable"; readonly issue: ImageAssetIssue };

export type ImageAssetState =
  | { readonly type: "idle" }
  | { readonly type: "loading"; readonly promise: Promise<ImageAssetResult> }
  | { readonly type: "ready"; readonly image: HTMLImageElement }
  | { readonly type: "unavailable"; readonly issue: ImageAssetIssue };

export type ImageAsset = {
  readonly src: string;
  state: ImageAssetState;
};

export function createImageAsset(src: string): ImageAsset {
  return { src, state: { type: "idle" } };
}

export function imageForAsset(asset: ImageAsset): HTMLImageElement | undefined {
  return asset.state.type === "ready" ? asset.state.image : undefined;
}

export async function preloadImageAssets(
  document: Document,
  assets: readonly ImageAsset[],
  onAssetSettled?: (result: ImageAssetResult) => void,
): Promise<ImageAssetResult[]> {
  return await Promise.all(
    assets.map((asset) => preloadImageAsset(document, asset, onAssetSettled)),
  );
}

export async function preloadImageAsset(
  document: Document,
  asset: ImageAsset,
  onAssetSettled?: (result: ImageAssetResult) => void,
): Promise<ImageAssetResult> {
  const state = asset.state;
  switch (state.type) {
    case "idle":
      return await notify(startImageLoad(document, asset), onAssetSettled);
    case "loading":
      return await notify(state.promise, onAssetSettled);
    case "ready":
      return await notify(
        Promise.resolve({ kind: "ready", image: state.image }),
        onAssetSettled,
      );
    case "unavailable":
      return await notify(
        Promise.resolve({ kind: "unavailable", issue: state.issue }),
        onAssetSettled,
      );
  }
}

function notify(
  promise: Promise<ImageAssetResult>,
  onAssetSettled?: (result: ImageAssetResult) => void,
): Promise<ImageAssetResult> {
  if (onAssetSettled === undefined) return promise;
  return promise.then((result) => {
    onAssetSettled(result);
    return result;
  });
}

function startImageLoad(
  document: Document,
  asset: ImageAsset,
): Promise<ImageAssetResult> {
  const image = document.createElement("img");
  image.decoding = "async";

  const { promise, resolve, reject } = Promise.withResolvers<ImageAssetResult>();
  let settled = false;
  let loadObserved = false;

  function finishReady(): void {
    if (settled) return;
    settled = true;
    const result = { kind: "ready", image } as const;
    asset.state = { type: "ready", image };
    resolve(result);
  }

  function finishUnavailable(): void {
    if (settled) return;
    settled = true;
    const issue = { source: asset.src, stage: "load" } as const;
    const result = { kind: "unavailable", issue } as const;
    asset.state = { type: "unavailable", issue };
    resolve(result);
  }

  image.addEventListener("load", () => {
    if (settled || loadObserved) return;
    loadObserved = true;
    finishReady();
  }, { once: true });
  image.addEventListener("error", () => {
    if (settled || loadObserved) return;
    finishUnavailable();
  }, { once: true });

  asset.state = { type: "loading", promise };
  try {
    if (image.src !== asset.src) image.src = asset.src;
  } catch (error) {
    settled = true;
    asset.state = { type: "idle" };
    reject(error);
  }
  return promise;
}
