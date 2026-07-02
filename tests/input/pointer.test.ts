import { assertEquals } from "@std/assert";
import { canvasPointerPosition } from "@/src/input/pointer.ts";

Deno.test("canvasPointerPosition converts browser coordinates into logical canvas coordinates", () => {
  assertEquals(
    canvasPointerPosition(
      { clientX: 190, clientY: 380 },
      { left: 10, top: 20, width: 360, height: 720 },
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
