import type { CanvasSize } from "@/src/engine/canvas/mod.ts";

const MAX_DPR = 2;

export function calculateGameCanvasDisplaySize(
  viewportWidth: number,
  viewportHeight: number,
  size: CanvasSize,
): Required<CanvasSize> {
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
  logicalSize: CanvasSize,
  onApply?: (size: CanvasSize) => void,
): Disposable {
  const applyDpi = (): void => {
    const displaySize = calculateGameCanvasDisplaySize(host.innerWidth, host.innerHeight, logicalSize);
    const dpr = Math.min(host.devicePixelRatio ?? 1, MAX_DPR);
    canvas.style.setProperty("--game-aspect-ratio", String(logicalSize.width / logicalSize.height));
    canvas.style.setProperty("--game-display-width", `${displaySize.width}px`);
    canvas.style.setProperty("--game-display-height", `${displaySize.height}px`);
    canvas.width = Math.round(displaySize.width * dpr);
    canvas.height = Math.round(displaySize.height * dpr);
    ctx.setTransform(displaySize.scale * dpr, 0, 0, displaySize.scale * dpr, 0, 0);
    onApply?.(logicalSize);
  };
  applyDpi();
  const handleResize = debounce(applyDpi, 16);
  host.addEventListener("resize", handleResize);
  return {
    [Symbol.dispose](): void {
      host.removeEventListener("resize", handleResize);
    },
  };
}

function debounce<This, Args extends unknown[]>(
  func: (this: This, ...args: Args) => void,
  delay: number,
): (this: This, ...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return function (this: This, ...args: Args): void {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}
