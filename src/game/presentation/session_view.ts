import type { DrawableEntityVisitor, LightEntityVisitor } from "@/src/game/model/render_snapshot.ts";
import type { PlayerStatusSnapshot } from "@/src/game/model/state.ts";
import type { CardinalDirection, GridPoint } from "@/src/game/world/direction.ts";
import type { GameMap } from "@/src/game/world/map.ts";
import type { TileVisibility } from "@/src/game/world/visibility.ts";

export type FacingSnapshot = {
  readonly dir: CardinalDirection;
};

export interface PlayerPoseSession {
  getPlayerPosition(): GridPoint;
  getPlayerFacing(): FacingSnapshot;
}

export interface FrameRenderSession extends PlayerPoseSession {
  getMap(): GameMap;
  getPlayerStatus(): PlayerStatusSnapshot;
  getVisibility(): TileVisibility;
  forEachDrawable(visit: DrawableEntityVisitor): void;
  forEachLight(visit: LightEntityVisitor): void;
}
