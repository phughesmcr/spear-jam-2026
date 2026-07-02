import { VERBS } from "@/src/game/verbs.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";

type VerbLabel = "ATTACK" | "USE" | "OPEN" | "EXAMINE" | "TALK";
export type VerbMenuPoint = {
  readonly x: number;
  readonly y: number;
};
export type VerbMenuSpriteRect = VerbMenuPoint & {
  readonly size: number;
};
type VerbHotspot = {
  readonly label: VerbLabel;
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly labelX: number;
  readonly labelY: number;
};

const PANEL_MARGIN = 12;
const PANEL_WIDTH = 148;
const PANEL_PADDING = 10;
const TITLE_HEIGHT = 22;
const ITEM_HEIGHT = 28;
const PANEL_BACKGROUND = "rgba(6, 8, 13, 0.82)";
const PANEL_BORDER = "rgba(148, 163, 184, 0.65)";
const SELECTED_BACKGROUND = "rgba(34, 211, 238, 0.22)";
const SELECTED_BORDER = "#22d3ee";
const TEXT_COLOR = "#f8fafc";
const MUTED_TEXT_COLOR = "#94a3b8";
const HOTSPOT_STROKE = "rgba(103, 232, 249, 0.86)";
const LABEL_BACKGROUND = "rgba(3, 7, 18, 0.62)";
const MENU_SCRIM = "rgba(0, 0, 0, 0.66)";
const LABEL_MARGIN = 8;
const VERB_MENU_SPRITE_SRC = new URL("../../assets/game/ui/verb_menu_cutout.png", import.meta.url).href;
const GLOW_SOURCES: Record<VerbLabel, string> = {
  ATTACK: new URL("../../assets/game/ui/verb_menu_glow_attack.png", import.meta.url).href,
  USE: new URL("../../assets/game/ui/verb_menu_glow_use.png", import.meta.url).href,
  OPEN: new URL("../../assets/game/ui/verb_menu_glow_open.png", import.meta.url).href,
  EXAMINE: new URL("../../assets/game/ui/verb_menu_glow_examine.png", import.meta.url).href,
  TALK: new URL("../../assets/game/ui/verb_menu_glow_talk.png", import.meta.url).href,
};
const HOTSPOTS: readonly VerbHotspot[] = [
  // Body-part directions use the doll's left/right, so ATTACK is the screen-right knife hand.
  { label: "ATTACK", centerX: 0.86, centerY: 0.39, radiusX: 0.13, radiusY: 0.22, labelX: 0.78, labelY: 0.19 },
  { label: "USE", centerX: 0.17, centerY: 0.44, radiusX: 0.17, radiusY: 0.16, labelX: 0.08, labelY: 0.28 },
  { label: "OPEN", centerX: 0.53, centerY: 0.57, radiusX: 0.12, radiusY: 0.13, labelX: 0.43, labelY: 0.72 },
  { label: "EXAMINE", centerX: 0.5, centerY: 0.27, radiusX: 0.17, radiusY: 0.08, labelX: 0.36, labelY: 0.14 },
  { label: "TALK", centerX: 0.5, centerY: 0.37, radiusX: 0.16, radiusY: 0.08, labelX: 0.42, labelY: 0.42 },
];

type ImageAsset = {
  readonly src: string;
  image?: HTMLImageElement;
  loaded: boolean;
  failed: boolean;
};

const spriteAsset: ImageAsset = { src: VERB_MENU_SPRITE_SRC, loaded: false, failed: false };
const glowAssets: Record<VerbLabel, ImageAsset> = {
  ATTACK: { src: GLOW_SOURCES.ATTACK, loaded: false, failed: false },
  USE: { src: GLOW_SOURCES.USE, loaded: false, failed: false },
  OPEN: { src: GLOW_SOURCES.OPEN, loaded: false, failed: false },
  EXAMINE: { src: GLOW_SOURCES.EXAMINE, loaded: false, failed: false },
  TALK: { src: GLOW_SOURCES.TALK, loaded: false, failed: false },
};

