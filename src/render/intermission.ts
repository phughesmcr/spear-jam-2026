import {
  currentIntermissionPage,
  type IntermissionMode,
  isMessageRevealed,
  visibleCharacterCount,
} from "@/src/game/intermission.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { fitText, monoFont } from "@/src/render/text.ts";

type TextRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

const BACKGROUND_TOP = "#020406";
const BACKGROUND_BOTTOM = "#070a0d";
const SCANLINE_COLOR = "rgba(142, 247, 166, 0.035)";
const TITLE_TEXT = "#f5f7f8";
const TITLE_SHADOW = "rgba(0, 0, 0, 0.86)";
const TITLE_GLOW = "rgba(105, 246, 196, 0.20)";
const BODY_TEXT = "#cfd7df";
const BODY_SHADOW = "rgba(0, 0, 0, 0.88)";
const ACCENT = "rgba(142, 247, 166, 0.72)";
const PROMPT_TEXT = "#8ef7a6";
const PROMPT_SHADOW = "rgba(0, 0, 0, 0.92)";
const PROMPT_BLINK_MS = 760;

export function renderIntermission(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  intermission: IntermissionMode,
  nowMs: number,
): void {
  const layout = intermissionLayout(canvasSize);
  const revealed = isMessageRevealed(intermission, nowMs);
  const page = currentIntermissionPage(intermission);
  const visibleMessage = intermission.revealed ? page : page.slice(0, visibleCharacterCount(intermission, nowMs));
  const message = revealed ? visibleMessage : `${visibleMessage}_`;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  drawBackground(ctx, canvasSize);
  drawTitle(ctx, layout.title, intermission.title ?? "INTERMISSION");
  drawMessage(ctx, layout.message, message);
  drawPrompt(ctx, layout.prompt, intermission.prompt, nowMs);
  ctx.restore();
}

export function wrapIntermissionText(
  ctx: Pick<CanvasRenderingContext2D, "measureText">,
  text: string,
  maxWidth: number,
  maxLines: number,
  maxCharacters: number = Number.POSITIVE_INFINITY,
): readonly string[] {
  if (maxLines <= 0 || maxWidth <= 0) return [];

  const lines: string[] = [];
  const paragraphs = text.split("\n");

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    const paragraph = paragraphs[paragraphIndex]!;
    const words = paragraph.trim().split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push("");
      if (lines.length === maxLines) return lines;
      continue;
    }

    let line = words[0]!;

    for (let i = 1; i < words.length; i++) {
      const word = words[i]!;
      const candidate = `${line} ${word}`;
      if (candidate.length <= maxCharacters && ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }

      lines.push(line);
      line = word;
      if (lines.length === maxLines) return fitIntermissionFinalLine(ctx, lines, maxWidth);
    }

    lines.push(line);
    if (lines.length === maxLines && paragraphIndex < paragraphs.length - 1) {
      return fitIntermissionFinalLine(ctx, lines, maxWidth);
    }
  }

  if (lines.length <= maxLines) return lines;
  return fitIntermissionFinalLine(ctx, lines.slice(0, maxLines), maxWidth);
}

export function promptAlpha(nowMs: number): number {
  const phase = ((nowMs % PROMPT_BLINK_MS) + PROMPT_BLINK_MS) % PROMPT_BLINK_MS;
  return phase < PROMPT_BLINK_MS * 0.55 ? 1 : 0.24;
}

function intermissionLayout(canvasSize: GameCanvasSize): {
  readonly title: TextRect;
  readonly message: TextRect;
  readonly prompt: TextRect;
} {
  const margin = Math.max(48, Math.round(canvasSize.width * 0.08));
  const width = Math.max(1, canvasSize.width - margin * 2);
  const promptHeight = Math.max(28, Math.round(canvasSize.height * 0.032));
  const promptY = canvasSize.height - Math.max(86, Math.round(canvasSize.height * 0.085));
  const titleHeight = Math.max(74, Math.round(canvasSize.height * 0.072));
  const titleY = Math.max(146, Math.round(canvasSize.height * 0.19));
  const messageY = titleY + titleHeight + Math.max(46, Math.round(canvasSize.height * 0.04));
  const messageHeight = Math.max(1, promptY - messageY - Math.max(42, Math.round(canvasSize.height * 0.04)));

  return {
    title: {
      x: margin,
      y: titleY,
      width,
      height: titleHeight,
    },
    message: {
      x: margin,
      y: messageY,
      width,
      height: messageHeight,
    },
    prompt: {
      x: margin,
      y: promptY,
      width,
      height: promptHeight,
    },
  };
}

