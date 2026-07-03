import { assertEquals } from "@std/assert";
import type { GameCommand } from "@/src/game/commands.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import TouchGestures from "@/src/input/touch_gestures.ts";
import type { TouchGestureScheduler } from "@/src/input/touch_gestures.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";

const CANVAS_SIZE: GameCanvasSize = { width: 720, height: 1152 };

Deno.test("TouchGestures maps swipes to movement commands", () => {
  const harness = gestureHarness();

  harness.swipe({ x: 360, y: 576 }, { x: 360, y: 476 });
  harness.swipe({ x: 360, y: 576 }, { x: 360, y: 676 });
  harness.swipe({ x: 360, y: 576 }, { x: 260, y: 576 });
  harness.swipe({ x: 360, y: 576 }, { x: 460, y: 576 });

  assertEquals(harness.commands, [
    { type: "move", direction: "forward" },
    { type: "move", direction: "backward" },
    { type: "move", direction: "left" },
    { type: "move", direction: "right" },
  ]);
});

Deno.test("TouchGestures maps single taps to delayed turn and action commands", () => {
  const harness = gestureHarness();

  harness.tap({ x: 120, y: 576 });
  assertEquals(harness.commands, []);
  harness.scheduler.advance(220);
  assertEquals(harness.commands, [{ type: "turn", direction: "left" }]);

  harness.tap({ x: 600, y: 576 });
  harness.scheduler.advance(220);
  harness.tap({ x: 360, y: 576 });
  harness.scheduler.advance(220);

  assertEquals(harness.commands, [
    { type: "turn", direction: "left" },
    { type: "turn", direction: "right" },
    { type: "action" },
  ]);
});

Deno.test("TouchGestures maps a double tap to smart action without emitting the pending single tap", () => {
  const harness = gestureHarness();

  harness.tap({ x: 360, y: 576 });
  harness.scheduler.advance(100);
  harness.tap({ x: 370, y: 586 });
  harness.scheduler.advance(220);

  assertEquals(harness.commands, [{ type: "smartAction" }]);
});

Deno.test("TouchGestures ignores mouse pointers and disabled touch gestures", () => {
  const harness = gestureHarness(false);

  harness.tap({ x: 360, y: 576 });
  harness.scheduler.advance(220);
  harness.pointer({ phase: "down", x: 120, y: 576, pointerType: "mouse" });
  harness.pointer({ phase: "up", x: 120, y: 576, pointerType: "mouse" });
  harness.scheduler.advance(220);

  assertEquals(harness.commands, []);
});

type Point = {
  readonly x: number;
  readonly y: number;
};

type GestureHarness = {
  readonly commands: GameCommand[];
  readonly scheduler: FakeScheduler;
  pointer(input: Partial<CanvasPointerInput> & Point): void;
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
  const commands: GameCommand[] = [];
  const scheduler = new FakeScheduler();
  const gestures = new TouchGestures(
    () => CANVAS_SIZE,
    (command) => commands.push(command),
    scheduler,
    () => enabled,
  );

  return {
    commands,
    scheduler,
    pointer(input: Partial<CanvasPointerInput> & Point): void {
      gestures.handle({
        phase: input.phase ?? "down",
        x: input.x,
        y: input.y,
        pointerId: input.pointerId ?? 1,
        pointerType: input.pointerType ?? "touch",
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