export function renderVerbMenu(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  selectedIndex: number,
  onAssetLoad?: () => void,
): void {
  const sprite = loadedImage(ctx, spriteAsset, onAssetLoad);
  if (sprite !== undefined) {
    renderSpriteVerbMenu(ctx, canvasSize, selectedIndex, sprite, onAssetLoad);
    return;
  }
  renderTextVerbMenu(ctx, canvasSize, selectedIndex);
}

export function verbMenuSpriteRect(canvasSize: GameCanvasSize): VerbMenuSpriteRect {
  const size = Math.max(1, Math.min(canvasSize.width, canvasSize.height));
  return {
    x: Math.round((canvasSize.width - size) / 2),
    y: Math.round((canvasSize.height - size) / 2),
    size,
  };
}

export function verbMenuHotspotIndexAt(
  canvasSize: GameCanvasSize,
  point: VerbMenuPoint,
): number | undefined {
  const rect = verbMenuSpriteRect(canvasSize);
  const localX = (point.x - rect.x) / rect.size;
  const localY = (point.y - rect.y) / rect.size;
  if (localX < 0 || localX > 1 || localY < 0 || localY > 1) return undefined;

  for (const hotspot of HOTSPOTS) {
    const dx = (localX - hotspot.centerX) / hotspot.radiusX;
    const dy = (localY - hotspot.centerY) / hotspot.radiusY;
    if (dx * dx + dy * dy <= 1) return verbIndexForLabel(hotspot.label);
  }

  return undefined;
}

function renderTextVerbMenu(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  selectedIndex: number,
): void {
  const width = Math.min(PANEL_WIDTH, canvasSize.width - PANEL_MARGIN * 2);
  const height = PANEL_PADDING * 2 + TITLE_HEIGHT + VERBS.length * ITEM_HEIGHT;
  const x = canvasSize.width - width - PANEL_MARGIN;
  const y = Math.max(PANEL_MARGIN, Math.round((canvasSize.height - height) * 0.36));

  ctx.save();
  ctx.fillStyle = PANEL_BACKGROUND;
  ctx.strokeStyle = PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

  ctx.font = "700 12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = MUTED_TEXT_COLOR;
  ctx.fillText("VERB", x + PANEL_PADDING, y + PANEL_PADDING + TITLE_HEIGHT / 2);

  ctx.font = "700 14px ui-monospace, SFMono-Regular, Menlo, monospace";
  for (let i = 0; i < VERBS.length; i++) {
    const itemY = y + PANEL_PADDING + TITLE_HEIGHT + i * ITEM_HEIGHT;
    const selected = i === selectedIndex;
    if (selected) {
      ctx.fillStyle = SELECTED_BACKGROUND;
      ctx.strokeStyle = SELECTED_BORDER;
      ctx.fillRect(x + PANEL_PADDING - 4, itemY + 3, width - PANEL_PADDING * 2 + 8, ITEM_HEIGHT - 6);
      ctx.strokeRect(x + PANEL_PADDING - 3.5, itemY + 3.5, width - PANEL_PADDING * 2 + 7, ITEM_HEIGHT - 7);
    }

    ctx.fillStyle = selected ? TEXT_COLOR : MUTED_TEXT_COLOR;
    ctx.fillText(VERBS[i]!.label, x + PANEL_PADDING, itemY + ITEM_HEIGHT / 2);
  }

  ctx.restore();
}

