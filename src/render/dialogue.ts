import type { DialogueState } from "@/src/game/state.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { fitText, monoFont } from "@/src/render/text.ts";

type DialogueRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type DialoguePoint = {
  readonly x: number;
  readonly y: number;
};

export type DialogueOptionSlot = 1 | 2 | 3;

export type DialogueChoiceLabel = {
  readonly label: string;
};

export type DialogueChoiceLayout = {
  readonly slot: DialogueOptionSlot;
  readonly label: string;
  readonly rect: DialogueRect;
};

export type DialogueLayout = {
  readonly panel: DialogueRect;
  readonly header: DialogueRect;
  readonly message: DialogueRect;
  readonly portrait: DialogueRect;
  readonly choices: readonly DialogueChoiceLayout[];
};

const PANEL_WIDTH_MAX = 620;
const PANEL_HEIGHT_RATIO = 0.92;
const PANEL_MARGIN_RATIO = 0.06;
const PANEL_Y_RATIO = 0.22;
const PANEL_BACKGROUND = "rgba(6, 8, 13, 0.88)";
const PANEL_SHADOW = "rgba(0, 0, 0, 0.72)";
const PANEL_BORDER_DARK = "rgba(28, 38, 47, 0.95)";
const PANEL_BORDER_LIGHT = "rgba(232, 214, 151, 0.88)";
const SCRIM = "rgba(0, 0, 0, 0.38)";
const TITLE_TEXT = "#e8d697";
const MESSAGE_TEXT = "#f6a24f";
const MESSAGE_SHADOW = "rgba(0, 0, 0, 0.86)";
const PORTRAIT_BACKGROUND_TOP = "#40435d";
const PORTRAIT_BACKGROUND_BOTTOM = "#1b2438";
const PORTRAIT_FACE = "#d5b19b";
const PORTRAIT_FACE_SHADOW = "#8f5f57";
const PORTRAIT_UNIFORM = "#4d251f";
const PORTRAIT_DETAIL = "#151820";
const CHOICE_BACKGROUND = "rgba(9, 12, 21, 0.84)";
const CHOICE_BORDER = "rgba(75, 85, 99, 0.56)";
const CHOICE_INDEX = "#f3f4f6";
const CHOICE_TEXT = "#8ef7a6";
const CHOICE_MUTED_TEXT = "#d8d4c4";
const CHOICE_HELP = "SPACE OR 1-3";
const CHOICE_HEIGHT = 44;
const CHOICE_GAP = 6;
const DIALOGUE_OPTION_SLOTS = [1, 2, 3] as const satisfies readonly DialogueOptionSlot[];

export function renderDialogue(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  dialogue: DialogueState,
): void {
  const layout = dialogueLayout(canvasSize, dialogue.choices);

  ctx.save();
  ctx.fillStyle = SCRIM;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

  drawPanel(ctx, layout.panel);
  drawHeader(ctx, layout.header, dialogue.title);
  drawMessage(ctx, layout.message, dialogue.message);
  drawPortrait(ctx, layout.portrait, dialogue.title);
  drawChoices(ctx, layout.choices);

  ctx.restore();
}

export function dialogueLayout(
  canvasSize: GameCanvasSize,
  dialogueChoices: readonly DialogueChoiceLabel[],
): DialogueLayout {
  const slottedChoices = dialogueChoices.slice(0, DIALOGUE_OPTION_SLOTS.length);
  const panel = dialoguePanelRect(canvasSize);
  const inset = Math.max(14, Math.round(panel.width * 0.035));
  const headerHeight = Math.max(24, Math.round(panel.height * 0.05));
  const messageHeight = Math.max(78, Math.round(panel.height * 0.17));
  const choiceStackHeight = slottedChoices.length * CHOICE_HEIGHT + (slottedChoices.length - 1) * CHOICE_GAP;

  const header = {
    x: panel.x + inset,
    y: panel.y + 8,
    width: panel.width - inset * 2,
    height: headerHeight,
  };
  const message = {
    x: panel.x + inset,
    y: header.y + header.height + 8,
    width: panel.width - inset * 2,
    height: messageHeight,
  };
  const choicesY = panel.y + panel.height - inset - choiceStackHeight;
  const portraitY = message.y + message.height + 10;
  const portrait = {
    x: panel.x + inset,
    y: portraitY,
    width: panel.width - inset * 2,
    height: Math.max(1, choicesY - portraitY - 12),
  };
  const choices = slottedChoices.map(({ label }, index) => ({
    slot: DIALOGUE_OPTION_SLOTS[index]!,
    label,
    rect: {
      x: panel.x + inset,
      y: choicesY + index * (CHOICE_HEIGHT + CHOICE_GAP),
      width: panel.width - inset * 2,
      height: CHOICE_HEIGHT,
    },
  }));

  return { panel, header, message, portrait, choices };
}

