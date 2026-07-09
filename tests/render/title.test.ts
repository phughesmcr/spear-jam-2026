import { DEFAULT_GAME_CANVAS_SIZE } from "@/src/render/canvas.ts";
import { titleStartButtonHit, titleStartButtonRect } from "@/src/render/title.ts";
import { assertEquals } from "@std/assert";

Deno.test("titleStartButtonRect is centered on the canvas", () => {
  const rect = titleStartButtonRect(DEFAULT_GAME_CANVAS_SIZE);
  assertEquals(rect.x + rect.width / 2, DEFAULT_GAME_CANVAS_SIZE.width / 2);
  assertEquals(rect.width > 0, true);
  assertEquals(rect.height > 0, true);
});

Deno.test("titleStartButtonHit only accepts points inside the start button", () => {
  const rect = titleStartButtonRect(DEFAULT_GAME_CANVAS_SIZE);
  assertEquals(
    titleStartButtonHit(DEFAULT_GAME_CANVAS_SIZE, {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    }),
    true,
  );
  assertEquals(titleStartButtonHit(DEFAULT_GAME_CANVAS_SIZE, { x: 0, y: 0 }), false);
});