function renderSpriteVerbMenu(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  selectedIndex: number,
  sprite: HTMLImageElement,
  onAssetLoad?: () => void,
): void {
  const rect = verbMenuSpriteRect(canvasSize);
  const selectedHotspot = HOTSPOTS.find((hotspot) => hotspot.label === VERBS[selectedIndex]?.label);
  const selectedGlow = selectedHotspot === undefined ?
    undefined :
    loadedImage(ctx, glowAssets[selectedHotspot.label], onAssetLoad);

  ctx.save();
  ctx.fillStyle = MENU_SCRIM;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  drawMenuVignette(ctx, canvasSize, rect);
  ctx.drawImage(sprite, rect.x, rect.y, rect.size, rect.size);

  if (selectedHotspot !== undefined) {
    if (selectedGlow === undefined) {
      drawHotspotFallbackGlow(ctx, rect, selectedHotspot);
    } else {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.drawImage(selectedGlow, rect.x, rect.y, rect.size, rect.size);
      ctx.restore();
    }
  }

  for (const hotspot of HOTSPOTS) {
    drawHotspotLabel(ctx, canvasSize, rect, hotspot, hotspot === selectedHotspot);
  }

  ctx.restore();
}

function drawMenuVignette(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  rect: VerbMenuSpriteRect,
): void {
  const centerX = rect.x + rect.size / 2;
  const centerY = rect.y + rect.size / 2;
  const outerRadius = Math.max(canvasSize.width, canvasSize.height) * 0.68;
  const gradient = ctx.createRadialGradient(centerX, centerY, rect.size * 0.2, centerX, centerY, outerRadius);
  gradient.addColorStop(0, "rgba(10, 16, 24, 0.06)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.48)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
}

function drawHotspotFallbackGlow(
  ctx: CanvasRenderingContext2D,
  rect: VerbMenuSpriteRect,
  hotspot: VerbHotspot,
): void {
  const centerX = rect.x + hotspot.centerX * rect.size;
  const centerY = rect.y + hotspot.centerY * rect.size;
  const radiusX = hotspot.radiusX * rect.size;
  const radiusY = hotspot.radiusY * rect.size;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(radiusX, radiusY);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  gradient.addColorStop(0, "rgba(236, 254, 255, 0.26)");
  gradient.addColorStop(0.42, "rgba(34, 211, 238, 0.20)");
  gradient.addColorStop(1, "rgba(34, 211, 238, 0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHotspotLabel(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  rect: VerbMenuSpriteRect,
  hotspot: VerbHotspot,
  selected: boolean,
): void {
  const fontSize = Math.min(18, Math.max(12, Math.round(rect.size * 0.036)));
  ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const width = ctx.measureText(hotspot.label).width + fontSize;
  const height = fontSize + 8;
  const labelX = clamp(rect.x + hotspot.labelX * rect.size, LABEL_MARGIN, canvasSize.width - width - LABEL_MARGIN);
  const labelY = clamp(
    rect.y + hotspot.labelY * rect.size,
    LABEL_MARGIN + height / 2,
    canvasSize.height - LABEL_MARGIN - height / 2,
  );
  ctx.fillStyle = LABEL_BACKGROUND;
  ctx.fillRect(labelX - 4, labelY - height / 2, width, height);
  ctx.strokeStyle = selected ? HOTSPOT_STROKE : PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(labelX - 3.5, labelY - height / 2 + 0.5, width - 1, height - 1);
  ctx.fillStyle = selected ? TEXT_COLOR : MUTED_TEXT_COLOR;
  ctx.fillText(hotspot.label, labelX + fontSize * 0.2, labelY + 0.5);
}

function loadedImage(
  ctx: CanvasRenderingContext2D,
  asset: ImageAsset,
  onAssetLoad?: () => void,
): HTMLImageElement | undefined {
  if (asset.loaded) return asset.image;
  if (asset.failed) return undefined;

  if (asset.image === undefined) {
    const image = ctx.canvas.ownerDocument.createElement("img");
    image.decoding = "async";
    image.addEventListener("load", () => {
      asset.loaded = true;
      onAssetLoad?.();
    }, { once: true });
    image.addEventListener("error", () => {
      asset.failed = true;
      onAssetLoad?.();
    }, { once: true });
    image.src = asset.src;
    asset.image = image;
  }

  return undefined;
}

function verbIndexForLabel(label: VerbLabel): number | undefined {
  const index = VERBS.findIndex((verb) => verb.label === label);
  return index >= 0 ? index : undefined;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}