export function dialogueOptionSlotAt(
  canvasSize: GameCanvasSize,
  dialogueChoices: readonly DialogueChoiceLabel[],
  point: DialoguePoint,
): DialogueOptionSlot | undefined {
  for (const choice of dialogueLayout(canvasSize, dialogueChoices).choices) {
    if (point.x < choice.rect.x || point.x > choice.rect.x + choice.rect.width) continue;
    if (point.y < choice.rect.y || point.y > choice.rect.y + choice.rect.height) continue;
    return choice.slot;
  }

  return undefined;
}

export function dialoguePanelRect(canvasSize: GameCanvasSize): DialogueRect {
  const margin = Math.max(16, Math.round(Math.min(canvasSize.width, canvasSize.height) * PANEL_MARGIN_RATIO));
  const maxWidth = Math.max(1, canvasSize.width - margin * 2);
  const maxHeight = Math.max(1, canvasSize.height - margin * 2);
  const width = Math.max(1, Math.min(maxWidth, PANEL_WIDTH_MAX));
  const height = Math.max(1, Math.min(maxHeight, Math.round(width * PANEL_HEIGHT_RATIO)));
  const x = Math.round((canvasSize.width - width) / 2);
  const y = clamp(Math.round(canvasSize.height * PANEL_Y_RATIO), margin, canvasSize.height - margin - height);
  return { x, y, width, height };
}

