import { DEFAULT_GAME_CANVAS_SIZE } from "@/src/render/canvas.ts";
import {
  settingsBackButtonHit,
  settingsBackButtonRect,
  settingsSliderAt,
  settingsSliderRects,
  settingsSliderUnit,
} from "@/src/render/settings.ts";
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

Deno.test("settingsSliderRects expose music, sound, and fps tracks", () => {
  const [music, sound, fps] = settingsSliderRects(DEFAULT_GAME_CANVAS_SIZE);
  if (music === undefined || sound === undefined || fps === undefined) {
    throw new Error("expected settings sliders");
  }
  assertEquals(music.id, "music");
  assertEquals(sound.id, "sound");
  assertEquals(fps.id, "fps");
  assertEquals(music.x, sound.x);
  assertEquals(music.width, sound.width);
  assertEquals(sound.y > music.y, true);
  assertEquals(fps.y > sound.y, true);
});

Deno.test("settingsSliderAt and settingsSliderUnit map pointer position to a slider unit", () => {
  const [music, , fps] = settingsSliderRects(DEFAULT_GAME_CANVAS_SIZE);
  if (music === undefined || fps === undefined) throw new Error("expected settings sliders");

  assertEquals(
    settingsSliderAt(DEFAULT_GAME_CANVAS_SIZE, {
      x: music.x + music.width / 2,
      y: music.y + music.height / 2,
    }),
    "music",
  );
  assertEquals(
    settingsSliderAt(DEFAULT_GAME_CANVAS_SIZE, {
      x: fps.x + fps.width / 2,
      y: fps.y + fps.height / 2,
    }),
    "fps",
  );
  assertEquals(settingsSliderAt(DEFAULT_GAME_CANVAS_SIZE, { x: 0, y: 0 }), undefined);
  assertEquals(
    settingsSliderUnit(DEFAULT_GAME_CANVAS_SIZE, "music", {
      x: music.x + music.width * 0.75,
      y: music.y + music.height / 2,
    }),
    0.75,
  );
  assertEquals(
    settingsSliderUnit(DEFAULT_GAME_CANVAS_SIZE, "music", { x: music.x - 10, y: music.y }),
    0,
  );
  assertEquals(
    settingsSliderUnit(DEFAULT_GAME_CANVAS_SIZE, "music", {
      x: music.x + music.width + 10,
      y: music.y,
    }),
    1,
  );
});
