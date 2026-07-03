import type { DialogueChoice } from "@/src/dialogue/dialogue.ts";
import type { KeyColor } from "@/src/map/map.ts";
import type { TurnEffectState } from "@/src/game/turn_effects.ts";

export type CommandSlot = 1 | 2 | 3;

export type AmmoKind = "pistol" | "cannon";

export function commandSlotForCode(slot: number): CommandSlot {
  switch (slot) {
    case 1:
    case 2:
    case 3:
      return slot;
    default:
      throw new Error(`Unknown weapon slot: ${slot}`);
  }
}

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

export type PlayerStateInput = {
  readonly heldKeys?: readonly KeyColor[];
  readonly selectedWeapon?: CommandSlot;
  readonly unlockedWeapons?: readonly CommandSlot[];
  readonly ammo?: Partial<PlayerAmmoState>;
  readonly health?: Partial<PlayerHealthState>;
  readonly hasUplinkCode?: boolean;
  readonly progress?: Partial<PlayerProgressState>;
  readonly turnEffects?: readonly TurnEffectState[];
};

export type DialogueState = {
  readonly title: string;
  readonly message: string;
  readonly choices: readonly DialogueChoice[];
  /** Tree that resolves choice "next" links; absent for one-off dialogues that always close. */
  readonly treeKey?: string;
};

export type GameMode =
  | { readonly type: "loading" }
  | { readonly type: "playing" }
  | { readonly type: "paused" }
  | { readonly type: "menu" }
  | { readonly type: "verbMenu"; readonly selectedIndex: number }
  | ({ readonly type: "dialogue" } & DialogueState)
  | {
    readonly type: "intermission";
    readonly message: string;
    readonly goto: string;
    readonly playerState: PlayerStateInput;
  }
  | { readonly type: "victory" }
  | { readonly type: "defeat" }
  | { readonly type: "error"; readonly message: string };

/** Which renderer presents the playing view. */
export type ViewMode = "firstPerson" | "topDown";
