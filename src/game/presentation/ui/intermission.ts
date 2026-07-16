import {
  currentIntermissionPage,
  type IntermissionMode,
  isMessageRevealed,
  visibleCharacterCount,
} from "@/src/game/model/intermission.ts";
import { imageForAsset } from "@/src/engine/canvas/mod.ts";
import type { PresentationUiAssets } from "@/src/game/presentation/asset_view.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import type { RenderSpy } from "@/src/game/presentation/frame_scratch.ts";
import { fitText, monoFont } from "@/src/game/presentation/ui/text.ts";

type TextRect = {
  x: number;
  y: number;
  width: number;
  height: number;
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
const MAX_WRAP_LINES = 64;
const VICTORY_OVERLAY_COLOR = "rgba(2, 4, 6, 0.64)";

type IntermissionLayoutCache = {
  width: number;
  height: number;
  title: TextRect;
  message: TextRect;
  prompt: TextRect;
  messageFontSize: number;
  promptFontSize: number;
  lineHeight: number;
  maxLines: number;
};

type IntermissionContentCache = {
  page: string;
  title: string;
  prompt: string;
  messageWidth: number;
  messageFontSize: number;
  maxLines: number;
  lines: string[];
  lineCount: number;
  fittedPrompt: string;
};

type IntermissionBackgroundCache = {
  width: number;
  height: number;
  canvas: OffscreenCanvas;
  ctor: typeof OffscreenCanvas;
};

let layoutCache: IntermissionLayoutCache | undefined;
let contentCache: IntermissionContentCache | undefined;
let backgroundCache: IntermissionBackgroundCache | undefined;

export function renderIntermission(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  assets: PresentationUiAssets["intermission"],
  intermission: IntermissionMode,
  nowMs: number,
  _spy?: RenderSpy,
): void {
  const layout = intermissionLayoutFor(canvasSize);
  const page = currentIntermissionPage(intermission);
  const title = intermission.title ?? "INTERMISSION";
  const content = intermissionContentFor(ctx, page, title, intermission.prompt, layout);
  const revealed = isMessageRevealed(intermission, nowMs);
  const visibleChars = revealed ? page.length : visibleCharacterCount(intermission, nowMs);

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  drawBackground(ctx, canvasSize, assets, intermission.background);
  drawTitle(ctx, layout, title);
  drawMessage(ctx, layout, content, visibleChars, revealed);
  drawPrompt(ctx, layout, content.fittedPrompt, nowMs);
  ctx.restore();
}

export function wrapIntermissionText(
  ctx: Pick<CanvasRenderingContext2D, "measureText" | "font">,
  text: string,
  maxWidth: number,
  maxLines: number,
  maxCharacters: number = Number.POSITIVE_INFINITY,
): readonly string[] {
  if (maxLines <= 0 || maxWidth <= 0) return [];

  const messageFontSize = Math.max(24, Math.min(30, Math.round(maxWidth * 0.04)));
  ctx.font = monoFont(700, messageFontSize);
  const scratch = Array.from({ length: MAX_WRAP_LINES }, () => "");
  const lineCount = fillWrappedLines(ctx, text, maxWidth, maxLines, scratch, maxCharacters);
  const lines: string[] = [];
  for (let i = 0; i < lineCount; i++) {
    lines.push(scratch[i]!);
  }
  return lines;
}

export function promptAlpha(nowMs: number): number {
  const phase = ((nowMs % PROMPT_BLINK_MS) + PROMPT_BLINK_MS) % PROMPT_BLINK_MS;
  return phase < PROMPT_BLINK_MS * 0.55 ? 1 : 0.24;
}

function intermissionLayoutFor(canvasSize: GameCanvasSize): IntermissionLayoutCache {
  if (layoutCache !== undefined && layoutCache.width === canvasSize.width && layoutCache.height === canvasSize.height) {
    return layoutCache;
  }

  const margin = Math.max(48, Math.round(canvasSize.width * 0.08));
  const width = Math.max(1, canvasSize.width - margin * 2);
  const promptHeight = Math.max(28, Math.round(canvasSize.height * 0.032));
  const promptY = canvasSize.height - Math.max(86, Math.round(canvasSize.height * 0.085));
  const titleHeight = Math.max(74, Math.round(canvasSize.height * 0.072));
  const titleY = Math.max(146, Math.round(canvasSize.height * 0.19));
  const messageY = titleY + titleHeight + Math.max(46, Math.round(canvasSize.height * 0.04));
  const messageHeight = Math.max(1, promptY - messageY - Math.max(42, Math.round(canvasSize.height * 0.04)));
  const messageFontSize = Math.max(24, Math.min(30, Math.round(width * 0.04)));
  const lineHeight = Math.round(messageFontSize * 1.42);
  const maxLines = Math.max(1, Math.floor(messageHeight / lineHeight));

  layoutCache = {
    width: canvasSize.width,
    height: canvasSize.height,
    title: { x: margin, y: titleY, width, height: titleHeight },
    message: { x: margin, y: messageY, width, height: messageHeight },
    prompt: { x: margin, y: promptY, width, height: promptHeight },
    messageFontSize,
    promptFontSize: Math.max(20, Math.min(24, Math.round(width * 0.034))),
    lineHeight,
    maxLines,
  };
  return layoutCache;
}

function intermissionContentFor(
  ctx: Pick<CanvasRenderingContext2D, "measureText" | "font">,
  page: string,
  title: string,
  prompt: string,
  layout: IntermissionLayoutCache,
): IntermissionContentCache {
  if (
    contentCache !== undefined &&
    contentCache.page === page &&
    contentCache.title === title &&
    contentCache.prompt === prompt &&
    contentCache.messageWidth === layout.message.width &&
    contentCache.messageFontSize === layout.messageFontSize &&
    contentCache.maxLines === layout.maxLines
  ) {
    return contentCache;
  }

  ctx.font = monoFont(700, layout.messageFontSize);
  const lines = contentCache?.lines ?? Array.from({ length: MAX_WRAP_LINES }, () => "");
  const lineCount = fillWrappedLines(ctx, page, layout.message.width, layout.maxLines, lines);
  ctx.font = monoFont(800, layout.promptFontSize);
  const fittedPrompt = fitText(ctx, prompt, layout.prompt.width);

  contentCache = {
    page,
    title,
    prompt,
    messageWidth: layout.message.width,
    messageFontSize: layout.messageFontSize,
    maxLines: layout.maxLines,
    lines,
    lineCount,
    fittedPrompt,
  };
  return contentCache;
}

function fillWrappedLines(
  ctx: Pick<CanvasRenderingContext2D, "measureText">,
  text: string,
  maxWidth: number,
  maxLines: number,
  out: string[],
  maxCharacters: number = Number.POSITIVE_INFINITY,
): number {
  if (maxLines <= 0 || maxWidth <= 0) return 0;

  let lineCount = 0;
  const paragraphs = text.split("\n");

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    const paragraph = paragraphs[paragraphIndex]!;
    const words = paragraph.trim().split(/\s+/).filter((word) => word.length > 0);
    if (words.length === 0) {
      out[lineCount] = "";
      lineCount++;
      if (lineCount === maxLines) return lineCount;
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

      out[lineCount] = line;
      lineCount++;
      line = word;
      if (lineCount === maxLines) {
        out[maxLines - 1] = fitText(ctx, out[maxLines - 1]!, maxWidth);
        return maxLines;
      }
    }

    out[lineCount] = line;
    lineCount++;
    if (lineCount === maxLines && paragraphIndex < paragraphs.length - 1) {
      out[maxLines - 1] = fitText(ctx, out[maxLines - 1]!, maxWidth);
      return maxLines;
    }
  }

  return lineCount;
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  assets: PresentationUiAssets["intermission"],
  background: IntermissionMode["background"],
): void {
  if (background === "victory") {
    drawVictoryBackground(ctx, canvasSize, assets);
    return;
  }

  drawSystemBackground(ctx, canvasSize);
}

