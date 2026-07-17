import type { GameCommand, RelativeMoveDirection } from "@/src/game/model/commands.ts";
import type { InputSize, TouchGesture } from "turn-based-web-engine/input";

const MOVE_DIRECTIONS_BY_SWIPE = {
  up: "forward",
  down: "backward",
  left: "left",
  right: "right",
} as const satisfies Readonly<
  Record<Extract<TouchGesture, { readonly type: "swipe" }>["direction"], RelativeMoveDirection>
>;

const COMMANDS_BY_KEY = {
  Space: { type: "wait" },
  KeyW: { type: "move", direction: "forward" },
  KeyS: { type: "move", direction: "backward" },
  KeyA: { type: "move", direction: "left" },
  KeyD: { type: "move", direction: "right" },
  KeyQ: { type: "turn", direction: "left" },
  KeyE: { type: "turn", direction: "right" },
  Comma: { type: "smartAction" },
  Period: { type: "action" },
  Tab: { type: "toggleView" },
  Escape: { type: "menu" },
  KeyP: { type: "pause" },
  Digit1: { type: "selectWeapon", slot: 1 },
  Digit2: { type: "selectWeapon", slot: 2 },
  Digit3: { type: "selectWeapon", slot: 3 },
} as const satisfies Readonly<Record<string, GameCommand>>;

type CommandKey = keyof typeof COMMANDS_BY_KEY;

export function commandForKeyPress(code: string): GameCommand | undefined {
  return isCommandKey(code) ? COMMANDS_BY_KEY[code] : undefined;
}

export function commandForTouchGesture(gesture: TouchGesture, size: InputSize): GameCommand {
  switch (gesture.type) {
    case "swipe":
      return {
        type: "move",
        direction: MOVE_DIRECTIONS_BY_SWIPE[gesture.direction],
      };
    case "doubleTap":
      return { type: "smartAction" };
    case "tap":
      if (gesture.x < size.width / 3) return { type: "turn", direction: "left" };
      if (gesture.x > size.width * 2 / 3) return { type: "turn", direction: "right" };
      return { type: "action" };
    default: {
      const _exhaustive: never = gesture;
      return _exhaustive;
    }
  }
}

function isCommandKey(code: string): code is CommandKey {
  return code in COMMANDS_BY_KEY;
}
