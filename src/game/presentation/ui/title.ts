import type { TitleHoverButton, TitleIntent } from "@/src/game/model/state.ts";
import { imageForAsset } from "@/src/engine/canvas/mod.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import type { RenderSpy } from "@/src/game/presentation/frame_scratch.ts";
import type { PresentationUiAssets } from "@/src/game/presentation/asset_view.ts";
import { monoFont } from "@/src/game/presentation/ui/text.ts";

export type TitleButtonRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type TitlePoint = {
  readonly x: number;
  readonly y: number;
};

type CoverRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const FALLBACK_BACKGROUND = "#020406";
const BUTTON_LABELS = {
  start: "START GAME",
  resume: "RESUME GAME",
} as const satisfies Record<TitleIntent, string>;
const SETTINGS_BUTTON_LABEL = "SETTINGS";
const HELP_BUTTON_LABEL = "HELP";
const BUTTON_GAP_RATIO = 0.18;
const BUTTON_WIDTH_RATIO = 0.46;
const BUTTON_WIDTH_MIN = 180;
const BUTTON_WIDTH_MAX = 300;
const BUTTON_HEIGHT_RATIO = 0.085;
const BUTTON_HEIGHT_MIN = 48;
const BUTTON_HEIGHT_MAX = 60;
const PULSE_MS = 1400;
const SCAN_MS = 2200;

type TitleGeometryCache = {
  width: number;
  height: number;
  startButton: TitleButtonRect;
  settingsButton: TitleButtonRect;
  helpButton: TitleButtonRect;
};

let titleGeometryCache: TitleGeometryCache | undefined;

export function titleStartButtonRect(canvasSize: GameCanvasSize): TitleButtonRect {
  return titleGeometryFor(canvasSize).startButton;
}

export function titleSettingsButtonRect(canvasSize: GameCanvasSize): TitleButtonRect {
  return titleGeometryFor(canvasSize).settingsButton;
}

export function titleHelpButtonRect(canvasSize: GameCanvasSize): TitleButtonRect {
  return titleGeometryFor(canvasSize).helpButton;
}

function titleGeometryFor(canvasSize: GameCanvasSize): TitleGeometryCache {
  if (
    titleGeometryCache !== undefined &&
    titleGeometryCache.width === canvasSize.width &&
    titleGeometryCache.height === canvasSize.height
  ) {
    return titleGeometryCache;
  }
  const startButton = titleButtonRect(canvasSize);
  const gap = Math.round(startButton.height * BUTTON_GAP_RATIO);
  const settingsButton = {
    ...startButton,
    y: startButton.y - gap - startButton.height,
  };
  titleGeometryCache = {
    width: canvasSize.width,
    height: canvasSize.height,
    startButton,
    settingsButton,
    helpButton: {
      ...startButton,
      y: settingsButton.y - gap - startButton.height,
    },
  };
  return titleGeometryCache;
}

function titleButtonRect(canvasSize: GameCanvasSize): TitleButtonRect {
  const width = Math.min(
    BUTTON_WIDTH_MAX,
    Math.max(BUTTON_WIDTH_MIN, Math.round(canvasSize.width * BUTTON_WIDTH_RATIO)),
  );
  const height = Math.min(
    BUTTON_HEIGHT_MAX,
    Math.max(BUTTON_HEIGHT_MIN, Math.round(canvasSize.height * BUTTON_HEIGHT_RATIO)),
  );
  return {
    x: Math.round((canvasSize.width - width) / 2),
    y: Math.round(canvasSize.height * 0.86 - height / 2),
    width,
    height,
  };
}

export function titleStartButtonHit(canvasSize: GameCanvasSize, point: TitlePoint): boolean {
  return titleButtonHit(titleStartButtonRect(canvasSize), point);
}

export function titleSettingsButtonHit(canvasSize: GameCanvasSize, point: TitlePoint): boolean {
  return titleButtonHit(titleSettingsButtonRect(canvasSize), point);
}

export function titleHelpButtonHit(canvasSize: GameCanvasSize, point: TitlePoint): boolean {
  return titleButtonHit(titleHelpButtonRect(canvasSize), point);
}

export function titleHoverButtonAt(
  canvasSize: GameCanvasSize,
  point: TitlePoint,
): TitleHoverButton | undefined {
  if (titleHelpButtonHit(canvasSize, point)) return "help";
  if (titleSettingsButtonHit(canvasSize, point)) return "settings";
  if (titleStartButtonHit(canvasSize, point)) return "start";
  return undefined;
}

function titleButtonHit(rect: TitleButtonRect, point: TitlePoint): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y &&
    point.y < rect.y + rect.height;
}

