import type { InputSize, PointerInput, TouchGesture } from "@/src/engine/input/mod.ts";

const TAP_DELAY_MS = 220;
const TAP_MAX_MOVE_FRACTION = 0.05;
const DOUBLE_TAP_MAX_DISTANCE_FRACTION = 0.12;
const SWIPE_MIN_DISTANCE_FRACTION = 0.08;

export type TouchGestureReceiver = (gesture: TouchGesture) => void;
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
  readonly timeoutId: number;
};

export class TouchGestures implements Disposable {
  private readonly inputSize: () => InputSize;
  private readonly receiver: TouchGestureReceiver;
  private readonly scheduler: TouchGestureScheduler;
  private readonly enabled: TouchGestureEnabled;
  private activeStart?: PointerSample;
  private pendingTap?: PendingTap;

  constructor(
    inputSize: () => InputSize,
    receiver: TouchGestureReceiver,
    scheduler: TouchGestureScheduler,
    enabled: TouchGestureEnabled = touchGesturesEnabled,
  ) {
    this.inputSize = inputSize;
    this.receiver = receiver;
    this.scheduler = scheduler;
    this.enabled = enabled;
  }

  handle(input: PointerInput): void {
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

  private finishGesture(input: PointerInput): void {
    const start = this.activeStart;
    this.activeStart = undefined;
    if (start === undefined || start.pointerId !== input.pointerId) return;

    const end = this.sample(input);
    const swipe = swipeGestureFor(start, end, this.inputSize());
    if (swipe !== undefined) {
      this.flushPendingTap();
      this.receiver(swipe);
      return;
    }

    if (!isTap(start, end, this.inputSize())) return;
    this.handleTap(end);
  }

  private handleTap(tap: PointerSample): void {
    const pendingTap = this.pendingTap;
    if (pendingTap !== undefined && isDoubleTap(pendingTap, tap, this.inputSize())) {
      this.clearPendingTap();
      this.receiver({ type: "doubleTap", x: tap.x, y: tap.y });
      return;
    }

    this.flushPendingTap();
    const timeoutId = this.scheduler.setTimeout(() => this.emitPendingTap(timeoutId), TAP_DELAY_MS);
    this.pendingTap = { ...tap, timeoutId };
  }

  private emitPendingTap(timeoutId: number): void {
    const pendingTap = this.pendingTap;
    if (pendingTap === undefined || pendingTap.timeoutId !== timeoutId) return;

    this.pendingTap = undefined;
    if (this.enabled()) this.receiver(tapGesture(pendingTap));
  }

  private flushPendingTap(): void {
    const pendingTap = this.pendingTap;
    if (pendingTap === undefined) return;

    this.clearPendingTap();
    if (this.enabled()) this.receiver(tapGesture(pendingTap));
  }

  private clearPendingTap(): void {
    const pendingTap = this.pendingTap;
    if (pendingTap === undefined) return;

    this.scheduler.clearTimeout(pendingTap.timeoutId);
    this.pendingTap = undefined;
  }

  private sample(input: PointerInput): PointerSample {
    return {
      pointerId: input.pointerId,
      x: input.x,
      y: input.y,
      timeMs: this.scheduler.now(),
    };
  }
}

function swipeGestureFor(
  start: PointerSample,
  end: PointerSample,
  inputSize: InputSize,
): TouchGesture | undefined {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance < Math.min(inputSize.width, inputSize.height) * SWIPE_MIN_DISTANCE_FRACTION) return undefined;

  if (Math.abs(dx) > Math.abs(dy)) {
    return { type: "swipe", direction: dx < 0 ? "left" : "right" };
  }

  return { type: "swipe", direction: dy < 0 ? "up" : "down" };
}

function isTap(start: PointerSample, end: PointerSample, inputSize: InputSize): boolean {
  return distanceBetween(start, end) <= Math.min(inputSize.width, inputSize.height) * TAP_MAX_MOVE_FRACTION;
}

function isDoubleTap(first: PointerSample, second: PointerSample, inputSize: InputSize): boolean {
  return second.timeMs - first.timeMs <= TAP_DELAY_MS &&
    distanceBetween(first, second) <= Math.min(inputSize.width, inputSize.height) * DOUBLE_TAP_MAX_DISTANCE_FRACTION;
}

function tapGesture(tap: PointerSample): TouchGesture {
  return { type: "tap", x: tap.x, y: tap.y };
}

function distanceBetween(a: PointerSample, b: PointerSample): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function touchGesturesEnabled(): boolean {
  return true;
}
