import { assertEquals } from "@std/assert";
import { GAME_RENDER_TOP_OFFSET, gameRenderRect, playCanvasSize } from "@/src/render/game.ts";

const FULL_CANVAS = { width: 720, height: 1280 };

Deno.test("playCanvasSize leaves first-person on the full canvas", () => {
  assertEquals(playCanvasSize(FULL_CANVAS, "firstPerson"), FULL_CANVAS);
});

Deno.test("playCanvasSize leaves top-down on the full canvas", () => {
  assertEquals(playCanvasSize(FULL_CANVAS, "topDown"), FULL_CANVAS);
});

Deno.test("gameRenderRect gives the first-person renderer the whole play area", () => {
  assertEquals(GAME_RENDER_TOP_OFFSET, 0);
  assertEquals(gameRenderRect(FULL_CANVAS, "firstPerson"), { x: 0, y: 0, width: 720, height: 1280 });
});

Deno.test("gameRenderRect leaves top-down on the full canvas", () => {
  assertEquals(gameRenderRect(FULL_CANVAS, "topDown"), { x: 0, y: 0, width: 720, height: 1280 });
});
1280;
