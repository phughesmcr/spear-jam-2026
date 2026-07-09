import { type AudioSettings, DEFAULT_AUDIO_SETTINGS } from "@/src/game/audio_settings.ts";
import type { PresentationView } from "@/src/game/presentation.ts";
import type { FrameRenderSession } from "@/src/game/session_ports.ts";
import type { GameMode, ViewMode } from "@/src/game/state.ts";
import { playerWeaponSpec } from "@/src/game/weapons.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import {
  preloadCombatFeedbackAssets,
  renderCombatFeedback,
  renderFirstPersonCombatFeedback,
} from "@/src/render/combat_feedback.ts";
import { preloadDialogueAssets, renderDialogue } from "@/src/render/dialogue.ts";
import { renderDrawableEntities } from "@/src/render/drawables.ts";
import type { FirstPersonRenderer } from "@/src/render/first_person.ts";
import { preloadHelpAssets, renderHelp } from "@/src/render/help.ts";
import { preloadHudAssets, renderFirstPersonHud, renderHud } from "@/src/render/hud.ts";
import { renderIntermission } from "@/src/render/intermission.ts";
import { renderMap } from "@/src/render/map.ts";
import { renderMessageLog } from "@/src/render/messages.ts";
import { renderSettings } from "@/src/render/settings.ts";
import { monoFont } from "@/src/render/text.ts";
import { preloadTitleAssets, renderTitle } from "@/src/render/title.ts";
import { preloadVerbMenuAssets, renderVerbMenu } from "@/src/render/verb_menu.ts";
import { preloadWeaponHudAssets, renderWeaponHud } from "@/src/render/weapon_hud.ts";

const BACKGROUND_COLOR = "#101217";
const OVERLAY_COLOR = "rgba(0, 0, 0, 0.6)";
const OVERLAY_TITLE_COLOR = "#f3f4f6";
const OVERLAY_SUBTITLE_COLOR = "#c9d1d9";

type GameRenderRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};
export type GameFrameResult = {
  readonly needsFrame: boolean;
  /** True when the only continuous demand is ambient first-person animation. */
  readonly ambientOnly?: boolean;
};

export type FrameProps = {
  readonly ctx: CanvasRenderingContext2D;
  readonly canvasSize: GameCanvasSize;
  readonly session?: FrameRenderSession;
  readonly mode?: GameMode;
  readonly presentation?: PresentationView;
  readonly viewMode?: ViewMode;
  readonly audio?: AudioSettings;
  readonly firstPersonRenderer?: FirstPersonRenderer;
  readonly nowMs?: number;
  readonly onAssetLoad?: () => void;
};

const FIRST_PERSON_PLAY_RECT: GameRenderRect = { x: 0, y: 0, width: 0, height: 0 };
const EMPTY_PRESENTATION: PresentationView = {
  messages: [],
  combatFeedback: [],
  weaponHudPhase: "idle",
  showKeys: false,
  needsFrame: false,
};

type VignetteCache = {
  width: number;
  height: number;
  canvas: OffscreenCanvas;
  ctor: typeof OffscreenCanvas;
};

let vignetteCache: VignetteCache | undefined;

export async function preloadGameAssets(
  document: Document,
  firstPersonRenderer: FirstPersonRenderer,
  onAssetLoad?: () => void,
): Promise<void> {
  await Promise.all([
    preloadTitleAssets(document, onAssetLoad),
    preloadVerbMenuAssets(document, onAssetLoad),
    firstPersonRenderer.preloadAssets(document, onAssetLoad),
    preloadWeaponHudAssets(document, onAssetLoad),
    preloadHudAssets(document, onAssetLoad),
    preloadHelpAssets(document, onAssetLoad),
    preloadCombatFeedbackAssets(document, onAssetLoad),
    preloadDialogueAssets(document, onAssetLoad),
  ]);
}

