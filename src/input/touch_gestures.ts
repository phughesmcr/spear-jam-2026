import type { GameCommand } from "@/src/game/commands.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";

const TAP_DELAY_MS = 220;
const TAP_MAX_MOVE_FRACTION = 0.05;
const DOUBLE_TAP_MAX_DISTANCE_FRACTION = 0.12;
const SWIPE_MIN_DISTANCE_FRACTION = 0.08;

export type TouchGestureReceiver = (command: GameCommand) => void;
export type TouchGestureEnabled = () => boolean;

export type TouchGestureScheduler = {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(timeoutId: number): void;
};

type PointerSample = {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly timeMs: number;
};

type PendingTap = PointerSample & {
  readonly command: GameCommand;
  readonly timeoutId: number;
};

export default class TouchGestures implements Disposable {
  private readonly canvasSize: () => GameCanvasSize;
  private readonly receiver: TouchGestureReceiver;
  private readonly scheduler: TouchGestureScheduler;
  private readonly enabled: TouchGestureEnabled;
  private activeStart?: PointerSample;
  private pendingTap?: PendingTap;

  constructor(
    canvasSize: () => GameCanvasSize,
    receiver: TouchGestureReceiver,
    scheduler: TouchGestureScheduler,
    enabled: TouchGestureEnabled = touchGesturesEnabled,
  ) {
    this.canvasSize = canvasSize;
    this.receiver = receiver;
    this.scheduler = scheduler;
    this.enabled = enabled;
  }

  handle(input: CanvasPointerInput): void {
    if (input.pointerType !== "touch") return;

    if (!this.enabled()) {
      this.clearPendingTap();
      this.activeStart = undefined;
      return;
    }

    switch (input.phase) {
      case "down":
        this.activeStart = this.sample(input);
        break;
      case "up":
        this.finishGesture(input);
        break;
      case "cancel":
        this.activeStart = undefined;
        break;
      case "move":
        break;
    }
  }

  [Symbol.dispose](): void {
    this.clearPendingTap();
    this.activeStart = undefined;
  }

  private finishGesture(input: CanvasPointerInput): void {
    const start = this.activeStart;
    this.activeStart = undefined;
    if (start === undefined || start.pointerId !== input.pointerId) return;

    const end = this.sample(input);
    const swipeCommand = swipeCommandFor(start, end, this.canvasSize());
    if (swipeCommand !== undefined) {
      this.flushPendingTap();
      this.receiver(swipeCommand);
      return;
    }

    if (!isTap(start, end, this.canvasSize())) return;
    this.handleTap(end);
  }

  private handleTap(tap: PointerSample): void {
    const pendingTap = this.pendingTap;
    if (pendingTap !== undefined && isDoubleTap(pendingTap, tap, this.canvasSize())) {
      this.clearPendingTap();
      this.receiver({ type: "smartAction" });
      return;
    }

    this.flushPendingTap();
    const command = tapCommandFor(tap, this.canvasSize());
    const timeoutId = this.scheduler.setTimeout(() => this.emitPendingTap(timeoutId), TAP_DELAY_MS);
    this.pendingTap = { ...tap, command, timeoutId };
  }

  private emitPendingTap(timeoutId: number): void {
    const pendingTap = this.pendingTap;
    if (pendingTap === undefined || pendingTap.timeoutId !== timeoutId) return;

    this.pendingTap = undefined;
    if (this.enabled()) {
      this.receiver(pendingTap.command);
    }
  }

  private flushPendingTap(): void {
    const pendingTap = this.pendingTap;
    if (pendingTap === undefined) return;

    this.clearPendingTap();
    if (this.enabled()) {
      this.receiver(pendingTap.command);
    }
  }

  private clearPendingTap(): void {
    const pendingTap = this.pendingTap;
    if (pendingTap === undefined) return;

    this.scheduler.clearTimeout(pendingTap.timeoutId);
    this.pendingTap = undefined;
  }

  private sample(input: CanvasPointerInput): PointerSample {
    return {
      pointerId: input.pointerId,
      x: input.x,
      y: input.y,
      timeMs: this.scheduler.now(),
    };
  }
}

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

function swipeCommandFor(
  start: PointerSample,
  end: PointerSample,
  canvasSize: GameCanvasSize,
): GameCommand | undefined {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance < Math.min(canvasSize.width, canvasSize.height) * SWIPE_MIN_DISTANCE_FRACTION) return undefined;

  if (Math.abs(dx) > Math.abs(dy)) {
    return { type: "move", direction: dx < 0 ? "left" : "right" };
  }

  return { type: "move", direction: dy < 0 ? "forward" : "backward" };
}

function isTap(start: PointerSample, end: PointerSample, canvasSize: GameCanvasSize): boolean {
  return distanceBetween(start, end) <= Math.min(canvasSize.width, canvasSize.height) * TAP_MAX_MOVE_FRACTION;
}

function isDoubleTap(first: PointerSample, second: PointerSample, canvasSize: GameCanvasSize): boolean {
  return second.timeMs - first.timeMs <= TAP_DELAY_MS &&
    distanceBetween(first, second) <= Math.min(canvasSize.width, canvasSize.height) * DOUBLE_TAP_MAX_DISTANCE_FRACTION;
}

function tapCommandFor(tap: PointerSample, canvasSize: GameCanvasSize): GameCommand {
  if (tap.x < canvasSize.width / 3) return { type: "turn", direction: "left" };
  if (tap.x > canvasSize.width * 2 / 3) return { type: "turn", direction: "right" };
  return { type: "action" };
}

function distanceBetween(a: PointerSample, b: PointerSample): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function touchGesturesEnabled(): boolean {
  return true;
}
