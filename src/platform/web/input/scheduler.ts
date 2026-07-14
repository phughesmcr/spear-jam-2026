import type { TouchGestureScheduler } from "@/src/engine/input/touch_gestures.ts";

export function windowTouchGestureScheduler(host: Window): TouchGestureScheduler {
  return {
    now() {
      return host.performance.now();
    },
    setTimeout(callback: () => void, delayMs: number) {
      return host.setTimeout(callback, delayMs);
    },
    clearTimeout(timeoutId: number) {
      host.clearTimeout(timeoutId);
    },
  };
}
