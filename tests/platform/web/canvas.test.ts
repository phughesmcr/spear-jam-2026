import { DEFAULT_GAME_CANVAS_SIZE, GAME_HEIGHT, GAME_WIDTH } from "@/src/game/presentation/canvas_size.ts";
import { calculateGameCanvasDisplaySize } from "@/src/platform/web/canvas.ts";
import { assertEquals } from "@std/assert";

Deno.test("default game canvas is a 720x1280 portrait surface", () => {
  assertEquals(GAME_WIDTH, 720);
  assertEquals(GAME_HEIGHT, 1280);
  assertEquals(DEFAULT_GAME_CANVAS_SIZE, { width: 720, height: 1280 });
});

Deno.test("calculateGameCanvasDisplaySize letterboxes a 9:16 canvas inside a wide viewport", () => {
  const displaySize = calculateGameCanvasDisplaySize(1920, 1080, DEFAULT_GAME_CANVAS_SIZE);
  assertEquals(displaySize.width, 608);
  assertEquals(displaySize.height, 1080);
  assertEquals(displaySize.scale, 1080 / GAME_HEIGHT);
});

Deno.test("calculateGameCanvasDisplaySize pillarboxes a 9:16 canvas inside a tall viewport", () => {
  const displaySize = calculateGameCanvasDisplaySize(400, 900, DEFAULT_GAME_CANVAS_SIZE);
  assertEquals(displaySize.width, 400);
  assertEquals(displaySize.height, 711);
  assertEquals(displaySize.scale, 400 / GAME_WIDTH);
});
