import type { KeyColor } from "@/src/map/map.ts";

export type CommandSlot = 1 | 2 | 3;

export type AmmoKind = "pistol" | "cannon";

export type PlayerAmmoState = {
  readonly pistol: number;
  readonly cannon: number;
};

export type PlayerHealthState = {
  readonly current: number;
  readonly max: number;
};

export type PlayerProgressState = {
  readonly credits: number;
  readonly score: number;
  readonly xp: number;
  readonly levelCredits: number;
};

/** Player progress that survives map transitions. */
export type PlayerState = {
  readonly heldKeys: readonly KeyColor[];
  readonly selectedWeapon: CommandSlot;
  readonly unlockedWeapons?: readonly CommandSlot[];
  readonly ammo?: PlayerAmmoState;
  readonly health?: PlayerHealthState;
  readonly hasUplinkCode?: boolean;
  readonly progress?: PlayerProgressState;
};

export type DialogueState = {
  readonly title: string;
  readonly message: string;
};

export type GameMode =
  | { readonly type: "loading" }
  | { readonly type: "playing" }
  | { readonly type: "paused" }
  | { readonly type: "menu" }
  | ({ readonly type: "dialogue" } & DialogueState)
  | {
    readonly type: "intermission";
    readonly message: string;
    readonly goto: string;
    readonly playerState: PlayerState;
  }
  | { readonly type: "victory" }
  | { readonly type: "defeat" }
  | { readonly type: "error"; readonly message: string };
