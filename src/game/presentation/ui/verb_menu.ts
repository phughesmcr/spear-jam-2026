import type { CommandSlot, VerbMenuControl, VerbMenuTarget } from "@/src/game/model/state.ts";
import { type VerbId, VERBS } from "@/src/game/model/verbs.ts";
import { createImageAsset, type ImageAsset, imageForAsset, preloadImageAssets } from "@/src/engine/canvas/mod.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import { monoFont } from "@/src/game/presentation/ui/text.ts";

export type VerbMenuPoint = {
  readonly x: number;
  readonly y: number;
};
export type VerbMenuSpriteRect = VerbMenuPoint & {
  readonly size: number;
};
export type VerbMenuButtonRect = {
  readonly label: string;
  readonly target: Exclude<VerbMenuTarget, { readonly kind: "verb" }>;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};
type VerbMenuRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};
type VerbHotspotSpec = {
  readonly glowSrc: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly labelX: number;
  readonly labelY: number;
};
type VerbHotspot = VerbHotspotSpec & {
  readonly verbId: VerbId;
  readonly verbIndex: number;
  readonly label: string;
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
const LABEL_HIT_TEXT_WIDTH_RATIO = 0.72;
const BOTTOM_CONTROL_BUTTONS = [
  { label: "WAIT", target: { kind: "control", control: "wait" } },
  { label: "MAP", target: { kind: "control", control: "toggleView" } },
  { label: "HELP", target: { kind: "control", control: "help" } },
] as const satisfies readonly {
  readonly label: string;
  readonly target: { readonly kind: "control"; readonly control: VerbMenuControl };
}[];
const CLOSE_BUTTON = {
  label: "CLOSE",
  target: { kind: "control", control: "close" },
} as const satisfies {
  readonly label: string;
  readonly target: { readonly kind: "control"; readonly control: VerbMenuControl };
};
const WEAPON_BUTTONS = [
  { label: "BLADE", target: { kind: "weapon", slot: 1 } },
  { label: "GUN", target: { kind: "weapon", slot: 2 } },
  { label: "CANNON", target: { kind: "weapon", slot: 3 } },
] as const satisfies readonly {
  readonly label: string;
  readonly target: { readonly kind: "weapon"; readonly slot: CommandSlot };
}[];
const MENU_BUTTON_MARGIN = 18;
const MENU_BUTTON_GAP = 10;
const MENU_BUTTON_HEIGHT_MIN = 42;
const MENU_BUTTON_HEIGHT_MAX = 52;
const MENU_BUTTON_WIDTH_MAX = 150;
const CLOSE_BUTTON_WIDTH = 112;
const MENU_BUTTON_BACKGROUND = "rgba(8, 13, 22, 0.82)";
const MENU_BUTTON_BORDER = "rgba(125, 211, 252, 0.72)";
const MENU_BUTTON_TEXT = "#e0f2fe";
const MENU_BUTTON_SELECTED_BACKGROUND = "rgba(34, 211, 238, 0.28)";
const VERB_MENU_SPRITE_SRC = new URL("../../../../assets/game/ui/verb_menu_cutout.png", import.meta.url).href;
const HOTSPOT_SPECS: Readonly<Record<VerbId, VerbHotspotSpec>> = {
  // Body-part directions use the doll's left/right, so ATTACK is the screen-right knife hand.
  attack: {
    glowSrc: new URL("../../../../assets/game/ui/verb_menu_glow_attack.png", import.meta.url).href,
    centerX: 0.86,
    centerY: 0.39,
    radiusX: 0.13,
    radiusY: 0.22,
    labelX: 0.78,
    labelY: 0.19,
  },
  use: {
    glowSrc: new URL("../../../../assets/game/ui/verb_menu_glow_use.png", import.meta.url).href,
    centerX: 0.17,
    centerY: 0.44,
    radiusX: 0.17,
    radiusY: 0.16,
    labelX: 0.08,
    labelY: 0.28,
  },
  open: {
    glowSrc: new URL("../../../../assets/game/ui/verb_menu_glow_open.png", import.meta.url).href,
    centerX: 0.53,
    centerY: 0.57,
    radiusX: 0.12,
    radiusY: 0.13,
    labelX: 0.43,
    labelY: 0.72,
  },
  examine: {
    glowSrc: new URL("../../../../assets/game/ui/verb_menu_glow_examine.png", import.meta.url).href,
    centerX: 0.5,
    centerY: 0.27,
    radiusX: 0.17,
    radiusY: 0.08,
    labelX: 0.36,
    labelY: 0.14,
  },
  talk: {
    glowSrc: new URL("../../../../assets/game/ui/verb_menu_glow_talk.png", import.meta.url).href,
    centerX: 0.5,
    centerY: 0.37,
    radiusX: 0.16,
    radiusY: 0.08,
    labelX: 0.42,
    labelY: 0.42,
  },
};
const HOTSPOTS: readonly VerbHotspot[] = Object.freeze(
  VERBS.map((verb, verbIndex) => ({
    ...HOTSPOT_SPECS[verb.id],
    verbId: verb.id,
    verbIndex,
    label: verb.label,
  })),
);
const HOTSPOTS_BY_VERB_ID: Readonly<Record<VerbId, VerbHotspot>> = Object.freeze(
  Object.fromEntries(HOTSPOTS.map((hotspot) => [hotspot.verbId, hotspot])) as Record<VerbId, VerbHotspot>,
);

const spriteAsset = createImageAsset(VERB_MENU_SPRITE_SRC);
const glowAssets = Object.fromEntries(
  VERBS.map((verb) => [verb.id, createImageAsset(HOTSPOT_SPECS[verb.id].glowSrc)]),
) as Record<VerbId, ImageAsset>;
const IMAGE_ASSETS = Object.freeze([spriteAsset, ...VERBS.map((verb) => glowAssets[verb.id])]);

export async function preloadVerbMenuAssets(document: Document, onAssetLoad?: () => void): Promise<void> {
  await preloadImageAssets(document, IMAGE_ASSETS, onAssetLoad);
}

export function renderVerbMenu(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  _selectedIndex: number,
  hoverTarget?: VerbMenuTarget,
): void {
  const sprite = imageForAsset(spriteAsset);
  if (sprite !== undefined) {
    renderSpriteVerbMenu(ctx, canvasSize, hoverTarget, sprite);
    return;
  }
  renderTextVerbMenu(ctx, canvasSize, hoverTarget);
}

export function verbMenuSpriteRect(canvasSize: GameCanvasSize): VerbMenuSpriteRect {
  const size = Math.max(1, Math.min(canvasSize.width, canvasSize.height));
  return {
    x: Math.round((canvasSize.width - size) / 2),
    y: Math.round((canvasSize.height - size) / 2),
    size,
  };
}

export function verbMenuTargetAt(
  canvasSize: GameCanvasSize,
  point: VerbMenuPoint,
): VerbMenuTarget | undefined {
  for (const rect of verbMenuButtonRects(canvasSize)) {
    if (pointInRect(point, rect)) return rect.target;
  }

  const verbIndex = verbMenuVerbIndexAt(canvasSize, point);
  return verbIndex === undefined ? undefined : { kind: "verb", verbIndex };
}

export function verbMenuButtonRects(canvasSize: GameCanvasSize): readonly VerbMenuButtonRect[] {
  const gap = MENU_BUTTON_GAP;
  const availableWidth = Math.max(1, canvasSize.width - MENU_BUTTON_MARGIN * 2);
  const height = Math.round(clamp(
    Math.min(canvasSize.width, canvasSize.height) * 0.068,
    MENU_BUTTON_HEIGHT_MIN,
    MENU_BUTTON_HEIGHT_MAX,
  ));
  const weaponRects = buttonRowRects(
    WEAPON_BUTTONS,
    availableWidth,
    canvasSize.width,
    canvasSize.height - height - MENU_BUTTON_MARGIN,
    height,
    gap,
  );
  const controlRects = buttonRowRects(
    BOTTOM_CONTROL_BUTTONS,
    availableWidth,
    canvasSize.width,
    canvasSize.height - height * 2 - gap - MENU_BUTTON_MARGIN,
    height,
    gap,
  );
  const closeRect = topRightButtonRect(CLOSE_BUTTON, availableWidth, canvasSize.width, height);

  return [closeRect, ...controlRects, ...weaponRects];
}

function buttonRowRects(
  specs: readonly {
    readonly label: string;
    readonly target: Exclude<VerbMenuTarget, { readonly kind: "verb" }>;
  }[],
  availableWidth: number,
  canvasWidth: number,
  y: number,
  height: number,
  gap: number,
): readonly VerbMenuButtonRect[] {
  const width = Math.max(
    1,
    Math.floor(Math.min(
      MENU_BUTTON_WIDTH_MAX,
      (availableWidth - gap * (specs.length - 1)) / specs.length,
    )),
  );
  const totalWidth = width * specs.length + gap * (specs.length - 1);
  const x = Math.round((canvasWidth - totalWidth) / 2);

  return specs.map((spec, index) => ({
    label: spec.label,
    target: spec.target,
    x: x + index * (width + gap),
    y,
    width,
    height,
  }));
}

function topRightButtonRect(
  spec: {
    readonly label: string;
    readonly target: Exclude<VerbMenuTarget, { readonly kind: "verb" }>;
  },
  availableWidth: number,
  canvasWidth: number,
  height: number,
): VerbMenuButtonRect {
  const width = Math.max(1, Math.min(CLOSE_BUTTON_WIDTH, availableWidth));
  return {
    label: spec.label,
    target: spec.target,
    x: canvasWidth - MENU_BUTTON_MARGIN - width,
    y: MENU_BUTTON_MARGIN,
    width,
    height,
  };
}

function verbMenuVerbIndexAt(
  canvasSize: GameCanvasSize,
  point: VerbMenuPoint,
): number | undefined {
  const rect = verbMenuSpriteRect(canvasSize);

  for (const hotspot of HOTSPOTS) {
    if (pointInRect(point, hotspotLabelRect(canvasSize, rect, hotspot))) return hotspot.verbIndex;
  }

  const localX = (point.x - rect.x) / rect.size;
  const localY = (point.y - rect.y) / rect.size;
  if (localX < 0 || localX > 1 || localY < 0 || localY > 1) return undefined;

  for (const hotspot of HOTSPOTS) {
    const dx = (localX - hotspot.centerX) / hotspot.radiusX;
    const dy = (localY - hotspot.centerY) / hotspot.radiusY;
    if (dx * dx + dy * dy <= 1) return hotspot.verbIndex;
  }

  return undefined;
}

function renderTextVerbMenu(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  hoverTarget: VerbMenuTarget | undefined,
): void {
  const activeTarget = hoverTarget;
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

  ctx.font = monoFont(700, 12);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = MUTED_TEXT_COLOR;
  ctx.fillText("VERB", x + PANEL_PADDING, y + PANEL_PADDING + TITLE_HEIGHT / 2);

  ctx.font = monoFont(700, 14);
  for (let i = 0; i < VERBS.length; i++) {
    const itemY = y + PANEL_PADDING + TITLE_HEIGHT + i * ITEM_HEIGHT;
    const selected = activeTarget?.kind === "verb" && i === activeTarget.verbIndex;
    if (selected) {
      ctx.fillStyle = SELECTED_BACKGROUND;
      ctx.strokeStyle = SELECTED_BORDER;
      ctx.fillRect(x + PANEL_PADDING - 4, itemY + 3, width - PANEL_PADDING * 2 + 8, ITEM_HEIGHT - 6);
      ctx.strokeRect(x + PANEL_PADDING - 3.5, itemY + 3.5, width - PANEL_PADDING * 2 + 7, ITEM_HEIGHT - 7);
    }

    ctx.fillStyle = selected ? TEXT_COLOR : MUTED_TEXT_COLOR;
    ctx.fillText(VERBS[i]!.label, x + PANEL_PADDING, itemY + ITEM_HEIGHT / 2);
  }

  drawMenuButtons(ctx, canvasSize, activeTarget);
  ctx.restore();
}

function renderSpriteVerbMenu(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  hoverTarget: VerbMenuTarget | undefined,
  sprite: HTMLImageElement,
): void {
  const rect = verbMenuSpriteRect(canvasSize);
  const activeTarget = hoverTarget;
  const selectedVerb = activeTarget?.kind === "verb" ? VERBS[activeTarget.verbIndex] : undefined;
  const selectedHotspot = selectedVerb === undefined ? undefined : HOTSPOTS_BY_VERB_ID[selectedVerb.id];
  const selectedGlow = selectedHotspot === undefined ? undefined : imageForAsset(glowAssets[selectedHotspot.verbId]);

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

  drawMenuButtons(ctx, canvasSize, activeTarget);
  ctx.restore();
}

function drawMenuButtons(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  activeTarget: VerbMenuTarget | undefined,
): void {
  const rects = verbMenuButtonRects(canvasSize);
  const fontSize = Math.min(15, Math.max(12, Math.round(rects[0]?.height ?? MENU_BUTTON_HEIGHT_MIN) * 0.3));

  ctx.font = monoFont(700, fontSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const rect of rects) {
    const selected = sameButtonTarget(rect.target, activeTarget);
    ctx.fillStyle = selected ? MENU_BUTTON_SELECTED_BACKGROUND : MENU_BUTTON_BACKGROUND;
    ctx.strokeStyle = selected ? HOTSPOT_STROKE : MENU_BUTTON_BORDER;
    ctx.lineWidth = 1;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
    ctx.fillStyle = MENU_BUTTON_TEXT;
    ctx.fillText(rect.label, rect.x + rect.width / 2, rect.y + rect.height / 2 + 0.5);
  }
}

function sameButtonTarget(
  buttonTarget: Exclude<VerbMenuTarget, { readonly kind: "verb" }>,
  activeTarget: VerbMenuTarget | undefined,
): boolean {
  if (activeTarget === undefined) return false;
  if (buttonTarget.kind === "weapon") return activeTarget.kind === "weapon" && buttonTarget.slot === activeTarget.slot;
  return activeTarget.kind === "control" && buttonTarget.control === activeTarget.control;
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
  const fontSize = hotspotLabelFontSize(rect);
  ctx.font = monoFont(700, fontSize);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const labelRect = hotspotLabelRect(canvasSize, rect, hotspot, ctx.measureText(hotspot.label).width);
  ctx.fillStyle = LABEL_BACKGROUND;
  ctx.fillRect(labelRect.x, labelRect.y, labelRect.width, labelRect.height);
  ctx.strokeStyle = selected ? HOTSPOT_STROKE : PANEL_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(labelRect.x + 0.5, labelRect.y + 0.5, labelRect.width - 1, labelRect.height - 1);
  ctx.fillStyle = selected ? TEXT_COLOR : MUTED_TEXT_COLOR;
  ctx.fillText(hotspot.label, labelRect.x + 4 + fontSize * 0.2, labelRect.y + labelRect.height / 2 + 0.5);
}

function hotspotLabelRect(
  canvasSize: GameCanvasSize,
  spriteRect: VerbMenuSpriteRect,
  hotspot: VerbHotspot,
  measuredTextWidth = estimatedHotspotLabelTextWidth(hotspot, spriteRect),
): VerbMenuRect {
  const fontSize = hotspotLabelFontSize(spriteRect);
  const width = measuredTextWidth + fontSize;
  const height = fontSize + 8;
  const labelX = clamp(
    spriteRect.x + hotspot.labelX * spriteRect.size,
    LABEL_MARGIN,
    canvasSize.width - width - LABEL_MARGIN,
  );
  const labelY = clamp(
    spriteRect.y + hotspot.labelY * spriteRect.size,
    LABEL_MARGIN + height / 2,
    canvasSize.height - LABEL_MARGIN - height / 2,
  );
  return {
    x: labelX - 4,
    y: labelY - height / 2,
    width,
    height,
  };
}

function hotspotLabelFontSize(rect: VerbMenuSpriteRect): number {
  return Math.min(18, Math.max(12, Math.round(rect.size * 0.036)));
}

function estimatedHotspotLabelTextWidth(hotspot: VerbHotspot, rect: VerbMenuSpriteRect): number {
  return hotspot.label.length * hotspotLabelFontSize(rect) * LABEL_HIT_TEXT_WIDTH_RATIO;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function pointInRect(point: VerbMenuPoint, rect: VerbMenuRect): boolean {
  return point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height;
}
