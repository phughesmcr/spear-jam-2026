import { internalFrameSize } from "@/src/engine/raycast/view.ts";
import { assertEquals } from "@std/assert";

Deno.test("internalFrameSize renders first-person views at half logical resolution", () => {
  assertEquals(internalFrameSize({ x: 0, y: 0, width: 720, height: 1280 }), {
    width: 360,
    cropHeight: 640,
    height: 652,
  });
});

Deno.test("internalFrameSize keeps tiny views drawable with an even crop height", () => {
  assertEquals(internalFrameSize({ x: 0, y: 0, width: 1, height: 1 }), {
    width: 2,
    cropHeight: 2,
    height: 14,
  });
});
