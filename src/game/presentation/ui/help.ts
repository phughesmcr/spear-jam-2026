import { createImageAsset, loadedImage, preloadImageAsset } from "@/src/engine/canvas/image_assets.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import { monoFont } from "@/src/game/presentation/ui/text.ts";

type HelpImageRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const HELP_IMAGE_SRC = new URL("../../../../assets/game/help.png", import.meta.url).href;
const HELP_BACKGROUND = "rgba(0, 0, 0, 0.9)";
const HELP_FALLBACK_TEXT = "#e0f2fe";

const helpAsset = createImageAsset(HELP_IMAGE_SRC);

export async function preloadHelpAssets(document: Document, onAssetLoad?: () => void): Promise<void> {
  await preloadImageAsset(document, helpAsset, onAssetLoad);
}

export function renderHelp(ctx: CanvasRenderingContext2D, canvasSize: GameCanvasSize, onAssetLoad?: () => void): void {
  const image = loadedImage(ctx, helpAsset, onAssetLoad);

  ctx.save();
  ctx.fillStyle = HELP_BACKGROUND;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

  if (image === undefined) {
    renderHelpFallback(ctx, canvasSize);
    ctx.restore();
    return;
  }

  const rect = helpImageRect(
    canvasSize,
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
  );
  ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function helpImageRect(canvasSize: GameCanvasSize, imageWidth: number, imageHeight: number): HelpImageRect {
  const imageAspect = imageWidth / imageHeight;
  const canvasAspect = canvasSize.width / canvasSize.height;
  if (imageAspect > canvasAspect) {
    const width = canvasSize.width;
    const height = width / imageAspect;
    return {
      x: 0,
      y: Math.round((canvasSize.height - height) / 2),
      width,
      height,
    };
  }

  const height = canvasSize.height;
  const width = height * imageAspect;
  return {
    x: Math.round((canvasSize.width - width) / 2),
    y: 0,
    width,
    height,
  };
}

function renderHelpFallback(ctx: CanvasRenderingContext2D, canvasSize: GameCanvasSize): void {
  const fontSize = Math.min(24, Math.max(14, Math.floor(canvasSize.width * 0.05)));
  ctx.font = monoFont(700, fontSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = HELP_FALLBACK_TEXT;
  ctx.fillText("LOADING HELP", canvasSize.width / 2, canvasSize.height / 2);
}
