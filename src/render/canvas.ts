import { debounce, DisposableListener } from "@/src/utils/helpers.ts";

export interface GameCanvasSize {
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;
export const MAX_DPR = 2;
export const DEFAULT_GAME_CANVAS_SIZE: GameCanvasSize = { width: GAME_WIDTH, height: GAME_HEIGHT, scale: 1 };

export function calculateGameCanvasDisplaySize(
  viewportWidth: number,
  viewportHeight: number,
  size: GameCanvasSize,
): GameCanvasSize {
  const aspectRatio = size.width / size.height;
  const widthAtFullHeight = viewportHeight * aspectRatio;
  if (widthAtFullHeight <= viewportWidth) {
    const height = Math.max(1, Math.floor(viewportHeight));
    return {
      width: Math.max(1, Math.round(height * aspectRatio)),
      height,
      scale: height / size.height,
    };
  }
  const width = Math.max(1, Math.floor(viewportWidth));
  return {
    width,
    height: Math.max(1, Math.round(width / aspectRatio)),
    scale: width / size.width,
  };
}

export function canvasSizeController(
  host: Window,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  onApply?: (size: GameCanvasSize) => void,
): Disposable {
  const applyDpi = (): void => {
    const size = { width: host.innerWidth, height: host.innerHeight, scale: 1 };
    const displaySize = calculateGameCanvasDisplaySize(host.innerWidth, host.innerHeight, size);
    const dpr = Math.min(host.devicePixelRatio ?? 1, MAX_DPR);
    canvas.style.setProperty("--game-aspect-ratio", String(size.width / size.height));
    canvas.style.setProperty("--game-display-width", `${displaySize.width}px`);
    canvas.style.setProperty("--game-display-height", `${displaySize.height}px`);
    canvas.width = Math.round(displaySize.width * dpr);
    canvas.height = Math.round(displaySize.height * dpr);
    ctx.setTransform(displaySize.scale * dpr, 0, 0, displaySize.scale * dpr, 0, 0);
    onApply?.(size);
  };
  applyDpi();
  const listener = new DisposableListener(host, "resize", debounce(applyDpi, 16));
  return {
    [Symbol.dispose]() {
      listener[Symbol.dispose]();
    },
  };
}
