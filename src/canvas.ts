import { COMPACT_GAME_HEIGHT, COMPACT_GAME_WIDTH, GAME_HEIGHT, GAME_WIDTH, MAX_DPR } from "@/src/constants.ts";

export interface GameCanvasSize {
  readonly width: number;
  readonly height: number;
}

interface GameCanvasDisplaySize extends GameCanvasSize {
  readonly scale: number;
}

type CanvasHost = Pick<
  typeof globalThis,
  "addEventListener" | "devicePixelRatio" | "innerHeight" | "innerWidth" | "removeEventListener"
>;

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
  host: CanvasHost,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  onApply?: (size: GameCanvasSize) => void,
): Disposable {
  const applyDpi = (): void => {
    const size = selectGameCanvasSize(host.innerWidth, host.innerHeight);
    const displaySize = selectGameCanvasDisplaySize(host.innerWidth, host.innerHeight, size);
    const dpr = Math.min(host.devicePixelRatio ?? 1, MAX_DPR);
    canvas.style.setProperty("--game-aspect-ratio", String(size.width / size.height));
    canvas.style.setProperty("--game-display-width", `${displaySize.width}px`);
    canvas.style.setProperty("--game-display-height", `${displaySize.height}px`);
    canvas.width = Math.round(size.width * dpr);
    canvas.height = Math.round(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onApply?.(size);
  };
  applyDpi();
  host.addEventListener("resize", applyDpi);
  return {
    [Symbol.dispose]() {
      host.removeEventListener("resize", applyDpi);
    },
  };
}
