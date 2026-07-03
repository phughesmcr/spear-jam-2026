import { assertEquals } from "@std/assert";
import { DEFAULT_GAME_CANVAS_SIZE, GAME_HEIGHT, GAME_WIDTH, selectGameCanvasSize } from "@/src/render/canvas.ts";

Deno.test("default game canvas is a 720x1280 portrait surface", () => {
  assertEquals(GAME_WIDTH, 720);
  assertEquals(GAME_HEIGHT, 1280);
  assertEquals(DEFAULT_GAME_CANVAS_SIZE, { width: 720, height: 1280 });
});

Deno.test("game canvas keeps full logical resolution on small viewports", () => {
  assertEquals(selectGameCanvasSize(719, 1280), { width: 720, height: 1280 });
  assertEquals(selectGameCanvasSize(720, 1279), { width: 720, height: 1280 });
  assertEquals(selectGameCanvasSize(720, 1280), { width: 720, height: 1280 });
});
