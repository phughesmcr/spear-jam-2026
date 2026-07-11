import type { InteractVerb } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { Entity } from "turn-based-engine/ecs";

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
    case "uplinkCodePickedUp":
      return "Picked up an uplink code.";
    case "weaponPickedUp":
      return `Picked up weapon ${event.slot}: ${event.label}.`;
    case "healthPickedUp":
      return event.healed === 0 ? "Picked up a health patch." : `Restored ${event.healed} HP.`;
    case "ammoPickedUp":
      return `Picked up ${event.amount} ${event.ammo} ammo.`;
    case "doorLocked":
      return "The door is locked.";
    case "doorOpened":
      return "Opened the door.";
    case "doorAlreadyOpen":
      return "It's already open.";
    case "doorCannotOpen":
      return "You can't open that.";
    case "doorShattered":
      return "The glass shatters.";
    case "uplinkTerminalLocked":
      return "The uplink needs a code.";
    case "uplinkTerminalActivated":
      return "Uplink accepted.";
    case "weaponSelected":
      return `Selected weapon ${event.slot}: ${event.label}.`;
    case "weaponUnavailable":
      return `Weapon ${event.slot} is not unlocked.`;
    case "ammoSpent":
      return `Spent ${event.amount} ${event.ammo} ammo.`;
    case "noAmmo":
      return `No ${event.ammo} ammo.`;
    case "examined":
      return event.text;
    case "verbFailed":
      return verbFailureMessage(event.verb);
    case "creditsEarned":
      return `Earned ${event.amount} credits.`;
    case "xpGained":
      return `Converted ${event.amount} credits to XP.`;
    case "enemyAlerted":
    case "enemyInvestigating":
      return "";
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

function verbFailureMessage(verb: InteractVerb): string {
  switch (verb) {
    case "open":
      return "Nothing to open.";
    case "use":
    case "talk":
      return "That didn't work.";
    default: {
      const _exhaustive: never = verb;
      return _exhaustive;
    }
  }
}
