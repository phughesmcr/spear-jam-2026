import type { DialogueChoice } from "@/src/dialogue/dialogue.ts";
import type { VoiceId } from "@/src/dialogue/voice.ts";
import type { DisplayName } from "@/src/game/names.ts";
import type { KeyColor } from "@/src/map/map.ts";

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

export type PlayerStatusSnapshot = {
  readonly heldKeys: readonly KeyColor[];
  readonly selectedWeapon: CommandSlot;
  readonly unlockedWeapons: readonly CommandSlot[];
  readonly ammo: PlayerAmmoState;
  readonly health: PlayerHealthState;
  readonly hasUplinkCode: boolean;
  readonly hasSpear: boolean;
  readonly progress: PlayerProgressState;
};

export type DialogueState = {
  readonly title: string;
  readonly message: string;
  readonly voice?: VoiceId;
  readonly choices: readonly DialogueChoice[];
  /** Speaker's DisplayName, used to pick a portrait sprite; absent falls back to a drawn bust. */
  readonly speaker?: DisplayName;
  /** Tree that resolves choice "next" links; absent for one-off dialogues that always close. */
  readonly treeKey?: string;
};

export type TitleIntent = "start" | "resume";
export type TitleHoverButton = "start" | "settings" | "help";

export type HelpReturnTo =
  | { readonly kind: "verbMenu"; readonly selectedIndex: number }
  | { readonly kind: "title"; readonly intent: TitleIntent };

export type GameMode =
  | { readonly type: "title"; readonly intent: TitleIntent; readonly hoverButton?: TitleHoverButton }
  | { readonly type: "loading" }
  | { readonly type: "playing" }
  | { readonly type: "paused" }
  | {
    readonly type: "verbMenu";
    readonly selectedIndex: number;
    readonly hoverTarget?: VerbMenuTarget;
    readonly pointerDownTarget?: VerbMenuTarget;
  }
  | { readonly type: "help"; readonly returnTo: HelpReturnTo }
  | ({ readonly type: "dialogue" } & DialogueState & { readonly pointerDownSlot?: number })
  | {
    readonly type: "intermission";
    readonly title?: string;
    readonly pages: readonly string[];
    readonly pageIndex: number;
    readonly prompt: string;
    readonly goto: string;
    readonly revealStartedAtMs: number;
    readonly revealed: boolean;
  }
  | {
    readonly type: "settings";
    readonly returnIntent: TitleIntent;
    readonly dragging?: "music" | "sound" | "fps";
  }
  | { readonly type: "victory" }
  | { readonly type: "defeat" }
  | { readonly type: "error"; readonly message: string };

/** Which renderer presents the playing view. */
export type ViewMode = "firstPerson" | "topDown";
