import { DEFAULT_GAME_CANVAS_SIZE } from "@/src/render/canvas.ts";
import { settingsBackButtonHit, settingsBackButtonRect } from "@/src/render/settings.ts";
import { assertEquals } from "@std/assert";

Deno.test("settingsBackButtonRect is centered on the canvas", () => {
  const rect = settingsBackButtonRect(DEFAULT_GAME_CANVAS_SIZE);
  assertEquals(rect.x + rect.width / 2, DEFAULT_GAME_CANVAS_SIZE.width / 2);
  assertEquals(rect.width > 0, true);
  assertEquals(rect.height > 0, true);
});

Deno.test("settingsBackButtonHit only accepts points inside the back button", () => {
  const rect = settingsBackButtonRect(DEFAULT_GAME_CANVAS_SIZE);
  assertEquals(
    settingsBackButtonHit(DEFAULT_GAME_CANVAS_SIZE, {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    }),
    true,
  );
  assertEquals(settingsBackButtonHit(DEFAULT_GAME_CANVAS_SIZE, { x: 0, y: 0 }), false);
});
