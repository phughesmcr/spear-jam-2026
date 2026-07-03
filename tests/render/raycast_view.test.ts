import { assertEquals } from "@std/assert";
import { internalFrameSize } from "@/src/render/raycast/view.ts";

Deno.test("internalFrameSize renders first-person views at three-quarter logical resolution", () => {
  assertEquals(internalFrameSize({ x: 0, y: 0, width: 720, height: 1280 }), {
    width: 540,
    cropHeight: 960,
    height: 972,
  });
});

Deno.test("internalFrameSize keeps tiny views drawable with an even crop height", () => {
  assertEquals(internalFrameSize({ x: 0, y: 0, width: 1, height: 1 }), {
    width: 2,
    cropHeight: 2,
    height: 14,
  });
});