function fitIntermissionFinalLine(
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

function drawBackground(ctx: CanvasRenderingContext2D, canvasSize: GameCanvasSize): void {
  const background = ctx.createLinearGradient(0, 0, 0, canvasSize.height);
  background.addColorStop(0, BACKGROUND_TOP);
  background.addColorStop(1, BACKGROUND_BOTTOM);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

  ctx.fillStyle = SCANLINE_COLOR;
  for (let y = 0; y < canvasSize.height; y += 4) {
    ctx.fillRect(0, y, canvasSize.width, 1);
  }

  const lowerGlow = ctx.createLinearGradient(0, canvasSize.height * 0.48, 0, canvasSize.height);
  lowerGlow.addColorStop(0, "rgba(142, 247, 166, 0)");
  lowerGlow.addColorStop(0.74, "rgba(142, 247, 166, 0.045)");
  lowerGlow.addColorStop(1, "rgba(142, 247, 166, 0)");
  ctx.fillStyle = lowerGlow;
  ctx.fillRect(0, canvasSize.height * 0.48, canvasSize.width, canvasSize.height * 0.52);
}

function drawTitle(ctx: CanvasRenderingContext2D, rect: TextRect, title: string): void {
  const fontSize = titleFontSize(title, rect.width);
  const x = rect.x;
  const y = rect.y + rect.height / 2;

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = monoFont(900, fontSize);
  ctx.fillStyle = TITLE_SHADOW;
  ctx.fillText(title, x + 3, y + 3);
  ctx.fillStyle = TITLE_GLOW;
  ctx.fillText(title, x - 3, y);
  ctx.fillText(title, x + 3, y);
  ctx.fillStyle = TITLE_TEXT;
  ctx.fillText(title, x, y);

  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1;
  const lineY = rect.y + rect.height + 8;
  ctx.beginPath();
  ctx.moveTo(rect.x, lineY);
  ctx.lineTo(rect.x + rect.width, lineY);
  ctx.stroke();
}

function titleFontSize(title: string, maxWidth: number): number {
  const characterFit = Math.floor(maxWidth / Math.max(1, title.length));
  return Math.max(34, Math.min(44, characterFit));
}

function drawMessage(ctx: CanvasRenderingContext2D, rect: TextRect, message: string): void {
  const fontSize = Math.max(24, Math.min(30, Math.round(rect.width * 0.04)));
  const lineHeight = Math.round(fontSize * 1.42);
  const maxLines = Math.max(1, Math.floor(rect.height / lineHeight));

  ctx.font = monoFont(700, fontSize);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  const lines = wrapIntermissionText(ctx, message, rect.width, maxLines, 34);
  for (let i = 0; i < lines.length; i++) {
    const y = rect.y + i * lineHeight;
    ctx.fillStyle = BODY_SHADOW;
    ctx.fillText(lines[i]!, rect.x + 2, y + 2);
    ctx.fillStyle = BODY_TEXT;
    ctx.fillText(lines[i]!, rect.x, y);
  }
}

function drawPrompt(ctx: CanvasRenderingContext2D, rect: TextRect, prompt: string, nowMs: number): void {
  const fontSize = Math.max(20, Math.min(24, Math.round(rect.width * 0.034)));
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = monoFont(800, fontSize);
  const text = fitText(ctx, prompt, rect.width);
  ctx.fillStyle = PROMPT_SHADOW;
  ctx.fillText(text, x + 2, y + 2);
  ctx.globalAlpha = promptAlpha(nowMs);
  ctx.fillStyle = PROMPT_TEXT;
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}