function drawSystemBackground(ctx: CanvasRenderingContext2D, canvasSize: GameCanvasSize): void {
  const canvas = intermissionBackgroundFor(canvasSize.width, canvasSize.height);
  if (canvas !== undefined) {
    ctx.drawImage(canvas, 0, 0);
    return;
  }

  paintIntermissionBackground(ctx, canvasSize.width, canvasSize.height);
}

function drawVictoryBackground(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  assets: PresentationUiAssets["intermission"],
): void {
  const image = imageForAsset(assets.victoryBackground);
  if (image === undefined) {
    drawSystemBackground(ctx, canvasSize);
    return;
  }

  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const scale = Math.max(canvasSize.width / imageWidth, canvasSize.height / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  ctx.drawImage(image, (canvasSize.width - width) / 2, (canvasSize.height - height) / 2, width, height);
  ctx.fillStyle = VICTORY_OVERLAY_COLOR;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
}

function intermissionBackgroundFor(width: number, height: number): OffscreenCanvas | undefined {
  const ctor = globalThis.OffscreenCanvas;
  if (
    backgroundCache !== undefined &&
    backgroundCache.width === width &&
    backgroundCache.height === height &&
    backgroundCache.ctor === ctor
  ) {
    return backgroundCache.canvas;
  }
  const canvas = new ctor(width, height);
  const context = canvas.getContext("2d");
  if (context === null) return undefined;
  paintIntermissionBackground(context, width, height);
  backgroundCache = { width, height, canvas, ctor };
  return canvas;
}

function paintIntermissionBackground(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const background = ctx.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, BACKGROUND_TOP);
  background.addColorStop(1, BACKGROUND_BOTTOM);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = SCANLINE_COLOR;
  for (let y = 0; y < height; y += 4) {
    ctx.fillRect(0, y, width, 1);
  }

  const lowerGlow = ctx.createLinearGradient(0, height * 0.48, 0, height);
  lowerGlow.addColorStop(0, "rgba(142, 247, 166, 0)");
  lowerGlow.addColorStop(0.74, "rgba(142, 247, 166, 0.045)");
  lowerGlow.addColorStop(1, "rgba(142, 247, 166, 0)");
  ctx.fillStyle = lowerGlow;
  ctx.fillRect(0, height * 0.48, width, height * 0.52);
}

