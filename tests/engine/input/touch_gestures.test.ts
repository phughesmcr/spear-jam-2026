import { assertEquals } from "@std/assert";
import {
  type InputSize,
  type PointerInput,
  type TouchGesture,
  TouchGestures,
  type TouchGestureScheduler,
} from "@/src/engine/input/mod.ts";

const CANVAS_SIZE: InputSize = { width: 720, height: 1280 };

Deno.test("TouchGestures recognizes directional swipes", () => {
  const harness = gestureHarness();

  harness.swipe({ x: 360, y: 640 }, { x: 360, y: 540 });
  harness.swipe({ x: 360, y: 640 }, { x: 360, y: 740 });
  harness.swipe({ x: 360, y: 640 }, { x: 260, y: 640 });
  harness.swipe({ x: 360, y: 640 }, { x: 460, y: 640 });

  assertEquals(harness.gestures, [
    { type: "swipe", direction: "up" },
    { type: "swipe", direction: "down" },
    { type: "swipe", direction: "left" },
    { type: "swipe", direction: "right" },
  ]);
});

Deno.test("TouchGestures delays single taps", () => {
  const harness = gestureHarness();

  harness.tap({ x: 120, y: 640 });
  assertEquals(harness.gestures, []);
  harness.scheduler.advance(220);
  assertEquals(harness.gestures, [{ type: "tap", x: 120, y: 640 }]);

  harness.tap({ x: 600, y: 640 });
  harness.scheduler.advance(220);
  harness.tap({ x: 360, y: 640 });
  harness.scheduler.advance(220);

  assertEquals(harness.gestures, [
    { type: "tap", x: 120, y: 640 },
    { type: "tap", x: 600, y: 640 },
    { type: "tap", x: 360, y: 640 },
  ]);
});

Deno.test("TouchGestures recognizes a double tap without emitting the pending single tap", () => {
  const harness = gestureHarness();

  harness.tap({ x: 360, y: 640 });
  harness.scheduler.advance(100);
  harness.tap({ x: 370, y: 586 });
  harness.scheduler.advance(220);

  assertEquals(harness.gestures, [{ type: "doubleTap", x: 370, y: 586 }]);
});

Deno.test("TouchGestures ignores mouse pointers and disabled touch gestures", () => {
  const harness = gestureHarness(false);

  harness.tap({ x: 360, y: 640 });
  harness.scheduler.advance(220);
  harness.pointer({ phase: "down", x: 120, y: 640, pointerType: "mouse" });
  harness.pointer({ phase: "up", x: 120, y: 640, pointerType: "mouse" });
  harness.scheduler.advance(220);

  assertEquals(harness.gestures, []);
});

type Point = {
  readonly x: number;
  readonly y: number;
};

type GestureHarness = {
  readonly gestures: TouchGesture[];
  readonly scheduler: FakeScheduler;
  pointer(input: Partial<PointerInput> & Point): void;
  tap(point: Point): void;
  swipe(start: Point, end: Point): void;
};

class FakeScheduler implements TouchGestureScheduler {
  private nowMs = 0;
  private nextId = 1;
  private timeouts: TimeoutEntry[] = [];

  now(): number {
    return this.nowMs;
  }

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextId;
    this.nextId++;
    this.timeouts.push({ id, dueMs: this.nowMs + delayMs, callback });
    return id;
  }

  clearTimeout(timeoutId: number): void {
    this.timeouts = this.timeouts.filter((timeout) => timeout.id !== timeoutId);
  }

  advance(ms: number): void {
    this.nowMs += ms;
    this.runDueTimeouts();
  }

  private runDueTimeouts(): void {
    while (true) {
      const timeout = this.nextDueTimeout();
      if (timeout === undefined || timeout.dueMs > this.nowMs) return;

      this.timeouts = this.timeouts.filter((entry) => entry.id !== timeout.id);
      timeout.callback();
    }
  }

  private nextDueTimeout(): TimeoutEntry | undefined {
    return this.timeouts.toSorted((a, b) => a.dueMs - b.dueMs)[0];
  }
}

type TimeoutEntry = {
  readonly id: number;
  readonly dueMs: number;
  readonly callback: () => void;
};

function gestureHarness(enabled = true): GestureHarness {
  const recognized: TouchGesture[] = [];
  const scheduler = new FakeScheduler();
  const gestures = new TouchGestures(
    () => CANVAS_SIZE,
    (gesture) => recognized.push(gesture),
    scheduler,
    () => enabled,
  );

  return {
    gestures: recognized,
    scheduler,
    pointer(input: Partial<PointerInput> & Point): void {
      gestures.handle({
        phase: input.phase ?? "down",
        x: input.x,
        y: input.y,
        pointerId: input.pointerId ?? 1,
        pointerType: input.pointerType ?? "touch",
        interaction: "tap",
        button: input.button ?? 0,
      });
    },
    tap(point: Point): void {
      this.pointer({ ...point, phase: "down" });
      this.pointer({ ...point, phase: "up" });
    },
    swipe(start: Point, end: Point): void {
      this.pointer({ ...start, phase: "down" });
      this.pointer({ ...end, phase: "up" });
    },
  };
}
