import type { Entity } from "@phughesmcr/miski";
import type { GameEvent } from "@/src/game/events.ts";

/** Derives the message-log line for an event. Events are pure facts; wording lives here. */
export function messageForEvent(playerEntity: Entity, event: GameEvent): string {
  switch (event.type) {
    case "attackMissed":
      return event.targetName === undefined ? "Nothing in range." : `${event.actorName} missed ${event.targetName}.`;
    case "damageDealt":
      return `${event.actorName} hit ${event.targetName} for ${event.amount}${event.critical ? " critical" : ""}.`;
    case "entityDefeated":
      return event.entity === playerEntity ? "You are defeated." : `${event.entityName} is defeated.`;
    case "keyPickedUp":
      return "Picked up a key.";
    case "doorLocked":
      return "The door is locked.";
    case "doorOpened":
      return "Opened the door.";
    case "weaponSelected":
      return `Selected weapon ${event.slot}: ${event.label}.`;
  }
}
