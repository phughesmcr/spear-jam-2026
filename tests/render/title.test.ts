import { DEFAULT_GAME_CANVAS_SIZE } from "@/src/render/canvas.ts";
import {
  titleHelpButtonRect,
  titleHoverButtonAt,
  titleSettingsButtonRect,
  titleStartButtonHit,
  titleStartButtonRect,
} from "@/src/render/title.ts";
import { assertEquals } from "@std/assert";

Deno.test("titleStartButtonRect is centered on the canvas", () => {
  const rect = titleStartButtonRect(DEFAULT_GAME_CANVAS_SIZE);
  assertEquals(rect.x + rect.width / 2, DEFAULT_GAME_CANVAS_SIZE.width / 2);
  assertEquals(rect.width > 0, true);
  assertEquals(rect.height > 0, true);
});

Deno.test("titleSettingsButtonRect sits above the start button", () => {
  const start = titleStartButtonRect(DEFAULT_GAME_CANVAS_SIZE);
  const settings = titleSettingsButtonRect(DEFAULT_GAME_CANVAS_SIZE);
  assertEquals(settings.x, start.x);
  assertEquals(settings.width, start.width);
  assertEquals(settings.height, start.height);
  assertEquals(settings.y < start.y, true);
});

Deno.test("titleHelpButtonRect sits above the settings button", () => {
  const settings = titleSettingsButtonRect(DEFAULT_GAME_CANVAS_SIZE);
  const help = titleHelpButtonRect(DEFAULT_GAME_CANVAS_SIZE);
  assertEquals(help.x, settings.x);
  assertEquals(help.width, settings.width);
  assertEquals(help.height, settings.height);
  assertEquals(help.y < settings.y, true);
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

Deno.test("titleHoverButtonAt maps pointer points to menu buttons", () => {
  const start = titleStartButtonRect(DEFAULT_GAME_CANVAS_SIZE);
  const settings = titleSettingsButtonRect(DEFAULT_GAME_CANVAS_SIZE);
  const help = titleHelpButtonRect(DEFAULT_GAME_CANVAS_SIZE);
  assertEquals(
    titleHoverButtonAt(DEFAULT_GAME_CANVAS_SIZE, {
      x: start.x + start.width / 2,
      y: start.y + start.height / 2,
    }),
    "start",
  );
  assertEquals(
    titleHoverButtonAt(DEFAULT_GAME_CANVAS_SIZE, {
      x: settings.x + settings.width / 2,
      y: settings.y + settings.height / 2,
    }),
    "settings",
  );
  assertEquals(
    titleHoverButtonAt(DEFAULT_GAME_CANVAS_SIZE, {
      x: help.x + help.width / 2,
      y: help.y + help.height / 2,
    }),
    "help",
  );
  assertEquals(titleHoverButtonAt(DEFAULT_GAME_CANVAS_SIZE, { x: 0, y: 0 }), undefined);
});
