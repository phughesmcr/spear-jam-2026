import type { GameCommand } from "@/src/game/commands.ts";
import Keyboard from "@/src/input/keyboard.ts";

const KEYMAP = {
  WAIT: "Space",
  FORWARD: "KeyW",
  BACK: "KeyS",
  STRAFE_LEFT: "KeyA",
  STRAFE_RIGHT: "KeyD",
  TURN_LEFT: "KeyQ",
  TURN_RIGHT: "KeyE",
  INTERACT: "Comma",
  ATTACK: "Period",
  MENU: "Escape",
  PAUSE: "KeyP",
  ITEM_1: "Digit1",
  ITEM_2: "Digit2",
  ITEM_3: "Digit3",
  WEAPON_1: "Digit4",
  WEAPON_2: "Digit5",
  WEAPON_3: "Digit6",
} as const;

type KeyCode = (typeof KEYMAP)[keyof typeof KEYMAP];

export type GameCommandReceiver = (command: GameCommand) => void;

const COMMANDS_BY_KEY: Readonly<Record<KeyCode, GameCommand>> = {
  [KEYMAP.WAIT]: { type: "wait" },
  [KEYMAP.FORWARD]: { type: "move", direction: "forward" },
  [KEYMAP.BACK]: { type: "move", direction: "backward" },
  [KEYMAP.STRAFE_LEFT]: { type: "move", direction: "left" },
  [KEYMAP.STRAFE_RIGHT]: { type: "move", direction: "right" },
  [KEYMAP.TURN_LEFT]: { type: "turn", direction: "left" },
  [KEYMAP.TURN_RIGHT]: { type: "turn", direction: "right" },
  [KEYMAP.INTERACT]: { type: "interact" },
  [KEYMAP.ATTACK]: { type: "attack" },
  [KEYMAP.MENU]: { type: "menu" },
  [KEYMAP.PAUSE]: { type: "pause" },
  [KEYMAP.ITEM_1]: { type: "selectItem", slot: 1 },
  [KEYMAP.ITEM_2]: { type: "selectItem", slot: 2 },
  [KEYMAP.ITEM_3]: { type: "selectItem", slot: 3 },
  [KEYMAP.WEAPON_1]: { type: "selectWeapon", slot: 1 },
  [KEYMAP.WEAPON_2]: { type: "selectWeapon", slot: 2 },
  [KEYMAP.WEAPON_3]: { type: "selectWeapon", slot: 3 },
};

export function setupKeyboard(window: Window, receiver: GameCommandReceiver): Disposable {
  const input = new Keyboard(window);

  for (const [keyCode, command] of Object.entries(COMMANDS_BY_KEY)) {
    input.addMapping(keyCode, (keyState) => {
      if (keyState) {
        receiver(command);
      }
    });
  }

  return input;
}
