import type { GameEvent } from "@/src/game/events.ts";
import type { LevelStats } from "@/src/game/level_stats.ts";
import type { SoundCue } from "@/src/game/sound.ts";
import type { CommandSlot, DialogueState } from "@/src/game/state.ts";

export type RelativeMoveDirection = "forward" | "backward" | "left" | "right";
export type TurnDirection = "left" | "right";
export type InteractVerb = "use" | "open" | "talk";

export type PlayerCommand =
  | { readonly type: "move"; readonly direction: RelativeMoveDirection }
  | { readonly type: "turn"; readonly direction: TurnDirection }
  | { readonly type: "wait" }
  | { readonly type: "interact"; readonly verb?: InteractVerb }
  | { readonly type: "examine" }
  | { readonly type: "attack" }
  | { readonly type: "smartAction" }
  | { readonly type: "selectWeapon"; readonly slot: CommandSlot };

export type GameCommand =
  | PlayerCommand
  | { readonly type: "action" }
  | { readonly type: "menu" }
  | { readonly type: "settings" }
  | { readonly type: "help" }
  | { readonly type: "pause" }
  | { readonly type: "toggleView" };

export type MapChange = {
  readonly goto: string;
};

export type PlayerCommandResult =
  | { readonly type: "continue"; readonly events: readonly GameEvent[]; readonly soundCues?: readonly SoundCue[] }
  | {
    readonly type: "mapChange";
    readonly events: readonly GameEvent[];
    readonly soundCues?: readonly SoundCue[];
    readonly mapChange: MapChange;
    readonly levelStats: LevelStats;
  }
  | {
    readonly type: "dialogue";
    readonly events: readonly GameEvent[];
    readonly soundCues?: readonly SoundCue[];
    readonly dialogue: DialogueState;
  }
  | {
    readonly type: "outcome";
    readonly events: readonly GameEvent[];
    readonly soundCues?: readonly SoundCue[];
    readonly outcome: "defeat";
  }
  | {
    readonly type: "outcome";
    readonly events: readonly GameEvent[];
    readonly soundCues?: readonly SoundCue[];
    readonly outcome: "victory";
    readonly levelStats: LevelStats;
  };

const MOVE_DIRECTION_OFFSETS: Readonly<Record<RelativeMoveDirection, number>> = {
  forward: 0,
  backward: 2,
  left: -1,
  right: 1,
};

export function relativeMoveDirectionOffset(direction: RelativeMoveDirection): number {
  return MOVE_DIRECTION_OFFSETS[direction];
}

export function isPlayerCommand(command: GameCommand): command is PlayerCommand {
  switch (command.type) {
    case "move":
    case "turn":
    case "wait":
    case "interact":
    case "examine":
    case "attack":
    case "smartAction":
    case "selectWeapon":
      return true;
    case "action":
    case "menu":
    case "settings":
    case "help":
    case "pause":
    case "toggleView":
      return false;
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}
