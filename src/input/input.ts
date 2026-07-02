import type { GameCommand } from "@/src/game/commands.ts";
import Keyboard from "@/src/input/keyboard.ts";
import Pointer from "@/src/input/pointer.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
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
  Period: { type: "action" },
  Escape: { type: "menu" },
  KeyP: { type: "pause" },
  Digit1: { type: "selectWeapon", slot: 1 },
  Digit2: { type: "selectWeapon", slot: 2 },
  Digit3: { type: "selectWeapon", slot: 3 },
} satisfies Readonly<Record<string, GameCommand>>;

const POINTER_PHASES = ["move", "down", "up", "cancel"] as const;

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

export function setupPointer(
  canvas: HTMLCanvasElement,
  canvasSize: () => GameCanvasSize,
  receiver: PointerInputReceiver,
): Disposable {
  const input = new Pointer(canvas, canvasSize);

  for (const phase of POINTER_PHASES) {
    input.addMapping(phase, receiver);
  }

  return input;
}

export function setupInput(
  window: Window,
  canvas: HTMLCanvasElement,
  canvasSize: () => GameCanvasSize,
  commandReceiver: GameCommandReceiver,
  pointerReceiver: PointerInputReceiver,
): Disposable {
  const keyboard = setupKeyboard(window, commandReceiver);
  const pointer = setupPointer(canvas, canvasSize, pointerReceiver);

  return {
    [Symbol.dispose]() {
      keyboard[Symbol.dispose]();
      pointer[Symbol.dispose]();
    },
  };
}
