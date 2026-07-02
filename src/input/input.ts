import type { GameCommand } from "@/src/game/commands.ts";
import Keyboard from "@/src/input/keyboard.ts";

export type GameCommandReceiver = (command: GameCommand) => void;

const COMMANDS_BY_KEY = {
  Space: { type: "wait" },
  KeyW: { type: "move", direction: "forward" },
  KeyS: { type: "move", direction: "backward" },
  KeyA: { type: "move", direction: "left" },
  KeyD: { type: "move", direction: "right" },
  KeyQ: { type: "turn", direction: "left" },
  KeyE: { type: "turn", direction: "right" },
  Period: { type: "action" },
  Escape: { type: "menu" },
  KeyP: { type: "pause" },
  Digit1: { type: "selectWeapon", slot: 1 },
  Digit2: { type: "selectWeapon", slot: 2 },
  Digit3: { type: "selectWeapon", slot: 3 },
} satisfies Readonly<Record<string, GameCommand>>;

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
