import type { AudioSettings } from "@/src/game/audio_settings.ts";
import { clampInteractiveFps, type SettingsSliderId, unitFromInteractiveFps } from "@/src/game/render_settings.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { monoFont } from "@/src/render/text.ts";
import { drawTitleButton, type TitleButtonRect, type TitlePoint } from "@/src/render/title.ts";

const SETTINGS_BACKGROUND = "rgba(0, 0, 0, 0.92)";
const SETTINGS_TITLE_COLOR = "#eafff4";
const SETTINGS_LABEL_COLOR = "#9fd4b8";
const SETTINGS_VALUE_COLOR = "#eafff4";
const SLIDER_TRACK_COLOR = "rgba(159, 212, 184, 0.28)";
const SLIDER_FILL_COLOR = "#5dffb0";
const SLIDER_THUMB_COLOR = "#eafff4";
const BACK_BUTTON_LABEL = "BACK";
const BACK_BUTTON_WIDTH_RATIO = 0.34;
const BACK_BUTTON_WIDTH_MIN = 140;
const BACK_BUTTON_WIDTH_MAX = 220;
const BACK_BUTTON_HEIGHT_RATIO = 0.075;
const BACK_BUTTON_HEIGHT_MIN = 44;
const BACK_BUTTON_HEIGHT_MAX = 56;
const SLIDER_WIDTH_RATIO = 0.62;
const SLIDER_WIDTH_MIN = 220;
const SLIDER_WIDTH_MAX = 320;
const SLIDER_TRACK_HEIGHT = 8;
const SLIDER_THUMB_RADIUS = 10;
const SLIDER_HIT_HEIGHT = 36;
const SLIDER_GAP_RATIO = 0.075;

type SettingsGeometryCache = {
  width: number;
  height: number;
  backButton: TitleButtonRect;
  sliders: readonly SettingsSliderRect[];
};

let settingsGeometryCache: SettingsGeometryCache | undefined;

