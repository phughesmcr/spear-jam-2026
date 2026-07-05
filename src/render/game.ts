import type { GameSession } from "@/src/ecs/session.ts";
import type { CombatFeedback } from "@/src/game/combat_feedback.ts";
import type { GameMode, ViewMode } from "@/src/game/state.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import {
  preloadCombatFeedbackAssets,
  renderCombatFeedback,
  renderFirstPersonCombatFeedback,
} from "@/src/render/combat_feedback.ts";
import { renderDrawableEntities } from "@/src/render/drawables.ts";
import { preloadDialogueAssets, renderDialogue } from "@/src/render/dialogue.ts";
import type { FirstPersonRenderer } from "@/src/render/first_person.ts";
import { preloadHudAssets, renderFirstPersonHud, renderHud } from "@/src/render/hud.ts";
import type { FirstPersonHudOptions } from "@/src/render/hud.ts";
import { renderMap } from "@/src/render/map.ts";
import { renderMessageLog } from "@/src/render/messages.ts";
import { monoFont } from "@/src/render/text.ts";
import { preloadVerbMenuAssets, renderVerbMenu } from "@/src/render/verb_menu.ts";
import { preloadWeaponHudAssets, renderWeaponHud } from "@/src/render/weapon_hud.ts";
import type { WeaponHudPhase } from "@/src/render/weapon_hud.ts";

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
const FIRST_PERSON_PLAY_RECT: GameRenderRect = { x: 0, y: 0, width: 0, height: 0 };

export async function preloadGameAssets(
  document: Document,
  firstPersonRenderer: FirstPersonRenderer,
  onAssetLoad?: () => void,
): Promise<void> {
  await Promise.all([
    preloadVerbMenuAssets(document, onAssetLoad),
    firstPersonRenderer.preloadAssets(document, onAssetLoad),
    preloadWeaponHudAssets(document, onAssetLoad),
    preloadHudAssets(document, onAssetLoad),
    preloadCombatFeedbackAssets(document, onAssetLoad),
    preloadDialogueAssets(document, onAssetLoad),
  ]);
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
  firstPersonRenderer?: FirstPersonRenderer,
  firstPersonHud: FirstPersonHudOptions = {},
  onAssetLoad?: () => void,
): void {
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  if (session) {
    const spritesAnimating = session.advanceSpriteAnimations(performance.now());
    const { map } = session;
    if (viewMode === "firstPerson") {
      if (firstPersonRenderer === undefined) {
        throw new Error("renderGameFrame requires a first-person renderer for first-person sessions.");
      }
      const playRect = FIRST_PERSON_PLAY_RECT;
      playRect.x = 0;
      playRect.y = 0;
      playRect.width = canvasSize.width;
      playRect.height = canvasSize.height;
      const playerState = session.getPlayerState();
      firstPersonRenderer.render(
        ctx,
        playRect,
        session,
        session.targetMarkerTone(),
        onAssetLoad,
      );
      renderFirstPersonVignette(ctx, playRect);
      renderWeaponHud(ctx, canvasSize, playerState.selectedWeapon, weaponHudPhase, onAssetLoad);
      renderFirstPersonHud(
        ctx,
        canvasSize,
        playerState,
        { ...firstPersonHud, facing: session.getPlayerFacing().dir },
        onAssetLoad,
      );
      renderFirstPersonCombatFeedback(ctx, canvasSize, combatFeedback, onAssetLoad);
    } else {
      const metrics = renderMap(ctx, canvasSize, map, session.getVisibility());
      renderDrawableEntities(ctx, session, metrics);
      renderCombatFeedback(ctx, metrics, combatFeedback);
      renderHud(ctx, canvasSize, session);
      if (spritesAnimating) scheduleRepaint(onAssetLoad);
    }
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
      renderDialogue(ctx, canvasSize, mode, onAssetLoad);
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

function scheduleRepaint(repaint: (() => void) | undefined): void {
  if (repaint === undefined || typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame((): void => repaint());
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
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height * 0.54;
  const cornerRadius = Math.hypot(rect.width / 2, Math.max(centerY - rect.y, rect.y + rect.height - centerY));
  const innerRadius = Math.min(rect.width, rect.height) * 0.28;
  const gradient = ctx.createRadialGradient(centerX, centerY, innerRadius, centerX, centerY, cornerRadius);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.42, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.72, "rgba(0, 0, 0, 0.32)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.78)");

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = gradient;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}
