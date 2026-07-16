import type { EnemyIdleSoundSourceVisitor, SoundEmitterVisitor } from "@/src/game/model/sound.ts";
import type { CardinalDirection, GridPoint } from "turn-based-engine/crawler";

export interface AudioWorldSession {
  getPlayerPosition(): GridPoint;
  getPlayerFacing(): { readonly dir: CardinalDirection };
  forEachSoundEmitter(visit: SoundEmitterVisitor): void;
  forEachEnemyIdleSoundSource(visit: EnemyIdleSoundSourceVisitor): void;
}
