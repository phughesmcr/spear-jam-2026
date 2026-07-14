import type { CombatFeedback, CombatFeedbackSide, CombatFeedbackTone } from "@/src/game/model/combat_feedback.ts";
import { createImageAsset, loadedImage, preloadImageAssets } from "@/src/platform/web/assets.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import type { MapRenderMetrics } from "@/src/game/presentation/top_down/map.ts";
import { fitText, monoFont } from "@/src/game/presentation/ui/text.ts";

const MAX_FEEDBACK = 4;
const FEEDBACK_FONT_SIZE = 13;
const FEEDBACK_PADDING_X = 8;
const FEEDBACK_HEIGHT = 20;
const FEEDBACK_GAP = 6;
const FEEDBACK_BACKGROUND = "rgba(0, 0, 0, 0.55)";
const FEEDBACK_TEXT: Record<CombatFeedbackTone, string> = {
  hit: "#fde68a",
  crit: "#f97316",
  miss: "#cbd5e1",
  hurt: "#fca5a5",
  defeat: "#a7f3d0",
};
const FIRST_PERSON_COMBAT_MARGIN = 12;
const FIRST_PERSON_COMBAT_TOP = 64;
const FIRST_PERSON_COMBAT_PANEL_WIDTH = 132;
const FIRST_PERSON_COMBAT_PANEL_MIN_WIDTH = 96;
const FIRST_PERSON_COMBAT_LABEL_FONT_SIZE = 12;
const FIRST_PERSON_COMBAT_RESULT_FONT_SIZE = 13;
const FIRST_PERSON_COMBAT_SHADOW = "rgba(0, 0, 0, 0.86)";
const FIRST_PERSON_SIDE_LABEL: Record<CombatFeedbackSide, string> = {
  player: "YOU",
  enemy: "ENEMY",
};
const FIRST_PERSON_SIDE_ACCENT: Record<CombatFeedbackSide, string> = {
  player: "#22d3ee",
  enemy: "#fb7185",
};
const FIRST_PERSON_SIDE_WASH: Record<CombatFeedbackSide, string> = {
  player: "rgba(34, 211, 238, 0.14)",
  enemy: "rgba(251, 113, 133, 0.14)",
};
const COMBAT_PANEL_IMAGE_SIZE = { width: 1076, height: 1056 };
const D20_ATLAS_SIZE = { width: 2048, height: 2048 };
const D20_ATLAS_COLUMNS = 5;
const D20_ATLAS_ROWS = 4;
const D20_MIN_ROLL = 1;
const D20_MAX_ROLL = 20;
const combatPanelAsset = createImageAsset(
  new URL("../../../../assets/game/ui/combat_stats_box.png", import.meta.url).href,
);
const d20FacesAsset = createImageAsset(new URL("../../../../assets/game/ui/d20_faces.png", import.meta.url).href);
const COMBAT_FEEDBACK_IMAGE_ASSETS = Object.freeze([combatPanelAsset, d20FacesAsset]);

type FeedbackRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type FirstPersonCombatFeedbackPanel = {
  readonly side: CombatFeedbackSide;
  readonly rect: FeedbackRect;
  readonly feedback: CombatFeedback;
};

export async function preloadCombatFeedbackAssets(document: Document, onAssetLoad?: () => void): Promise<void> {
  await preloadImageAssets(document, COMBAT_FEEDBACK_IMAGE_ASSETS, onAssetLoad);
}

export function renderCombatFeedback(
  ctx: CanvasRenderingContext2D,
  metrics: MapRenderMetrics,
  feedback: readonly CombatFeedback[],
): void {
  if (feedback.length === 0) return;

  const startIndex = Math.max(0, feedback.length - MAX_FEEDBACK);
  const mapLeft = metrics.offsetX;
  const mapRight = metrics.offsetX + metrics.mapWidth * metrics.tileSize;
  const y = metrics.offsetY + metrics.mapHeight * metrics.tileSize + FEEDBACK_GAP;

  ctx.save();
  ctx.font = monoFont(700, FEEDBACK_FONT_SIZE);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let x = mapLeft;
  for (let i = startIndex; i < feedback.length; i++) {
    const entry = feedback[i]!;
    const width = Math.ceil(ctx.measureText(entry.text).width + FEEDBACK_PADDING_X * 2);
    if (x + width > mapRight) break;

    ctx.fillStyle = FEEDBACK_BACKGROUND;
    ctx.fillRect(x, y, width, FEEDBACK_HEIGHT);
    ctx.fillStyle = FEEDBACK_TEXT[entry.tone];
    ctx.fillText(entry.text, x + width / 2, y + FEEDBACK_HEIGHT / 2 + 0.5);
    x += width + FEEDBACK_GAP;
  }

  ctx.restore();
}

