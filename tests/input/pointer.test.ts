import { assertEquals } from "@std/assert";
import { canvasPointerPosition, pointerInteraction } from "@/src/input/pointer.ts";

Deno.test("canvasPointerPosition converts browser coordinates into logical canvas coordinates", () => {
  assertEquals(
    canvasPointerPosition(
      { clientX: 190, clientY: 308 },
      { left: 10, top: 20, width: 360, height: 576 },
      { width: 720, height: 1280 },
    ),
    { x: 360, y: 640 },
  );
});

Deno.test("canvasPointerPosition handles collapsed element bounds", () => {
  assertEquals(
    canvasPointerPosition(
      { clientX: 20, clientY: 20 },
      { left: 10, top: 10, width: 0, height: 0 },
      { width: 720, height: 1280 },
    ),
    { x: 0, y: 0 },
  );
});

Deno.test("pointerInteraction treats coarse non-hover input as tapping even for mouse-compatible events", () => {
  assertEquals(pointerInteraction("mouse", true), "tap");
  assertEquals(pointerInteraction("mouse", false), "cursor");
  assertEquals(pointerInteraction("touch", false), "tap");
  assertEquals(pointerInteraction("pen", false), "tap");
});
