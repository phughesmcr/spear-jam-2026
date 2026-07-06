import { GameCommand } from "@/src/game/commands.ts";
import { GameCommandReceiver } from "@/src/input/input.ts";

export const COMMANDS_BY_KEY = {
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
} satisfies Readonly<Record<string, GameCommand>>;

export type CommandKey = keyof typeof COMMANDS_BY_KEY;

const KEY_EVENTS = ["keydown", "keyup"] as const;

export function isCommandKey(code: string): code is CommandKey {
  return code in COMMANDS_BY_KEY;
}

export function setupKeyboard(host: Window, receiver: GameCommandReceiver): Disposable {
  const keyStates = new Map<string, boolean>();

  function clearKeyStates(): void {
    keyStates.clear();
  }

  function handleKeyboardEvent(event: KeyboardEvent): void {
    if (!isCommandKey(event.code)) return;

    const command = COMMANDS_BY_KEY[event.code];

    event.preventDefault();
    const keyState = event.type === "keydown";
    if (keyStates.get(event.code) === keyState) return;

    keyStates.set(event.code, keyState);
    if (keyState) receiver(command);
  }

  for (const eventName of KEY_EVENTS) host.addEventListener(eventName, handleKeyboardEvent);
  host.addEventListener("blur", clearKeyStates);
  host.document.addEventListener("visibilitychange", clearKeyStates);

  return {
    [Symbol.dispose]() {
      clearKeyStates();
      for (const eventName of KEY_EVENTS) host.removeEventListener(eventName, handleKeyboardEvent);
      host.removeEventListener("blur", clearKeyStates);
      host.document.removeEventListener("visibilitychange", clearKeyStates);
    },
  };
}