function drawTitle(ctx: CanvasRenderingContext2D, layout: IntermissionLayoutCache, title: string): void {
  const rect = layout.title;
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

function drawMessage(
  ctx: CanvasRenderingContext2D,
  layout: IntermissionLayoutCache,
  content: IntermissionContentCache,
  visibleChars: number,
  revealed: boolean,
): void {
  const rect = layout.message;
  ctx.font = monoFont(700, layout.messageFontSize);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  let remaining = visibleChars;
  for (let i = 0; i < content.lineCount; i++) {
    const line = content.lines[i]!;
    const y = rect.y + i * layout.lineHeight;
    if (remaining <= 0) break;

    const drawCount = Math.min(remaining, line.length);
    remaining -= drawCount;
    const text = drawCount < line.length ? line.slice(0, drawCount) : line;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, y, rect.width, layout.lineHeight);
    ctx.clip();
    ctx.fillStyle = BODY_SHADOW;
    ctx.fillText(text, rect.x + 2, y + 2);
    ctx.fillStyle = BODY_TEXT;
    ctx.fillText(text, rect.x, y);
    ctx.restore();
  }

  if (!revealed) {
    drawRevealCursor(ctx, layout, content, visibleChars);
  }
}

function drawRevealCursor(
  ctx: CanvasRenderingContext2D,
  layout: IntermissionLayoutCache,
  content: IntermissionContentCache,
  visibleChars: number,
): void {
  let remaining = visibleChars;
  for (let i = 0; i < content.lineCount; i++) {
    const line = content.lines[i]!;
    if (remaining < line.length) {
      const prefix = line.slice(0, remaining);
      const x = rectXForText(ctx, layout.message.x, prefix);
      const y = layout.message.y + i * layout.lineHeight;
      ctx.fillStyle = BODY_TEXT;
      ctx.fillText("_", x, y);
      return;
    }
    remaining -= line.length;
    if (remaining > 0) remaining--;
  }
}

function rectXForText(ctx: CanvasRenderingContext2D, x: number, text: string): number {
  return x + (text.length === 0 ? 0 : ctx.measureText(text).width);
}

function drawPrompt(
  ctx: CanvasRenderingContext2D,
  layout: IntermissionLayoutCache,
  prompt: string,
  nowMs: number,
): void {
  const rect = layout.prompt;
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = monoFont(800, layout.promptFontSize);
  ctx.fillStyle = PROMPT_SHADOW;
  ctx.fillText(prompt, x + 2, y + 2);
  ctx.globalAlpha = promptAlpha(nowMs);
  ctx.fillStyle = PROMPT_TEXT;
  ctx.fillText(prompt, x, y);
  ctx.globalAlpha = 1;
}

export function invalidateIntermissionCaches(): void {
  layoutCache = undefined;
  contentCache = undefined;
  backgroundCache = undefined;
}
