import type { GameCommand } from "@/src/game/commands.ts";
import { type CanvasPointerInput, setupPointer } from "@/src/input/pointer.ts";
import TouchGestures, { type TouchGestureEnabled, windowTouchGestureScheduler } from "@/src/input/touch_gestures.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";

export type GameCommandReceiver = (command: GameCommand) => void;
export type PointerInputReceiver = (input: CanvasPointerInput) => void;

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
} satisfies Readonly<Record<string, GameCommand>>;
type CommandKey = keyof typeof COMMANDS_BY_KEY;

const KEY_EVENTS = ["keydown", "keyup"] as const;

export function setupKeyboard(window: Window, receiver: GameCommandReceiver): Disposable {
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

  for (const eventName of KEY_EVENTS) window.addEventListener(eventName, handleKeyboardEvent);
  window.addEventListener("blur", clearKeyStates);
  window.document.addEventListener("visibilitychange", clearKeyStates);

  return {
    [Symbol.dispose]() {
      for (const eventName of KEY_EVENTS) window.removeEventListener(eventName, handleKeyboardEvent);
      window.removeEventListener("blur", clearKeyStates);
      window.document.removeEventListener("visibilitychange", clearKeyStates);
      keyStates.clear();
    },
  };
}

function isCommandKey(code: string): code is CommandKey {
  return code in COMMANDS_BY_KEY;
}

export function setupInput(
  window: Window,
  canvas: HTMLCanvasElement,
  canvasSize: () => GameCanvasSize,
  commandReceiver: GameCommandReceiver,
  pointerReceiver: PointerInputReceiver,
  touchGesturesEnabled?: TouchGestureEnabled,
): Disposable {
  const keyboard = setupKeyboard(window, commandReceiver);
  const touchGestures = new TouchGestures(
    canvasSize,
    commandReceiver,
    windowTouchGestureScheduler(window),
    touchGesturesEnabled,
  );
  const pointer = setupPointer(canvas, canvasSize, (input) => {
    pointerReceiver(input);
    touchGestures.handle(input);
  });

  return {
    [Symbol.dispose]() {
      keyboard[Symbol.dispose]();
      touchGestures[Symbol.dispose]();
      pointer[Symbol.dispose]();
    },
  };
}
