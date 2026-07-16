import type { PlayerStatusSnapshot } from "@/src/game/model/state.ts";
import type { CardinalDirection } from "turn-based-engine/crawler";
import type { HudAssets } from "@/src/game/presentation/asset_view.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import { renderFirstPersonCompass, renderFirstPersonCompassAtAngle } from "@/src/game/presentation/ui/hud_compass.ts";
import { renderFirstPersonMeterPanels } from "@/src/game/presentation/ui/hud_meters.ts";

export type { FirstPersonHudPanel } from "@/src/game/presentation/ui/hud_meters.ts";
export { renderHud } from "@/src/game/presentation/ui/hud_text.ts";

export type FirstPersonHudOptions = {
  readonly showKeys?: boolean;
  readonly facing?: CardinalDirection;
  readonly compassAngle?: number;
};

export function renderFirstPersonHud(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  assets: HudAssets,
  playerState: PlayerStatusSnapshot,
  options: FirstPersonHudOptions = {},
): void {
  if (options.compassAngle !== undefined) {
    renderFirstPersonCompassAtAngle(ctx, canvasSize, options.compassAngle);
  } else if (options.facing !== undefined) {
    renderFirstPersonCompass(ctx, canvasSize, options.facing);
  }

  renderFirstPersonMeterPanels(ctx, canvasSize, assets, playerState, { showKeys: options.showKeys });
}