export function renderTitle(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  assets: PresentationUiAssets["title"],
  intent: TitleIntent,
  nowMs = 0,
  hoverButton?: TitleHoverButton,
  _spy?: RenderSpy,
): void {
  const geometry = titleGeometryFor(canvasSize);
  const startButton = geometry.startButton;
  const settingsButton = geometry.settingsButton;
  const helpButton = geometry.helpButton;
  const image = imageForAsset(assets.background);

  ctx.save();
  ctx.fillStyle = FALLBACK_BACKGROUND;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  if (image !== undefined) {
    const rect = coverRect(
      canvasSize,
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
    );
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  }

  drawTitleButton(ctx, helpButton, HELP_BUTTON_LABEL, nowMs, "secondary", hoverButton === "help");
  drawTitleButton(ctx, settingsButton, SETTINGS_BUTTON_LABEL, nowMs, "secondary", hoverButton === "settings");
  drawTitleButton(ctx, startButton, BUTTON_LABELS[intent], nowMs, "primary", hoverButton === "start");
  ctx.restore();
}

export type TitleButtonVariant = "primary" | "secondary";

export function drawTitleButton(
  ctx: CanvasRenderingContext2D,
  button: TitleButtonRect,
  label: string,
  nowMs: number,
  variant: TitleButtonVariant = "primary",
  hovered = false,
): void {
  if (variant === "secondary") {
    drawSecondaryTitleButton(ctx, button, label, hovered);
    return;
  }

  drawPrimaryTitleButton(ctx, button, label, nowMs, hovered);
}

