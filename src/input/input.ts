import type { GameCommand } from "@/src/game/commands.ts";
import { setupKeyboard } from "@/src/input/keyboard.ts";
import { type CanvasPointerInput, setupPointer } from "@/src/input/pointer.ts";
import TouchGestures, { type TouchGestureEnabled, windowTouchGestureScheduler } from "@/src/input/touch_gestures.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";

export type GameCommandReceiver = (command: GameCommand) => void;
export type PointerInputReceiver = (input: CanvasPointerInput) => void;

export function setupInput(
  host: Window,
  canvas: HTMLCanvasElement,
  canvasSize: () => GameCanvasSize,
  commandReceiver: GameCommandReceiver,
  pointerReceiver: PointerInputReceiver,
  touchGesturesEnabled?: TouchGestureEnabled,
): Disposable {
  const keyboard = setupKeyboard(host, commandReceiver);

  const touchGestures = new TouchGestures(
    canvasSize,
    commandReceiver,
    windowTouchGestureScheduler(host),
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
