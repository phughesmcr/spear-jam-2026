import type { Entity } from "@phughesmcr/miski";
import type { DrawableEntityVisitor, LightEntityVisitor } from "@/src/ecs/drawables.ts";
import type { EnemyIdleSoundSourceVisitor, SoundEmitterVisitor } from "@/src/ecs/sounds.ts";
import type { PlayerStatusSnapshot, TargetMarkerTone } from "@/src/game/state.ts";
import type { CardinalDirection, GridPoint } from "@/src/grid/direction.ts";
import type { GameMap } from "@/src/map/map.ts";
import type { TileVisibility } from "@/src/game/visibility.ts";

export type FacingSnapshot = {
  readonly dir: CardinalDirection;
};

export interface PlayerPoseSession {
  getPlayerPosition(): GridPoint;
  getPlayerFacing(): FacingSnapshot;
}

export interface TickSession {
  tick(nowMs: number): { readonly needsFrame: boolean };
}

export interface AudioWorldSession extends PlayerPoseSession {
  forEachSoundEmitter(visit: SoundEmitterVisitor): void;
  forEachEnemyIdleSoundSource(visit: EnemyIdleSoundSourceVisitor): void;
}

export interface FrameRenderSession extends PlayerPoseSession {
  readonly map: GameMap;
  getPlayerStatus(): PlayerStatusSnapshot;
  getVisibility(): TileVisibility;
  forEachDrawable(visit: DrawableEntityVisitor): void;
  forEachLight(visit: LightEntityVisitor): void;
  targetMarkerTone(): TargetMarkerTone | undefined;
}

export interface RuntimeSession extends FrameRenderSession, AudioWorldSession, TickSession {
  readonly playerEntity: Entity;
}
