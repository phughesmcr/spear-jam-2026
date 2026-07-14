import type { Entity } from "turn-based-engine/ecs";
import type { DrawableEntityVisitor, LightEntityVisitor } from "@/src/game/simulation/drawables.ts";
import type { EnemyIdleSoundSourceVisitor, SoundEmitterVisitor } from "@/src/game/simulation/sounds.ts";
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

export interface TickSession {
  tick(nowMs: number): { readonly needsFrame: boolean };
}

export interface AudioWorldSession extends PlayerPoseSession {
  forEachSoundEmitter(visit: SoundEmitterVisitor): void;
  forEachEnemyIdleSoundSource(visit: EnemyIdleSoundSourceVisitor): void;
}

export interface FrameRenderSession extends PlayerPoseSession {
  getMap(): GameMap;
  getPlayerStatus(): PlayerStatusSnapshot;
  getVisibility(): TileVisibility;
  forEachDrawable(visit: DrawableEntityVisitor): void;
  forEachLight(visit: LightEntityVisitor): void;
}

export interface RuntimeSession extends FrameRenderSession, AudioWorldSession, TickSession {
  getPlayerEntity(): Entity;
}
