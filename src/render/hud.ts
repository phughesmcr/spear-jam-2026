import type { PlayerStatusSnapshot } from "@/src/game/state.ts";
import type { CardinalDirection } from "@/src/grid/direction.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { renderFirstPersonCompass, renderFirstPersonCompassAtAngle } from "@/src/render/hud_compass.ts";
import { renderFirstPersonMeterPanels } from "@/src/render/hud_meters.ts";

export { preloadHudAssets } from "@/src/render/hud_meters.ts";
export type { FirstPersonHudPanel } from "@/src/render/hud_meters.ts";
export { renderHud } from "@/src/render/hud_text.ts";

export type FirstPersonHudOptions = {
  readonly showKeys?: boolean;
  readonly facing?: CardinalDirection;
  readonly compassAngle?: number;
};

export function renderFirstPersonHud(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  playerState: PlayerStatusSnapshot,
  options: FirstPersonHudOptions = {},
  onAssetLoad?: () => void,
): void {
  if (options.compassAngle !== undefined) {
    renderFirstPersonCompassAtAngle(ctx, canvasSize, options.compassAngle);
  } else if (options.facing !== undefined) {
    renderFirstPersonCompass(ctx, canvasSize, options.facing);
  }

  renderFirstPersonMeterPanels(ctx, canvasSize, playerState, { showKeys: options.showKeys }, onAssetLoad);
}
