import type { KeyPress } from "@/src/engine/input/mod.ts";

const KEY_EVENTS = ["keydown", "keyup"] as const;

export type KeyAcceptance = (code: string) => boolean;
export type KeyPressReceiver = (input: KeyPress) => void;

export function setupKeyboard(
  host: Window,
  accepts: KeyAcceptance,
  receiver: KeyPressReceiver,
): Disposable {
  const keyStates = new Map<string, boolean>();

  function clearKeyStates(): void {
    keyStates.clear();
  }

  function handleKeyboardEvent(event: KeyboardEvent): void {
    if (!accepts(event.code)) return;

    event.preventDefault();
    const keyState = event.type === "keydown";
    if (keyStates.get(event.code) === keyState) return;

    keyStates.set(event.code, keyState);
    if (keyState) receiver({ code: event.code });
  }

  for (const eventName of KEY_EVENTS) host.addEventListener(eventName, handleKeyboardEvent);
  host.addEventListener("blur", clearKeyStates);
  host.document.addEventListener("visibilitychange", clearKeyStates);

  return {
    [Symbol.dispose](): void {
      clearKeyStates();
      for (const eventName of KEY_EVENTS) host.removeEventListener(eventName, handleKeyboardEvent);
      host.removeEventListener("blur", clearKeyStates);
      host.document.removeEventListener("visibilitychange", clearKeyStates);
    },
  };
}
