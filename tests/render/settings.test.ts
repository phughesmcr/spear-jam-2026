import { DEFAULT_GAME_CANVAS_SIZE } from "@/src/render/canvas.ts";
import {
  settingsBackButtonHit,
  settingsBackButtonRect,
  settingsSliderAt,
  settingsSliderRects,
  settingsSliderVolume,
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

Deno.test("settingsSliderRects expose music and sound tracks", () => {
  const [music, sound] = settingsSliderRects(DEFAULT_GAME_CANVAS_SIZE);
  if (music === undefined || sound === undefined) throw new Error("expected settings sliders");
  assertEquals(music.id, "music");
  assertEquals(sound.id, "sound");
  assertEquals(music.x, sound.x);
  assertEquals(music.width, sound.width);
  assertEquals(sound.y > music.y, true);
});

Deno.test("settingsSliderAt and settingsSliderVolume map pointer position to a channel volume", () => {
  const [music] = settingsSliderRects(DEFAULT_GAME_CANVAS_SIZE);
  if (music === undefined) throw new Error("expected music slider");

  assertEquals(
    settingsSliderAt(DEFAULT_GAME_CANVAS_SIZE, {
      x: music.x + music.width / 2,
      y: music.y + music.height / 2,
    }),
    "music",
  );
  assertEquals(settingsSliderAt(DEFAULT_GAME_CANVAS_SIZE, { x: 0, y: 0 }), undefined);
  assertEquals(
    settingsSliderVolume(DEFAULT_GAME_CANVAS_SIZE, "music", {
      x: music.x + music.width * 0.75,
      y: music.y + music.height / 2,
    }),
    0.75,
  );
  assertEquals(
    settingsSliderVolume(DEFAULT_GAME_CANVAS_SIZE, "music", { x: music.x - 10, y: music.y }),
    0,
  );
  assertEquals(
    settingsSliderVolume(DEFAULT_GAME_CANVAS_SIZE, "music", {
      x: music.x + music.width + 10,
      y: music.y,
    }),
    1,
  );
});
