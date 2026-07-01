import type { Entity } from "@phughesmcr/miski";
import type { GameEvent } from "@/src/game/events.ts";

export type CombatFeedbackTone = "hit" | "crit" | "miss" | "hurt" | "defeat";

export type CombatFeedback = {
  readonly text: string;
  readonly tone: CombatFeedbackTone;
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
      return [{ text: "MISS", tone: "miss" }];
    case "damageDealt": {
      const text = event.critical ? `CRIT ${event.amount}` : `HIT ${event.amount}`;
      return [{ text, tone: event.actor === playerEntity ? (event.critical ? "crit" : "hit") : "hurt" }];
    }
    case "entityDefeated":
      return [{ text: event.entity === playerEntity ? "DEFEATED" : "DOWN", tone: "defeat" }];
    default:
      return [];
  }
}
