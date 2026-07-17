import {
  type InputSize,
  type PointerInput,
  type TouchGestureEnabled,
  TouchGestures,
} from "turn-based-web-engine/input";
import type { GameCommand } from "@/src/game/model/commands.ts";
import { commandForKeyPress, commandForTouchGesture } from "@/src/game/presentation/input.ts";
import { setupKeyboard } from "turn-based-web-engine/input";
import { setupPointer } from "turn-based-web-engine/input";
import { windowTouchGestureScheduler } from "turn-based-web-engine/input";

export type GameCommandReceiver = (command: GameCommand) => void;
export type PointerInputReceiver = (input: PointerInput) => void;

export function setupInput(
  host: Window,
  canvas: HTMLCanvasElement,
  inputSize: () => InputSize,
  commandReceiver: GameCommandReceiver,
  pointerReceiver: PointerInputReceiver,
  touchGesturesEnabled?: TouchGestureEnabled,
): Disposable {
  const keyboard = setupKeyboard(
    host,
    (code) => commandForKeyPress(code) !== undefined,
    (input) => {
      const command = commandForKeyPress(input.code);
      if (command !== undefined) commandReceiver(command);
    },
  );

  const touchGestures = new TouchGestures(
    inputSize,
    (gesture) => commandReceiver(commandForTouchGesture(gesture, inputSize())),
    windowTouchGestureScheduler(host),
    touchGesturesEnabled,
  );

  const pointer = setupPointer(canvas, inputSize, (input) => {
    pointerReceiver(input);
    touchGestures.handle(input);
  });

  return {
    [Symbol.dispose](): void {
      keyboard[Symbol.dispose]();
      touchGestures[Symbol.dispose]();
      pointer[Symbol.dispose]();
    },
  };
}