export function renderFirstPersonCombatFeedback(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  feedback: readonly CombatFeedback[],
  onAssetLoad?: () => void,
): void {
  const panels = firstPersonCombatFeedbackPanels(canvasSize, feedback);
  if (panels.length === 0) return;

  ctx.save();
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  for (const panel of panels) {
    renderFirstPersonCombatPanel(ctx, panel, onAssetLoad);
  }

  ctx.imageSmoothingEnabled = smoothing;
  ctx.restore();
}

export function firstPersonCombatFeedbackPanels(
  canvasSize: GameCanvasSize,
  feedback: readonly CombatFeedback[],
): readonly FirstPersonCombatFeedbackPanel[] {
  const panels: FirstPersonCombatFeedbackPanel[] = [];
  const player = latestCombatFeedbackForSide(feedback, "player");
  const enemy = latestCombatFeedbackForSide(feedback, "enemy");

  if (player !== undefined) {
    panels.push({ side: "player", rect: firstPersonCombatPanelRect(canvasSize, "player"), feedback: player });
  }
  if (enemy !== undefined) {
    panels.push({ side: "enemy", rect: firstPersonCombatPanelRect(canvasSize, "enemy"), feedback: enemy });
  }

  return panels;
}

export function d20FaceSpriteRect(roll: number): FeedbackRect | undefined {
  if (!Number.isInteger(roll) || roll < D20_MIN_ROLL || roll > D20_MAX_ROLL) return undefined;

  const index = roll - 1;
  const cellWidth = D20_ATLAS_SIZE.width / D20_ATLAS_COLUMNS;
  const cellHeight = D20_ATLAS_SIZE.height / D20_ATLAS_ROWS;
  return {
    x: (index % D20_ATLAS_COLUMNS) * cellWidth,
    y: Math.floor(index / D20_ATLAS_COLUMNS) * cellHeight,
    width: cellWidth,
    height: cellHeight,
  };
}

function latestCombatFeedbackForSide(
  feedback: readonly CombatFeedback[],
  side: CombatFeedbackSide,
): CombatFeedback | undefined {
  let latest: CombatFeedback | undefined;

  for (let i = feedback.length - 1; i >= 0; i--) {
    const entry = feedback[i]!;
    if (entry.side !== side) continue;
    latest ??= entry;
    if (latest.roll !== undefined) return latest;
    if (entry.roll !== undefined) return { ...latest, roll: entry.roll, total: entry.total };
  }

  return latest;
}

function firstPersonCombatPanelRect(canvasSize: GameCanvasSize, side: CombatFeedbackSide): FeedbackRect {
  const availableSideWidth = Math.max(1, Math.floor((canvasSize.width - FIRST_PERSON_COMBAT_MARGIN * 3) / 2));
  const width = Math.max(
    Math.min(FIRST_PERSON_COMBAT_PANEL_MIN_WIDTH, availableSideWidth),
    Math.min(FIRST_PERSON_COMBAT_PANEL_WIDTH, availableSideWidth),
  );
  const height = Math.round(width * COMBAT_PANEL_IMAGE_SIZE.height / COMBAT_PANEL_IMAGE_SIZE.width);
  const y = Math.max(
    FIRST_PERSON_COMBAT_MARGIN,
    Math.min(FIRST_PERSON_COMBAT_TOP, canvasSize.height - height - FIRST_PERSON_COMBAT_MARGIN),
  );
  const x = side === "player" ? FIRST_PERSON_COMBAT_MARGIN : canvasSize.width - width - FIRST_PERSON_COMBAT_MARGIN;

  return { x, y, width, height };
}

function renderFirstPersonCombatPanel(
  ctx: CanvasRenderingContext2D,
  panel: FirstPersonCombatFeedbackPanel,
  onAssetLoad?: () => void,
): void {
  const frame = loadedImage(ctx, combatPanelAsset, onAssetLoad);
  const d20Faces = loadedImage(ctx, d20FacesAsset, onAssetLoad);

  ctx.save();
  renderFirstPersonCombatBackdrop(ctx, panel, frame);
  renderFirstPersonCombatLabel(ctx, panel);
  renderFirstPersonCombatRoll(ctx, panel, d20Faces);
  renderFirstPersonCombatResult(ctx, panel);
  ctx.restore();
}

