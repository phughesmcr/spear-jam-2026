import { DEFAULT_GAME_CANVAS_SIZE, GAME_HEIGHT, GAME_WIDTH } from "@/src/render/canvas.ts";
import { assertEquals } from "@std/assert";

Deno.test("default game canvas is a 720x1280 portrait surface", () => {
  assertEquals(GAME_WIDTH, 720);
  assertEquals(GAME_HEIGHT, 1280);
  assertEquals(DEFAULT_GAME_CANVAS_SIZE, { width: 720, height: 1280 });
});
