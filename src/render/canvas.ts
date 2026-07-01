export interface GameCanvasSize {
  readonly width: number;
  readonly height: number;
}

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;
export const COMPACT_GAME_WIDTH = 360;
export const COMPACT_GAME_HEIGHT = 720;
export const MAX_DPR = 2;
export const DEFAULT_GAME_CANVAS_SIZE: GameCanvasSize = { width: GAME_WIDTH, height: GAME_HEIGHT };

interface GameCanvasDisplaySize extends GameCanvasSize {
  readonly scale: number;
}

export function selectGameCanvasSize(viewportWidth: number, viewportHeight: number): GameCanvasSize {
  if (viewportWidth < GAME_WIDTH || viewportHeight < GAME_HEIGHT) {
    return { width: COMPACT_GAME_WIDTH, height: COMPACT_GAME_HEIGHT };
  }
  return { width: GAME_WIDTH, height: GAME_HEIGHT };
}

export function selectGameCanvasDisplaySize(
  viewportWidth: number,
  viewportHeight: number,
  size: GameCanvasSize,
): GameCanvasDisplaySize {
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

export function configureCanvasDpi(
  window: Window,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  onApply?: (size: GameCanvasSize) => void,
): Disposable {
  const applyDpi = (): void => {
    const size = selectGameCanvasSize(window.innerWidth, window.innerHeight);
    const displaySize = selectGameCanvasDisplaySize(window.innerWidth, window.innerHeight, size);
    const dpr = Math.min(window.devicePixelRatio ?? 1, MAX_DPR);
    canvas.style.setProperty("--game-aspect-ratio", String(size.width / size.height));
    canvas.style.setProperty("--game-display-width", `${displaySize.width}px`);
    canvas.style.setProperty("--game-display-height", `${displaySize.height}px`);
    canvas.width = Math.round(displaySize.width * dpr);
    canvas.height = Math.round(displaySize.height * dpr);
    ctx.setTransform(displaySize.scale * dpr, 0, 0, displaySize.scale * dpr, 0, 0);
    onApply?.(size);
  };
  applyDpi();
  window.addEventListener("resize", applyDpi);
  return {
    [Symbol.dispose]() {
      window.removeEventListener("resize", applyDpi);
    },
  };
}
