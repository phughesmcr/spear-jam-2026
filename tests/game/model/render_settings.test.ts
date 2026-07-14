import {
  AMBIENT_FPS,
  clampInteractiveFps,
  DEFAULT_INTERACTIVE_FPS,
  frameMsForFps,
  interactiveFpsFromUnit,
  MAX_INTERACTIVE_FPS,
  MIN_INTERACTIVE_FPS,
  unitFromInteractiveFps,
} from "@/src/game/model/render_settings.ts";
import { assertEquals } from "@std/assert";

Deno.test("clampInteractiveFps clamps and rounds to the supported range", () => {
  assertEquals(clampInteractiveFps(DEFAULT_INTERACTIVE_FPS), 35);
  assertEquals(clampInteractiveFps(11), MIN_INTERACTIVE_FPS);
  assertEquals(clampInteractiveFps(90), MAX_INTERACTIVE_FPS);
  assertEquals(clampInteractiveFps(35.4), 35);
  assertEquals(clampInteractiveFps(Number.NaN), DEFAULT_INTERACTIVE_FPS);
});

Deno.test("interactiveFpsFromUnit and unitFromInteractiveFps round-trip the slider range", () => {
  assertEquals(interactiveFpsFromUnit(0), MIN_INTERACTIVE_FPS);
  assertEquals(interactiveFpsFromUnit(1), MAX_INTERACTIVE_FPS);
  assertEquals(interactiveFpsFromUnit(unitFromInteractiveFps(DEFAULT_INTERACTIVE_FPS)), DEFAULT_INTERACTIVE_FPS);
  assertEquals(unitFromInteractiveFps(MIN_INTERACTIVE_FPS), 0);
  assertEquals(unitFromInteractiveFps(MAX_INTERACTIVE_FPS), 1);
});

Deno.test("frameMsForFps matches the runtime budget constants", () => {
  assertEquals(frameMsForFps(DEFAULT_INTERACTIVE_FPS), 1000 / 35);
  assertEquals(frameMsForFps(AMBIENT_FPS), 1000 / 12);
});
