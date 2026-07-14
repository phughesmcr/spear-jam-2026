import { playerWeaponSpec } from "@/src/game/content/weapons.ts";
import type { PresentationViewScratch } from "@/src/game/model/presentation_state.ts";
import type { ViewMode } from "@/src/game/model/state.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import type { FirstPersonRenderer } from "@/src/game/presentation/first_person/renderer.ts";
import type { GameFrameResultScratch, GameRenderScratch, RenderSpy } from "@/src/game/presentation/frame_scratch.ts";
import type { FrameRenderSession } from "@/src/game/presentation/session_view.ts";
import { renderDrawableEntities } from "@/src/game/presentation/top_down/drawables.ts";
import { renderMap } from "@/src/game/presentation/top_down/map.ts";
import { renderCombatFeedback, renderFirstPersonCombatFeedback } from "@/src/game/presentation/ui/combat_feedback.ts";
import { renderFirstPersonHud, renderHud } from "@/src/game/presentation/ui/hud.ts";
import { renderWeaponHud } from "@/src/game/presentation/ui/weapon_hud.ts";

type VignetteCache = {
  width: number;
  height: number;
  canvas: OffscreenCanvas;
  ctor: typeof OffscreenCanvas;
};

let vignetteCache: VignetteCache | undefined;

export function renderSessionPass(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  scratch: GameRenderScratch,
  session: FrameRenderSession,
  presentation: PresentationViewScratch,
  viewMode: ViewMode,
  firstPersonRenderer: FirstPersonRenderer | undefined,
  nowMs: number,
  frameResult: GameFrameResultScratch,
  spy: RenderSpy,
): void {
  spy.sessionRenderCount++;
  const map = session.getMap();
  if (viewMode === "firstPerson") {
    if (firstPersonRenderer === undefined) {
      throw new Error("renderGameFrame requires a first-person renderer and frame scratch for first-person sessions.");
    }
    const playRect = scratch.playRect;
    playRect.x = 0;
    playRect.y = 0;
    playRect.width = canvasSize.width;
    playRect.height = canvasSize.height;
    const playerStatus = session.getPlayerStatus();
    firstPersonRenderer.render(
      ctx,
      playRect,
      session,
      nowMs,
      scratch.firstPersonFrame,
      playerWeaponSpec(playerStatus.selectedWeapon).range,
    );
    frameResult.needsFrame ||= scratch.firstPersonFrame.needsFrame;
    frameResult.ambientOnly = scratch.firstPersonFrame.ambientOnly;
    renderFirstPersonVignette(ctx, playRect);
    renderWeaponHud(ctx, canvasSize, playerStatus.selectedWeapon, presentation.weaponHudPhase);
    renderFirstPersonHud(ctx, canvasSize, playerStatus, {
      showKeys: presentation.showKeys,
      compassAngle: scratch.firstPersonFrame.cameraAngle,
    });
    renderFirstPersonCombatFeedback(ctx, canvasSize, presentation.combatFeedback);
    return;
  }

  renderMap(ctx, canvasSize, map, session.getVisibility(), scratch.mapMetrics);
  renderDrawableEntities(ctx, session, scratch.mapMetrics);
  renderCombatFeedback(ctx, scratch.mapMetrics, presentation.combatFeedback);
  renderHud(ctx, canvasSize, session);
}

function renderFirstPersonVignette(
  ctx: CanvasRenderingContext2D,
  rect: { readonly width: number; readonly height: number; readonly x: number; readonly y: number },
): void {
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
