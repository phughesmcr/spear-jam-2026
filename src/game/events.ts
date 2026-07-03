import type { Entity } from "@phughesmcr/miski";
import type { InteractVerb } from "@/src/game/commands.ts";
import type { AmmoKind, CommandSlot } from "@/src/game/state.ts";

/**
 * Structured facts about what happened during a turn.
 *
 * Names are resolved when the event is emitted because the entities involved
 * (e.g. a defeated enemy) may already be destroyed by the time the event is
 * presented. Message wording is derived in `src/game/messages.ts`.
 */
export type GameEvent =
  | {
    readonly type: "attackMissed";
    readonly actor: Entity;
    readonly actorName: string;
    readonly target?: Entity;
    readonly targetName?: string;
    readonly roll?: number;
    readonly total?: number;
  }
  | {
    readonly type: "damageDealt";
    readonly actor: Entity;
    readonly actorName: string;
    readonly target: Entity;
    readonly targetName: string;
    readonly roll: number;
    readonly total: number;
    readonly amount: number;
    readonly critical: boolean;
  }
  | {
    readonly type: "entityDefeated";
    readonly actor: Entity;
    readonly entity: Entity;
    readonly entityName: string;
  }
  | {
    readonly type: "keyPickedUp";
    readonly entity: Entity;
  }
  | {
    readonly type: "uplinkCodePickedUp";
    readonly entity: Entity;
  }
  | {
    readonly type: "weaponPickedUp";
    readonly entity: Entity;
    readonly slot: CommandSlot;
    readonly label: string;
  }
  | {
    readonly type: "healthPickedUp";
    readonly entity: Entity;
    readonly amount: number;
    readonly healed: number;
  }
  | {
    readonly type: "ammoPickedUp";
    readonly entity: Entity;
    readonly ammo: AmmoKind;
    readonly amount: number;
  }
  | {
    readonly type: "doorLocked";
    readonly entity: Entity;
  }
  | {
    readonly type: "doorOpened";
    readonly entity: Entity;
  }
  | {
    readonly type: "doorAlreadyOpen";
    readonly entity: Entity;
  }
  | {
    readonly type: "uplinkTerminalLocked";
    readonly entity: Entity;
  }
  | {
    readonly type: "uplinkTerminalActivated";
    readonly entity: Entity;
  }
  | {
    readonly type: "weaponSelected";
    readonly slot: CommandSlot;
    readonly label: string;
  }
  | {
    readonly type: "weaponUnavailable";
    readonly slot: CommandSlot;
    readonly label: string;
  }
  | {
    readonly type: "ammoSpent";
    readonly ammo: AmmoKind;
    readonly amount: number;
  }
  | {
    readonly type: "noAmmo";
    readonly ammo: AmmoKind;
  }
  | {
    readonly type: "examined";
    readonly entity?: Entity;
    readonly text: string;
  }
  | {
    readonly type: "verbFailed";
    readonly verb: InteractVerb;
  }
  | {
    readonly type: "creditsEarned";
    readonly amount: number;
    readonly credits: number;
    readonly score: number;
  }
  | {
    readonly type: "xpGained";
    readonly amount: number;
    readonly xp: number;
  };