function renderFirstPersonCombatBackdrop(
  ctx: CanvasRenderingContext2D,
  panel: FirstPersonCombatFeedbackPanel,
  frame: HTMLImageElement | undefined,
): void {
  const rect = panel.rect;
  const inner = firstPersonCombatInnerRect(rect);

  ctx.fillStyle = FIRST_PERSON_SIDE_WASH[panel.side];
  ctx.fillRect(inner.x, inner.y, inner.width, inner.height);

  if (frame !== undefined) {
    ctx.globalAlpha = 0.9;
    ctx.drawImage(frame, rect.x, rect.y, rect.width, rect.height);
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = FEEDBACK_BACKGROUND;
    ctx.fillRect(rect.x + 8, rect.y + 10, rect.width - 16, rect.height - 18);
    ctx.strokeStyle = FIRST_PERSON_SIDE_ACCENT[panel.side];
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  }

  ctx.fillStyle = FIRST_PERSON_SIDE_ACCENT[panel.side];
  ctx.fillRect(inner.x, inner.y, inner.width, 2);
}

function renderFirstPersonCombatLabel(ctx: CanvasRenderingContext2D, panel: FirstPersonCombatFeedbackPanel): void {
  const rect = panel.rect;
  const x = rect.x + rect.width / 2;
  const y = rect.y + Math.round(rect.height * 0.18);

  ctx.font = monoFont(900, FIRST_PERSON_COMBAT_LABEL_FONT_SIZE);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawShadowedText(ctx, FIRST_PERSON_SIDE_LABEL[panel.side], x, y, FIRST_PERSON_SIDE_ACCENT[panel.side]);
}

function renderFirstPersonCombatRoll(
  ctx: CanvasRenderingContext2D,
  panel: FirstPersonCombatFeedbackPanel,
  d20Faces: HTMLImageElement | undefined,
): void {
  const roll = panel.feedback.roll;
  const rect = panel.rect;
  const size = Math.round(rect.width * 0.48);
  const dieRect = {
    x: rect.x + Math.round((rect.width - size) / 2),
    y: rect.y + Math.round(rect.height * 0.31),
    width: size,
    height: Math.round(size * D20_ATLAS_COLUMNS / D20_ATLAS_ROWS),
  };

  if (roll !== undefined && d20Faces !== undefined) {
    const source = d20FaceSpriteRect(roll);
    if (source !== undefined) {
      ctx.drawImage(
        d20Faces,
        source.x,
        source.y,
        source.width,
        source.height,
        dieRect.x,
        dieRect.y,
        dieRect.width,
        dieRect.height,
      );
      return;
    }
  }

  renderFirstPersonCombatRollFallback(ctx, panel, dieRect);
}

function renderFirstPersonCombatRollFallback(
  ctx: CanvasRenderingContext2D,
  panel: FirstPersonCombatFeedbackPanel,
  dieRect: FeedbackRect,
): void {
  const roll = panel.feedback.roll;
  const text = roll === undefined ? "!" : String(roll);

  ctx.fillStyle = "rgba(2, 6, 11, 0.72)";
  ctx.fillRect(dieRect.x, dieRect.y, dieRect.width, dieRect.height);
  ctx.strokeStyle = FIRST_PERSON_SIDE_ACCENT[panel.side];
  ctx.lineWidth = 1;
  ctx.strokeRect(dieRect.x + 0.5, dieRect.y + 0.5, dieRect.width - 1, dieRect.height - 1);

  ctx.font = monoFont(900, Math.max(16, Math.round(dieRect.width * 0.36)));
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawShadowedText(
    ctx,
    text,
    dieRect.x + dieRect.width / 2,
    dieRect.y + dieRect.height / 2,
    FIRST_PERSON_SIDE_ACCENT[panel.side],
  );
}

function renderFirstPersonCombatResult(ctx: CanvasRenderingContext2D, panel: FirstPersonCombatFeedbackPanel): void {
  const rect = panel.rect;
  const x = rect.x + rect.width / 2;
  const y = rect.y + Math.round(rect.height * 0.86);
  const maxTextWidth = rect.width * 0.72;

  ctx.font = monoFont(900, FIRST_PERSON_COMBAT_RESULT_FONT_SIZE);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  drawShadowedText(ctx, fitText(ctx, panel.feedback.text, maxTextWidth), x, y, FEEDBACK_TEXT[panel.feedback.tone]);
}

function firstPersonCombatInnerRect(rect: FeedbackRect): FeedbackRect {
  return {
    x: rect.x + Math.round(rect.width * 0.16),
    y: rect.y + Math.round(rect.height * 0.23),
    width: Math.round(rect.width * 0.68),
    height: Math.round(rect.height * 0.62),
  };
}

function drawShadowedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.fillStyle = FIRST_PERSON_COMBAT_SHADOW;
  ctx.fillText(text, x + 1, y + 1);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}
