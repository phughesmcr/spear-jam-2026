import type { EnemyIdleSoundSourceVisitor, SoundEmitterVisitor } from "@/src/game/model/sound.ts";
import type { CardinalDirection, GridPoint } from "@/src/game/world/direction.ts";

export interface AudioWorldSession {
  getPlayerPosition(): GridPoint;
  getPlayerFacing(): { readonly dir: CardinalDirection };
  forEachSoundEmitter(visit: SoundEmitterVisitor): void;
  forEachEnemyIdleSoundSource(visit: EnemyIdleSoundSourceVisitor): void;
}
