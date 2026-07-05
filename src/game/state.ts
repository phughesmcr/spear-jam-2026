import type { DialogueChoice } from "@/src/dialogue/dialogue.ts";
import type { KeyColor } from "@/src/map/map.ts";
import type { StoryFlag } from "@/src/game/story.ts";

export type CommandSlot = 1 | 2 | 3;
export type VerbMenuControl = "wait" | "toggleView" | "help" | "close";
export type VerbMenuTarget =
  | { readonly kind: "verb"; readonly verbIndex: number }
  | { readonly kind: "weapon"; readonly slot: CommandSlot }
  | { readonly kind: "control"; readonly control: VerbMenuControl };

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
  readonly health?: PlayerHealthState;
  readonly hasUplinkCode?: boolean;
  readonly progress?: Partial<PlayerProgressState>;
  readonly storyFlags?: readonly StoryFlag[];
};

export type DialogueState = {
  readonly title: string;
  readonly message: string;
  readonly choices: readonly DialogueChoice[];
  /** Speaker's DisplayName, used to pick a portrait sprite; absent falls back to a drawn bust. */
  readonly speaker?: number;
  /** Tree that resolves choice "next" links; absent for one-off dialogues that always close. */
  readonly treeKey?: string;
};

export type TargetMarkerTone = "danger" | "locked" | "loot" | "use";

export type GameMode =
  | { readonly type: "loading" }
  | { readonly type: "playing" }
  | { readonly type: "paused" }
  | { readonly type: "menu" }
  | { readonly type: "verbMenu"; readonly selectedIndex: number; readonly hoverTarget?: VerbMenuTarget }
  | { readonly type: "help"; readonly selectedIndex: number }
  | ({ readonly type: "dialogue" } & DialogueState)
  | {
    readonly type: "intermission";
    readonly title?: string;
    readonly pages: readonly string[];
    readonly pageIndex: number;
    readonly prompt: string;
    readonly goto: string;
    readonly playerState: PlayerStateInput;
    readonly revealStartedAtMs: number;
    readonly revealed: boolean;
  }
  | { readonly type: "victory" }
  | { readonly type: "defeat" }
  | { readonly type: "error"; readonly message: string };

/** Which renderer presents the playing view. */
export type ViewMode = "firstPerson" | "topDown";