export type SettingsSliderRect = {
  readonly id: SettingsSliderId;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type SettingsView = {
  readonly audio: AudioSettings;
  readonly interactiveFps: number;
};

export function settingsBackButtonRect(canvasSize: GameCanvasSize): TitleButtonRect {
  return settingsGeometryFor(canvasSize).backButton;
}

export function settingsBackButtonHit(canvasSize: GameCanvasSize, point: TitlePoint): boolean {
  const rect = settingsBackButtonRect(canvasSize);
  return pointInRect(rect, point);
}

export function settingsSliderRects(canvasSize: GameCanvasSize): readonly SettingsSliderRect[] {
  return settingsGeometryFor(canvasSize).sliders;
}

export function settingsSliderAt(
  canvasSize: GameCanvasSize,
  point: TitlePoint,
): SettingsSliderId | undefined {
  for (const rect of settingsSliderRects(canvasSize)) {
    if (pointInRect(rect, point)) return rect.id;
  }
  return undefined;
}

export function settingsSliderUnit(
  canvasSize: GameCanvasSize,
  sliderId: SettingsSliderId,
  point: TitlePoint,
): number {
  const rect = settingsSliderRects(canvasSize).find((slider) => slider.id === sliderId);
  if (rect === undefined || rect.width <= 0) return 0;
  return Math.min(1, Math.max(0, (point.x - rect.x) / rect.width));
}

export function renderSettings(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  settings: SettingsView,
  nowMs = 0,
): void {
  const backButton = settingsBackButtonRect(canvasSize);
  const sliders = settingsSliderRects(canvasSize);
  const titleSize = Math.min(36, Math.max(22, Math.round(canvasSize.width * 0.07)));
  const bodySize = Math.min(18, Math.max(12, Math.round(canvasSize.width * 0.035)));
  const centerX = canvasSize.width / 2;

  ctx.save();
  ctx.fillStyle = SETTINGS_BACKGROUND;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

  ctx.font = monoFont(700, titleSize);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = SETTINGS_TITLE_COLOR;
  ctx.fillText("SETTINGS", centerX, Math.round(canvasSize.height * 0.18));

  for (const slider of sliders) {
    drawSettingsSlider(ctx, slider, settings, bodySize);
  }

  drawTitleButton(ctx, backButton, BACK_BUTTON_LABEL, nowMs);
  ctx.restore();
}

function settingsGeometryFor(canvasSize: GameCanvasSize): SettingsGeometryCache {
  if (
    settingsGeometryCache !== undefined &&
    settingsGeometryCache.width === canvasSize.width &&
    settingsGeometryCache.height === canvasSize.height
  ) {
    return settingsGeometryCache;
  }

  const backWidth = Math.min(
    BACK_BUTTON_WIDTH_MAX,
    Math.max(BACK_BUTTON_WIDTH_MIN, Math.round(canvasSize.width * BACK_BUTTON_WIDTH_RATIO)),
  );
  const backHeight = Math.min(
    BACK_BUTTON_HEIGHT_MAX,
    Math.max(BACK_BUTTON_HEIGHT_MIN, Math.round(canvasSize.height * BACK_BUTTON_HEIGHT_RATIO)),
  );
  const sliderWidth = Math.min(
    SLIDER_WIDTH_MAX,
    Math.max(SLIDER_WIDTH_MIN, Math.round(canvasSize.width * SLIDER_WIDTH_RATIO)),
  );
  const sliderX = Math.round((canvasSize.width - sliderWidth) / 2);
  const gap = Math.round(canvasSize.height * SLIDER_GAP_RATIO);
  const musicY = Math.round(canvasSize.height * 0.32 - SLIDER_HIT_HEIGHT / 2);

  settingsGeometryCache = {
    width: canvasSize.width,
    height: canvasSize.height,
    backButton: {
      x: Math.round((canvasSize.width - backWidth) / 2),
      y: Math.round(canvasSize.height * 0.84 - backHeight / 2),
      width: backWidth,
      height: backHeight,
    },
    sliders: [
      { id: "music", x: sliderX, y: musicY, width: sliderWidth, height: SLIDER_HIT_HEIGHT },
      { id: "sound", x: sliderX, y: musicY + gap + SLIDER_HIT_HEIGHT, width: sliderWidth, height: SLIDER_HIT_HEIGHT },
      {
        id: "fps",
        x: sliderX,
        y: musicY + 2 * (gap + SLIDER_HIT_HEIGHT),
        width: sliderWidth,
        height: SLIDER_HIT_HEIGHT,
      },
    ],
  };
  return settingsGeometryCache;
}

function drawSettingsSlider(
  ctx: CanvasRenderingContext2D,
  rect: SettingsSliderRect,
  settings: SettingsView,
  bodySize: number,
): void {
  const unit = sliderUnit(rect.id, settings);
  const trackY = rect.y + Math.round(rect.height / 2);
  const fillWidth = Math.round(rect.width * unit);
  const thumbX = rect.x + fillWidth;

  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.font = monoFont(600, bodySize);
  ctx.fillStyle = SETTINGS_LABEL_COLOR;
  ctx.fillText(sliderLabel(rect.id), rect.x, rect.y + 2);

  ctx.textAlign = "right";
  ctx.fillStyle = SETTINGS_VALUE_COLOR;
  ctx.fillText(sliderValueLabel(rect.id, settings), rect.x + rect.width, rect.y + 2);

  ctx.fillStyle = SLIDER_TRACK_COLOR;
  roundRect(ctx, rect.x, trackY - SLIDER_TRACK_HEIGHT / 2, rect.width, SLIDER_TRACK_HEIGHT, 4);
  ctx.fill();

  if (fillWidth > 0) {
    ctx.fillStyle = SLIDER_FILL_COLOR;
    roundRect(ctx, rect.x, trackY - SLIDER_TRACK_HEIGHT / 2, fillWidth, SLIDER_TRACK_HEIGHT, 4);
    ctx.fill();
  }

  ctx.fillStyle = SLIDER_THUMB_COLOR;
  ctx.beginPath();
  ctx.arc(thumbX, trackY, SLIDER_THUMB_RADIUS, 0, Math.PI * 2);
  ctx.fill();
}

function sliderUnit(id: SettingsSliderId, settings: SettingsView): number {
  switch (id) {
    case "music":
      return settings.audio.musicVolume;
    case "sound":
      return settings.audio.soundVolume;
    case "fps":
      return unitFromInteractiveFps(settings.interactiveFps);
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

function sliderValueLabel(id: SettingsSliderId, settings: SettingsView): string {
  switch (id) {
    case "music":
      return `${Math.round(settings.audio.musicVolume * 100)}%`;
    case "sound":
      return `${Math.round(settings.audio.soundVolume * 100)}%`;
    case "fps":
      return `${clampInteractiveFps(settings.interactiveFps)}`;
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

function sliderLabel(id: SettingsSliderId): string {
  switch (id) {
    case "music":
      return "MUSIC";
    case "sound":
      return "SOUND";
    case "fps":
      return "FPS";
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

function pointInRect(
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  point: TitlePoint,
): boolean {
  return point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y &&
    point.y < rect.y + rect.height;
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
