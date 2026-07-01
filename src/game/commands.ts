export type RelativeMoveDirection = "forward" | "backward" | "left" | "right";
export type TurnDirection = "left" | "right";
export type TurnDelta = -1 | 1;
export type CommandSlot = 1 | 2 | 3;

export type PlayerCommand =
  | { readonly type: "move"; readonly direction: RelativeMoveDirection }
  | { readonly type: "turn"; readonly direction: TurnDirection }
  | { readonly type: "wait" }
  | { readonly type: "interact" }
  | { readonly type: "attack" }
  | { readonly type: "selectItem"; readonly slot: CommandSlot }
  | { readonly type: "selectWeapon"; readonly slot: CommandSlot };

export type GameCommand =
  | PlayerCommand
  | { readonly type: "menu" }
  | { readonly type: "pause" };

export type MapChange = {
  readonly goto: string;
};

export interface PlayerCommandResult {
  readonly consumedTurn: boolean;
  readonly changedWorld: boolean;
  readonly mapChange?: MapChange;
}

const MOVE_DIRECTION_OFFSETS: Readonly<Record<RelativeMoveDirection, number>> = {
  forward: 0,
  backward: 2,
  left: -1,
  right: 1,
};

const TURN_DIRECTION_DELTAS: Readonly<Record<TurnDirection, TurnDelta>> = {
  left: -1,
  right: 1,
};

export function relativeMoveDirectionOffset(direction: RelativeMoveDirection): number {
  return MOVE_DIRECTION_OFFSETS[direction];
}

export function turnDirectionDelta(direction: TurnDirection): TurnDelta {
  return TURN_DIRECTION_DELTAS[direction];
}

export function isPlayerCommand(command: GameCommand): command is PlayerCommand {
  switch (command.type) {
    case "move":
    case "turn":
    case "wait":
    case "interact":
    case "attack":
    case "selectItem":
    case "selectWeapon":
      return true;
    case "menu":
    case "pause":
      return false;
  }
}