export function wrapDialogueText(
  ctx: Pick<CanvasRenderingContext2D, "measureText">,
  text: string,
  maxWidth: number,
  maxLines: number,
): readonly string[] {
  if (maxLines <= 0 || maxWidth <= 0) return [];

  const words = text.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = words[0]!;

  for (let i = 1; i < words.length; i++) {
    const word = words[i]!;
    const candidate = `${line} ${word}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }

    lines.push(line);
    line = word;
    if (lines.length === maxLines) return fitFinalLine(ctx, lines, maxWidth);
  }

  lines.push(line);
  if (lines.length <= maxLines) return lines;
  return fitFinalLine(ctx, lines.slice(0, maxLines), maxWidth);
}

function fitFinalLine(
  ctx: Pick<CanvasRenderingContext2D, "measureText">,
  lines: readonly string[],
  maxWidth: number,
): readonly string[] {
  const fitted = [...lines];
  const finalIndex = fitted.length - 1;
  if (finalIndex < 0) return fitted;
  fitted[finalIndex] = fitText(ctx, fitted[finalIndex]!, maxWidth);
  return fitted;
}

function drawPanel(ctx: CanvasRenderingContext2D, rect: DialogueRect): void {
  ctx.fillStyle = PANEL_SHADOW;
  ctx.fillRect(rect.x + 8, rect.y + 8, rect.width, rect.height);
  ctx.fillStyle = PANEL_BACKGROUND;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.strokeStyle = PANEL_BORDER_DARK;
  ctx.lineWidth = 4;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
  ctx.strokeStyle = PANEL_BORDER_LIGHT;
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 5.5, rect.y + 5.5, rect.width - 11, rect.height - 11);
}

function drawHeader(ctx: CanvasRenderingContext2D, rect: DialogueRect, title: string): void {
  const label = title.toUpperCase();
  ctx.font = monoFont(800, Math.max(13, Math.floor(rect.height * 0.58)));
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = MESSAGE_SHADOW;
  ctx.fillText(label, rect.x + 2, rect.y + rect.height / 2 + 2);
  ctx.fillStyle = TITLE_TEXT;
  ctx.fillText(label, rect.x, rect.y + rect.height / 2);

  ctx.strokeStyle = "rgba(232, 214, 151, 0.46)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(rect.x, rect.y + rect.height - 2);
  ctx.lineTo(rect.x + rect.width, rect.y + rect.height - 2);
  ctx.stroke();
}

function drawMessage(ctx: CanvasRenderingContext2D, rect: DialogueRect, message: string): void {
  const fontSize = Math.max(13, Math.min(17, Math.round(rect.width * 0.028)));
  const lineHeight = Math.round(fontSize * 1.26);
  ctx.font = monoFont(800, fontSize);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const lines = wrapDialogueText(
    ctx,
    message.toUpperCase(),
    rect.width,
    Math.max(1, Math.floor(rect.height / lineHeight)),
  );
  for (let i = 0; i < lines.length; i++) {
    const y = rect.y + i * lineHeight;
    ctx.fillStyle = MESSAGE_SHADOW;
    ctx.fillText(lines[i]!, rect.x + 2, y + 2);
    ctx.fillStyle = MESSAGE_TEXT;
    ctx.fillText(lines[i]!, rect.x, y);
  }
}

function drawPortrait(ctx: CanvasRenderingContext2D, rect: DialogueRect, title: string): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();

  const background = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.height);
  background.addColorStop(0, PORTRAIT_BACKGROUND_TOP);
  background.addColorStop(1, PORTRAIT_BACKGROUND_BOTTOM);
  ctx.fillStyle = background;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  drawPortraitBust(ctx, rect, title);

  ctx.restore();
  ctx.strokeStyle = "rgba(232, 214, 151, 0.58)";
  ctx.lineWidth = 2;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
}

function drawPortraitBust(ctx: CanvasRenderingContext2D, rect: DialogueRect, title: string): void {
  const centerX = rect.x + rect.width / 2;
  const shoulderY = rect.y + rect.height * 0.78;
  const shoulderWidth = rect.width * 0.58;
  const headRadiusX = rect.width * 0.09;
  const headRadiusY = rect.height * 0.29;
  const headY = rect.y + rect.height * 0.42;

  ctx.fillStyle = PORTRAIT_UNIFORM;
  ctx.beginPath();
  ctx.moveTo(centerX - shoulderWidth / 2, rect.y + rect.height);
  ctx.lineTo(centerX - shoulderWidth * 0.34, shoulderY);
  ctx.lineTo(centerX + shoulderWidth * 0.34, shoulderY);
  ctx.lineTo(centerX + shoulderWidth / 2, rect.y + rect.height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = PORTRAIT_FACE_SHADOW;
  ctx.fillRect(centerX - headRadiusX * 0.32, shoulderY - headRadiusY * 0.6, headRadiusX * 0.64, headRadiusY * 0.7);
  ctx.fillStyle = PORTRAIT_FACE;
  ctx.beginPath();
  ctx.ellipse(centerX, headY, headRadiusX, headRadiusY, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PORTRAIT_DETAIL;
  ctx.beginPath();
  ctx.moveTo(centerX - headRadiusX * 0.9, headY - headRadiusY * 0.8);
  ctx.lineTo(centerX + headRadiusX * 0.82, headY - headRadiusY * 0.86);
  ctx.lineTo(centerX + headRadiusX * 0.74, headY - headRadiusY * 0.54);
  ctx.lineTo(centerX - headRadiusX * 0.74, headY - headRadiusY * 0.5);
  ctx.closePath();
  ctx.fill();
  drawPortraitFace(ctx, centerX, headY, headRadiusX, headRadiusY);
  drawPortraitMonogram(ctx, rect, title);
}

function drawPortraitFace(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
): void {
  ctx.strokeStyle = PORTRAIT_DETAIL;
  ctx.lineWidth = Math.max(2, Math.round(radiusX * 0.08));

  ctx.beginPath();
  ctx.moveTo(centerX - radiusX * 0.58, centerY - radiusY * 0.22);
  ctx.lineTo(centerX - radiusX * 0.18, centerY - radiusY * 0.16);
  ctx.moveTo(centerX + radiusX * 0.18, centerY - radiusY * 0.16);
  ctx.lineTo(centerX + radiusX * 0.58, centerY - radiusY * 0.22);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX, centerY - radiusY * 0.05);
  ctx.lineTo(centerX - radiusX * 0.08, centerY + radiusY * 0.22);
  ctx.lineTo(centerX + radiusX * 0.1, centerY + radiusY * 0.22);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX - radiusX * 0.36, centerY + radiusY * 0.48);
  ctx.lineTo(centerX + radiusX * 0.36, centerY + radiusY * 0.48);
  ctx.stroke();
}

function drawPortraitMonogram(ctx: CanvasRenderingContext2D, rect: DialogueRect, title: string): void {
  const initials = initialsForTitle(title);
  const x = rect.x + rect.width * 0.08;
  const y = rect.y + rect.height * 0.86;
  ctx.font = monoFont(800, Math.max(12, Math.round(rect.width * 0.035)));
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(142, 247, 166, 0.52)";
  ctx.fillText(`ID:${initials}`, x, y);
}

function initialsForTitle(title: string): string {
  const words = title.trim().split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return "--";
  return words.slice(0, 2).map((word) => word[0]!.toUpperCase()).join("");
}

function drawChoices(ctx: CanvasRenderingContext2D, choices: readonly DialogueChoiceLayout[]): void {
  for (const choice of choices) {
    drawChoice(ctx, choice);
  }
}

function drawChoice(ctx: CanvasRenderingContext2D, choice: DialogueChoiceLayout): void {
  const rect = choice.rect;
  const fontSize = Math.max(12, Math.min(17, Math.round(rect.width * 0.026)));
  const textY = rect.y + rect.height / 2;

  ctx.fillStyle = CHOICE_BACKGROUND;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.strokeStyle = CHOICE_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);

  ctx.font = monoFont(800, fontSize);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = CHOICE_INDEX;
  ctx.fillText(`${choice.slot}.`, rect.x + 12, textY);
  ctx.fillStyle = choice.slot === 1 ? CHOICE_TEXT : CHOICE_MUTED_TEXT;
  ctx.fillText(fitText(ctx, choice.label, rect.width - 106), rect.x + 44, textY);

  if (choice.slot !== 1) return;
  ctx.font = monoFont(700, Math.max(9, Math.round(fontSize * 0.68)));
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(232, 214, 151, 0.64)";
  ctx.fillText(CHOICE_HELP, rect.x + rect.width - 12, textY);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