function drawPrimaryTitleButton(
  ctx: CanvasRenderingContext2D,
  button: TitleButtonRect,
  label: string,
  nowMs: number,
  hovered: boolean,
): void {
  const pulse = 0.5 + 0.5 * Math.sin((nowMs / PULSE_MS) * Math.PI * 2);
  const hoverBoost = hovered ? 0.55 : 0;
  const glow = 0.35 + pulse * 0.55 + hoverBoost;
  const centerX = button.x + button.width / 2;
  const centerY = button.y + button.height / 2;
  const fontSize = Math.min(22, Math.max(15, Math.round(button.height * 0.4)));
  const corner = Math.max(2, Math.round(button.height * 0.12));

  // Soft outer bloom
  ctx.shadowColor = `rgba(34, 255, 170, ${0.35 + pulse * 0.45 + hoverBoost})`;
  ctx.shadowBlur = 18 + pulse * 22 + (hovered ? 14 : 0);
  ctx.fillStyle = `rgba(4, 18, 12, ${0.72 + pulse * 0.1 + hoverBoost * 0.15})`;
  roundRect(ctx, button.x, button.y, button.width, button.height, corner);
  ctx.fill();

  // Inner panel
  ctx.shadowBlur = 0;
  const panel = ctx.createLinearGradient(button.x, button.y, button.x, button.y + button.height);
  panel.addColorStop(0, `rgba(18, 48, 36, ${0.88 + pulse * 0.08 + hoverBoost * 0.1})`);
  panel.addColorStop(0.45, hovered ? "rgba(25, 98, 98, 0.54)" : "rgba(6, 20, 14, 0.92)");
  panel.addColorStop(1, `rgba(10, 36, 24, ${0.9 + pulse * 0.06 + hoverBoost * 0.08})`);
  ctx.fillStyle = panel;
  roundRect(ctx, button.x + 1, button.y + 1, button.width - 2, button.height - 2, Math.max(1, corner - 1));
  ctx.fill();

  // Scanning highlight
  const scanT = (nowMs % SCAN_MS) / SCAN_MS;
  const scanX = button.x - button.width * 0.25 + scanT * (button.width * 1.5);
  const scan = ctx.createLinearGradient(scanX, 0, scanX + button.width * 0.35, 0);
  scan.addColorStop(0, "rgba(142, 247, 166, 0)");
  scan.addColorStop(0.5, `rgba(142, 247, 166, ${0.08 + pulse * 0.1 + hoverBoost * 0.12})`);
  scan.addColorStop(1, "rgba(142, 247, 166, 0)");
  ctx.save();
  roundRect(ctx, button.x + 2, button.y + 2, button.width - 4, button.height - 4, Math.max(1, corner - 1));
  ctx.clip();
  ctx.fillStyle = scan;
  ctx.fillRect(button.x, button.y, button.width, button.height);
  ctx.restore();

  // Nested neon borders
  ctx.strokeStyle = `rgba(142, 247, 166, ${0.35 + glow * 0.45})`;
  ctx.lineWidth = hovered ? 2 : 1.5;
  ctx.shadowColor = `rgba(34, 255, 170, ${0.55 + pulse * 0.35 + hoverBoost})`;
  ctx.shadowBlur = 10 + pulse * 14 + (hovered ? 10 : 0);
  roundRect(ctx, button.x + 0.5, button.y + 0.5, button.width - 1, button.height - 1, corner);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(56, 255, 196, ${0.55 + pulse * 0.35 + hoverBoost * 0.3})`;
  ctx.lineWidth = 1;
  roundRect(ctx, button.x + 4.5, button.y + 4.5, button.width - 9, button.height - 9, Math.max(1, corner - 2));
  ctx.stroke();

  // Corner ticks
  drawCornerTicks(ctx, button, glow);

  // Label
  ctx.font = monoFont(700, fontSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = `rgba(34, 255, 170, ${0.55 + pulse * 0.4 + hoverBoost})`;
  ctx.shadowBlur = 12 + pulse * 16 + (hovered ? 8 : 0);
  ctx.fillStyle = `rgba(190, 255, 220, ${0.82 + pulse * 0.18})`;
  ctx.fillText(label, centerX, centerY + 0.5);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#eafff4";
  ctx.fillText(label, centerX, centerY + 0.5);
}

function drawSecondaryTitleButton(
  ctx: CanvasRenderingContext2D,
  button: TitleButtonRect,
  label: string,
  hovered: boolean,
): void {
  const centerX = button.x + button.width / 2;
  const centerY = button.y + button.height / 2;
  const fontSize = Math.min(18, Math.max(13, Math.round(button.height * 0.34)));
  const corner = Math.max(2, Math.round(button.height * 0.12));

  if (hovered) {
    ctx.shadowColor = "rgba(34, 255, 170, 0.45)";
    ctx.shadowBlur = 14;
  }
  ctx.fillStyle = hovered ? "rgba(12, 28, 22, 0.78)" : "rgba(8, 14, 18, 0.55)";
  roundRect(ctx, button.x, button.y, button.width, button.height, corner);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = hovered ? "rgba(142, 247, 166, 0.72)" : "rgba(142, 180, 168, 0.42)";
  ctx.lineWidth = hovered ? 1.5 : 1;
  roundRect(ctx, button.x + 0.5, button.y + 0.5, button.width - 1, button.height - 1, corner);
  ctx.stroke();

  if (hovered) {
    ctx.strokeStyle = "rgba(56, 255, 196, 0.45)";
    ctx.lineWidth = 1;
    roundRect(ctx, button.x + 3.5, button.y + 3.5, button.width - 7, button.height - 7, Math.max(1, corner - 1));
    ctx.stroke();
  }

  ctx.font = monoFont(hovered ? 600 : 400, fontSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = hovered ? "#eafff4" : "#c0d8ce";
  ctx.fillText(label, centerX, centerY + 0.5);
}

function drawCornerTicks(ctx: CanvasRenderingContext2D, button: TitleButtonRect, glow: number): void {
  const tick = Math.max(8, Math.round(button.height * 0.28));
  const inset = 3;
  ctx.strokeStyle = `rgba(142, 247, 166, ${0.55 + glow * 0.35})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  // top-left
  ctx.moveTo(button.x + inset, button.y + inset + tick);
  ctx.lineTo(button.x + inset, button.y + inset);
  ctx.lineTo(button.x + inset + tick, button.y + inset);
  // top-right
  ctx.moveTo(button.x + button.width - inset - tick, button.y + inset);
  ctx.lineTo(button.x + button.width - inset, button.y + inset);
  ctx.lineTo(button.x + button.width - inset, button.y + inset + tick);
  // bottom-left
  ctx.moveTo(button.x + inset, button.y + button.height - inset - tick);
  ctx.lineTo(button.x + inset, button.y + button.height - inset);
  ctx.lineTo(button.x + inset + tick, button.y + button.height - inset);
  // bottom-right
  ctx.moveTo(button.x + button.width - inset - tick, button.y + button.height - inset);
  ctx.lineTo(button.x + button.width - inset, button.y + button.height - inset);
  ctx.lineTo(button.x + button.width - inset, button.y + button.height - inset - tick);
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function coverRect(canvasSize: GameCanvasSize, imageWidth: number, imageHeight: number): CoverRect {
  const imageAspect = imageWidth / imageHeight;
  const canvasAspect = canvasSize.width / canvasSize.height;
  if (imageAspect > canvasAspect) {
    const height = canvasSize.height;
    const width = height * imageAspect;
    return {
      x: Math.round((canvasSize.width - width) / 2),
      y: 0,
      width,
      height,
    };
  }

  const width = canvasSize.width;
  const height = width / imageAspect;
  return {
    x: 0,
    y: Math.round((canvasSize.height - height) / 2),
    width,
    height,
  };
}