export function renderGameFrame({
  ctx,
  canvasSize,
  session,
  mode = { type: "loading" },
  presentation = EMPTY_PRESENTATION,
  viewMode = "firstPerson",
  audio = DEFAULT_AUDIO_SETTINGS,
  firstPersonRenderer,
  nowMs = 0,
  onAssetLoad,
}: FrameProps): GameFrameResult {
  let needsFrame = false;
  let ambientOnly = false;
  const opaqueFirstPerson = session !== undefined && viewMode === "firstPerson" &&
    (mode.type === "playing" || mode.type === "verbMenu");
  if (!opaqueFirstPerson) {
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  }
  if (session) {
    const map = session.getMap();
    if (viewMode === "firstPerson") {
      if (firstPersonRenderer === undefined) {
        throw new Error("renderGameFrame requires a first-person renderer for first-person sessions.");
      }
      const playRect = FIRST_PERSON_PLAY_RECT;
      playRect.x = 0;
      playRect.y = 0;
      playRect.width = canvasSize.width;
      playRect.height = canvasSize.height;
      const playerStatus = session.getPlayerStatus();
      const firstPersonResult = firstPersonRenderer.render(
        ctx,
        playRect,
        session,
        nowMs,
        session.targetMarkerTone(),
        onAssetLoad,
        playerWeaponSpec(playerStatus.selectedWeapon).range,
      );
      needsFrame ||= firstPersonResult.needsFrame;
      ambientOnly = firstPersonResult.ambientOnly === true;
      renderFirstPersonVignette(ctx, playRect);
      renderWeaponHud(ctx, canvasSize, playerStatus.selectedWeapon, presentation.weaponHudPhase, onAssetLoad);
      const playerFacing = session.getPlayerFacing().dir;
      renderFirstPersonHud(
        ctx,
        canvasSize,
        playerStatus,
        { showKeys: presentation.showKeys, facing: playerFacing, compassAngle: firstPersonResult.cameraAngle },
        onAssetLoad,
      );
      renderFirstPersonCombatFeedback(ctx, canvasSize, presentation.combatFeedback, onAssetLoad);
    } else {
      const metrics = renderMap(ctx, canvasSize, map, session.getVisibility());
      renderDrawableEntities(ctx, session, metrics);
      renderCombatFeedback(ctx, metrics, presentation.combatFeedback);
      renderHud(ctx, canvasSize, session);
    }
  }
  renderMessageLog(ctx, canvasSize, presentation.messages);
  switch (mode.type) {
    case "title":
      renderTitle(ctx, canvasSize, mode.intent, nowMs, onAssetLoad, mode.hoverButton);
      return { needsFrame: true };
    case "settings":
      renderSettings(ctx, canvasSize, audio, nowMs);
      return { needsFrame: true };
    case "loading":
      renderOverlay(ctx, canvasSize, "LOADING");
      return { needsFrame: false };
    case "paused":
      renderOverlay(ctx, canvasSize, "PAUSED", "P to resume");
      return { needsFrame: false };
    case "help":
      renderHelp(ctx, canvasSize, onAssetLoad);
      return { needsFrame: false };
    case "dialogue":
      renderDialogue(ctx, canvasSize, mode, onAssetLoad);
      return { needsFrame: false };
    case "intermission":
      renderIntermission(ctx, canvasSize, mode, nowMs);
      return { needsFrame: true };
    case "victory":
      renderOverlay(ctx, canvasSize, "VICTORY", "Space to play again");
      return { needsFrame: false };
    case "defeat":
      renderOverlay(ctx, canvasSize, "DEFEAT", "Space to retry level");
      return { needsFrame: false };
    case "error":
      renderOverlay(ctx, canvasSize, "LOAD FAILED", mode.message);
      return { needsFrame: false };
    case "verbMenu":
      renderVerbMenu(ctx, canvasSize, mode.selectedIndex, mode.hoverTarget, onAssetLoad);
      return frameResult(needsFrame, ambientOnly && !presentation.needsFrame);
    case "playing":
      return frameResult(needsFrame, ambientOnly && !presentation.needsFrame);
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}

function frameResult(needsFrame: boolean, ambientOnly: boolean): GameFrameResult {
  if (!needsFrame) return { needsFrame: false };
  return { needsFrame: true, ambientOnly };
}

function renderOverlay(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  title: string,
  subtitle?: string,
): void {
  const centerX = canvasSize.width / 2;
  const centerY = canvasSize.height / 2;
  const titleSize = Math.min(42, Math.max(24, Math.floor(canvasSize.width * 0.08)));
  const subtitleSize = Math.min(24, Math.max(14, Math.floor(canvasSize.width * 0.04)));

  ctx.save();
  ctx.fillStyle = OVERLAY_COLOR;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = monoFont(700, titleSize);
  ctx.fillStyle = OVERLAY_TITLE_COLOR;
  ctx.fillText(title, centerX, centerY - subtitleSize);

  if (subtitle) {
    ctx.font = monoFont(400, subtitleSize);
    ctx.fillStyle = OVERLAY_SUBTITLE_COLOR;
    ctx.fillText(subtitle, centerX, centerY + titleSize * 0.75);
  }
  ctx.restore();
}

function renderFirstPersonVignette(ctx: CanvasRenderingContext2D, rect: GameRenderRect): void {
  const canvas = vignetteCanvasFor(rect.width, rect.height);
  if (canvas === undefined) {
    paintVignette(ctx, 0, 0, rect.width, rect.height);
    return;
  }
  ctx.drawImage(canvas, rect.x, rect.y);
}

function vignetteCanvasFor(width: number, height: number): OffscreenCanvas | undefined {
  const ctor = globalThis.OffscreenCanvas;
  if (
    vignetteCache !== undefined &&
    vignetteCache.width === width &&
    vignetteCache.height === height &&
    vignetteCache.ctor === ctor
  ) {
    return vignetteCache.canvas;
  }
  const canvas = new ctor(width, height);
  const context = canvas.getContext("2d");
  if (context === null) return undefined;
  paintVignette(context, 0, 0, width, height);
  vignetteCache = { width, height, canvas, ctor };
  return canvas;
}

function paintVignette(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  const centerX = x + width / 2;
  const centerY = y + height * 0.54;
  const cornerRadius = Math.hypot(width / 2, Math.max(centerY - y, y + height - centerY));
  const innerRadius = Math.min(width, height) * 0.28;
  const gradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, cornerRadius);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.42, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.72, "rgba(0, 0, 0, 0.32)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.78)");
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
}
