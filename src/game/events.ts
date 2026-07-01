import type { Entity } from "@phughesmcr/miski";
import type { CommandSlot } from "@/src/game/state.ts";

export type GameEvent =
  | {
    readonly type: "attackMissed";
    readonly message?: string;
    readonly actor?: Entity;
    readonly target?: Entity;
  }
  | {
    readonly type: "damageDealt";
    readonly message?: string;
    readonly actor?: Entity;
    readonly target?: Entity;
    readonly amount: number;
    readonly critical: boolean;
  }
  | {
    readonly type: "entityDefeated";
    readonly message?: string;
    readonly actor?: Entity;
    readonly entity: Entity;
  }
  | {
    readonly type: "keyPickedUp";
    readonly message?: string;
    readonly entity: Entity;
  }
  | {
    readonly type: "doorLocked";
    readonly message?: string;
    readonly entity: Entity;
  }
  | {
    readonly type: "doorOpened";
    readonly message?: string;
    readonly entity: Entity;
  }
  | {
    readonly type: "weaponSelected";
    readonly message?: string;
    readonly slot: CommandSlot;
    readonly label: string;
  };
