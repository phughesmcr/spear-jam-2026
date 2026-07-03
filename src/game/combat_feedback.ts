import type { Entity } from "@phughesmcr/miski";
import type { GameEvent } from "@/src/game/events.ts";

export type CombatFeedbackTone = "hit" | "crit" | "miss" | "hurt" | "defeat";
export type CombatFeedbackSide = "player" | "enemy";

export type CombatFeedback = {
  readonly text: string;
  readonly tone: CombatFeedbackTone;
  readonly side: CombatFeedbackSide;
  readonly roll?: number;
  readonly total?: number;
};

export function combatFeedbackForEvents(
  playerEntity: Entity,
  events: readonly GameEvent[],
): readonly CombatFeedback[] {
  return events.flatMap((event) => combatFeedbackForEvent(playerEntity, event));
}

function combatFeedbackForEvent(playerEntity: Entity, event: GameEvent): readonly CombatFeedback[] {
  switch (event.type) {
    case "attackMissed":
      return [{
        text: "MISS",
        tone: "miss",
        side: combatFeedbackSide(playerEntity, event.actor),
        roll: event.roll,
        total: event.total,
      }];
    case "damageDealt": {
      const text = event.critical ? `CRIT ${event.amount}` : `HIT ${event.amount}`;
      return [{
        text,
        tone: event.actor === playerEntity ? (event.critical ? "crit" : "hit") : "hurt",
        side: combatFeedbackSide(playerEntity, event.actor),
        roll: event.roll,
        total: event.total,
      }];
    }
    case "entityDefeated":
      return [{
        text: event.entity === playerEntity ? "DEFEATED" : "DOWN",
        tone: "defeat",
        side: combatFeedbackSide(playerEntity, event.actor),
      }];
    default:
      return [];
  }
}

function combatFeedbackSide(playerEntity: Entity, actor: Entity): CombatFeedbackSide {
  return actor === playerEntity ? "player" : "enemy";
}
