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

/** Synthetic map metrics so the feedback strip can render without a map. */
function firstPersonFeedbackMetrics(canvasSize: GameCanvasSize): MapRenderMetrics {
  return {
    mapWidth: 1,
    mapHeight: 0,
    tileSize: canvasSize.width - FEEDBACK_MARGIN * 2,
    offsetX: FEEDBACK_MARGIN,
    offsetY: canvasSize.height - FEEDBACK_BOTTOM_OFFSET,
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
  if (session) {
    const { map } = session;
    if (viewMode === "firstPerson") {
      renderFirstPersonView(
        ctx,
        { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height },
        session,
        onAssetLoad,
      );
      renderWeaponHud(ctx, canvasSize, session.getPlayerState().selectedWeapon, weaponHudPhase, onAssetLoad);
      renderCombatFeedback(ctx, firstPersonFeedbackMetrics(canvasSize), combatFeedback);
    } else {
      const metrics = renderMap(ctx, canvasSize, map, session.getVisibility());
      renderDrawableEntities(ctx, session, metrics);
      renderCombatFeedback(ctx, metrics, combatFeedback);
    }
    renderHud(ctx, canvasSize, session);
  }
  renderMessageLog(ctx, canvasSize, messages);
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
