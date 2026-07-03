import { assertEquals } from "@std/assert";
import { GAME_RENDER_TOP_OFFSET, gameRenderRect, MESSAGE_LOG_BAND_HEIGHT, playCanvasSize } from "@/src/render/game.ts";

const FULL_CANVAS = { width: 720, height: 1152 };
const COMPACT_CANVAS = { width: 360, height: 576 };

Deno.test("playCanvasSize reserves the message log band", () => {
  assertEquals(MESSAGE_LOG_BAND_HEIGHT, 79);
  assertEquals(playCanvasSize(FULL_CANVAS), { width: 720, height: 1073 });
  assertEquals(playCanvasSize(COMPACT_CANVAS), { width: 360, height: 497 });
});

Deno.test("gameRenderRect leaves fixed top and bottom bands around the world renderer", () => {
  assertEquals(GAME_RENDER_TOP_OFFSET, 49);
  assertEquals(gameRenderRect(FULL_CANVAS), { x: 0, y: 49, width: 720, height: 1024 });
  assertEquals(gameRenderRect(COMPACT_CANVAS), { x: 0, y: 49, width: 360, height: 448 });
});
