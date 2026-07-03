import type { GameSession } from "@/src/ecs/session.ts";
import type { CombatFeedback } from "@/src/game/combat_feedback.ts";
import type { GameMode, ViewMode } from "@/src/game/state.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { renderCombatFeedback } from "@/src/render/combat_feedback.ts";
import { renderDrawableEntities } from "@/src/render/drawables.ts";
import { preloadFirstPersonAssets, renderFirstPersonView } from "@/src/render/first_person.ts";
import { renderHud } from "@/src/render/hud.ts";
import { renderMap } from "@/src/render/map.ts";
import type { MapRenderMetrics } from "@/src/render/map.ts";
import { renderMessageLog } from "@/src/render/messages.ts";
import { renderOverlay } from "@/src/render/overlay.ts";
import { preloadVerbMenuAssets, renderVerbMenu } from "@/src/render/verb_menu.ts";
import { preloadWeaponHudAssets, renderWeaponHud } from "@/src/render/weapon_hud.ts";
import type { WeaponHudPhase } from "@/src/render/weapon_hud.ts";

const BACKGROUND_COLOR = "#101217";
const MESSAGE_BAND_COLOR = "#0b0f16";
const MESSAGE_BAND_BORDER = "rgba(148, 163, 184, 0.18)";
export const GAME_RENDER_TOP_OFFSET = 49;
export const MESSAGE_LOG_BAND_HEIGHT = 79;

export type GameRenderRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export async function preloadGameAssets(document: Document, onAssetLoad?: () => void): Promise<void> {
  await Promise.all([
    preloadVerbMenuAssets(document, onAssetLoad),
    preloadFirstPersonAssets(document, onAssetLoad),
    preloadWeaponHudAssets(document, onAssetLoad),
  ]);
}

/** Where the combat feedback strip sits above the message log, full width. */
const FEEDBACK_MARGIN = 12;
const FEEDBACK_BOTTOM_OFFSET = 150;

export function playCanvasSize(canvasSize: GameCanvasSize): GameCanvasSize {
  return {
    width: canvasSize.width,
    height: Math.max(1, canvasSize.height - MESSAGE_LOG_BAND_HEIGHT),
  };
}

export function gameRenderRect(canvasSize: GameCanvasSize): GameRenderRect {
  const playSize = playCanvasSize(canvasSize);
  const y = Math.min(GAME_RENDER_TOP_OFFSET, Math.max(0, playSize.height - 1));
  return {
    x: 0,
    y,
    width: playSize.width,
    height: Math.max(1, playSize.height - y),
  };
}

/** Synthetic map metrics so the feedback strip can render without a map. */
function firstPersonFeedbackMetrics(rect: GameRenderRect): MapRenderMetrics {
  return {
    mapWidth: 1,
    mapHeight: 0,
    tileSize: rect.width - FEEDBACK_MARGIN * 2,
    offsetX: rect.x + FEEDBACK_MARGIN,
    offsetY: rect.y + rect.height - FEEDBACK_BOTTOM_OFFSET,
  };
}

export function renderGameFrame(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  session?: GameSession,
  mode: GameMode = { type: "loading" },
  messages: readonly string[] = [],
  combatFeedback: readonly CombatFeedback[] = [],
  viewMode: ViewMode = "firstPerson",
  weaponHudPhase: WeaponHudPhase = "idle",
  onAssetLoad?: () => void,
): void {
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  const playSize = playCanvasSize(canvasSize);
  const renderRect = gameRenderRect(canvasSize);
  const renderSize = { width: renderRect.width, height: renderRect.height };
  renderMessageBand(ctx, canvasSize, playSize.height);
  if (session) {
    const { map } = session;
    if (viewMode === "firstPerson") {
      renderFirstPersonView(
        ctx,
        renderRect,
        session,
        onAssetLoad,
      );
      renderFirstPersonVignette(ctx, renderRect);
      renderInRect(ctx, renderRect, () => {
        renderWeaponHud(
          ctx,
          renderSize,
          session.getPlayerState().selectedWeapon,
          weaponHudPhase,
          onAssetLoad,
        );
      });
      renderCombatFeedback(ctx, firstPersonFeedbackMetrics(renderRect), combatFeedback);
    } else {
      const metrics = renderMap(
        ctx,
        renderSize,
        map,
        session.getVisibility(),
        { x: renderRect.x, y: renderRect.y },
      );
      renderDrawableEntities(ctx, session, metrics);
      renderCombatFeedback(ctx, metrics, combatFeedback);
    }
    renderHud(ctx, canvasSize, session);
  }
  renderMessageLog(ctx, canvasSize, messages, playSize.height);
  switch (mode.type) {
    case "loading":
      renderOverlay(ctx, canvasSize, "LOADING");
      return;
    case "paused":
      renderOverlay(ctx, canvasSize, "PAUSED", "P to resume");
      return;
    case "menu":
      renderOverlay(ctx, canvasSize, "MENU", "Esc to resume");
      return;
    case "dialogue":
      renderOverlay(ctx, canvasSize, mode.title, mode.message);
      return;
    case "intermission":
      renderOverlay(ctx, canvasSize, "INTERMISSION", mode.message);
      return;
    case "victory":
      renderOverlay(ctx, canvasSize, "VICTORY", "Space to play again");
      return;
    case "defeat":
      renderOverlay(ctx, canvasSize, "DEFEAT", "Space to retry level");
      return;
    case "error":
      renderOverlay(ctx, canvasSize, "LOAD FAILED", mode.message);
      return;
    case "verbMenu":
      renderVerbMenu(ctx, canvasSize, mode.selectedIndex, onAssetLoad);
      return;
    case "playing":
      return;
  }
}

function renderInRect(ctx: CanvasRenderingContext2D, rect: GameRenderRect, render: () => void): void {
  ctx.save();
  ctx.translate(rect.x, rect.y);
  render();
  ctx.restore();
}

function renderMessageBand(ctx: CanvasRenderingContext2D, canvasSize: GameCanvasSize, top: number): void {
  ctx.fillStyle = MESSAGE_BAND_COLOR;
  ctx.fillRect(0, top, canvasSize.width, canvasSize.height - top);
  ctx.strokeStyle = MESSAGE_BAND_BORDER;
  ctx.beginPath();
  ctx.moveTo(0, top + 0.5);
  ctx.lineTo(canvasSize.width, top + 0.5);
  ctx.stroke();
}

function renderFirstPersonVignette(ctx: CanvasRenderingContext2D, rect: GameRenderRect): void {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height * 0.54;
  const radius = Math.max(rect.width, rect.height) * 0.76;
  const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.24, centerX, centerY, radius);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.62, "rgba(0, 0, 0, 0.08)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.48)");

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}
