import { TrackId } from "@/src/game/content/audio/music.ts";
import { createGameModel, transition } from "@/tests/game/model/transition/helpers.ts";
import { assertEquals } from "@std/assert";

Deno.test("transition starts with render and map loading effects", () => {
  const result = transition(createGameModel("Level 1"), { type: "start" });

  assertEquals(result.model.mode, { type: "loading", completed: 0, total: 0 });
  assertEquals(result.effects, [
    { type: "applyAudioVolumes" },
    { type: "render" },
    { type: "loadMap", mapName: "Level 1" },
  ]);
});

Deno.test("transition can start on the title screen before beginning the game", () => {
  let result = transition(createGameModel("Level 1", { showTitle: true, showIntro: true }), {
    type: "start",
    nowMs: 1000,
  });

  assertEquals(result.model.mode, { type: "title", intent: "start" });
  assertEquals(result.effects, [
    { type: "ensureInput" },
    { type: "applyAudioVolumes" },
    { type: "playMusic", trackId: TrackId.Title },
    { type: "render" },
    { type: "scheduleMapAssets", mapName: "Level 1" },
  ]);

  result = transition(result.model, { type: "gameCommand", command: { type: "wait" }, nowMs: 1000 });
  const mode = result.model.mode;
  if (mode.type !== "intermission") throw new Error(`Expected intermission mode, got ${mode.type}.`);
  assertEquals(mode.completion, { type: "loadMap", mapName: "Level 1" });
  assertEquals(result.effects, [
    { type: "ensureInput" },
    { type: "applyAudioVolumes" },
    { type: "playMusic", trackId: TrackId.Intro },
    { type: "render" },
    { type: "scheduleMapAssets", mapName: "Level 1" },
  ]);
});

Deno.test("title start without intro loads the start map", () => {
  const titled = transition(createGameModel("Level 1", { showTitle: true }), { type: "start" }).model;
  const result = transition(titled, { type: "gameCommand", command: { type: "wait" } });

  assertEquals(result.model.mode, { type: "loading", completed: 0, total: 0 });
  assertEquals(result.effects, [
    { type: "applyAudioVolumes" },
    { type: "render" },
    { type: "loadMap", mapName: "Level 1" },
  ]);
});

Deno.test("transition can start with an intro intermission before loading the first map", () => {
  let result = transition(createGameModel("Level 1", { showIntro: true }), { type: "start", nowMs: 1000 });
  let mode = result.model.mode;

  if (mode.type !== "intermission") throw new Error(`Expected intermission mode, got ${mode.type}.`);
  assertEquals(mode.title, "SIGNAL ACQUIRED");
  assertEquals(mode.pages.length, 5);
  assertEquals(mode.pages[0]?.startsWith("The year is 2060."), true);
  assertEquals(mode.pages.at(-1)?.endsWith("Survive the reboot."), true);
  assertEquals(mode.pageIndex, 0);
  assertEquals(mode.prompt, "Space to enter the network");
  assertEquals(mode.background, "system");
  assertEquals(mode.completion, { type: "loadMap", mapName: "Level 1" });
  assertEquals(mode.revealStartedAtMs, 1000);
  assertEquals(mode.revealed, false);
  assertEquals(result.effects, [
    { type: "ensureInput" },
    { type: "applyAudioVolumes" },
    { type: "playMusic", trackId: TrackId.Intro },
    { type: "render" },
    { type: "scheduleMapAssets", mapName: "Level 1" },
  ]);

  result = transition(result.model, { type: "gameCommand", command: { type: "wait" }, nowMs: 1000 });
  mode = result.model.mode;
  if (mode.type !== "intermission") throw new Error(`Expected intermission mode, got ${mode.type}.`);
  assertEquals(mode.revealed, true);
  assertEquals(mode.pageIndex, 0);
  assertEquals(result.effects, [{ type: "render" }]);

  result = transition(result.model, { type: "gameCommand", command: { type: "wait" }, nowMs: 1000 });
  mode = result.model.mode;
  if (mode.type !== "intermission") throw new Error(`Expected intermission mode, got ${mode.type}.`);
  assertEquals(mode.pageIndex, 1);
  assertEquals(mode.revealed, false);
  assertEquals(mode.revealStartedAtMs, 1000);
  assertEquals(result.effects, [{ type: "render" }]);

  mode = { ...mode, pageIndex: mode.pages.length - 1, revealed: true };
  result = transition({ ...result.model, mode }, { type: "gameCommand", command: { type: "wait" }, nowMs: 1000 });
  assertEquals(result.model.mode, { type: "loading", completed: 0, total: 0 });
  assertEquals(result.effects, [
    { type: "render" },
    { type: "loadMap", mapName: "Level 1" },
  ]);
});

Deno.test("transition moves loaded maps into playing mode and requests input setup", () => {
  const result = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 2",
  });

  assertEquals(result.model.currentMapName, "Level 2");
  assertEquals(Object.hasOwn(result.model, "currentLevelEntryState"), false);
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "ensureInput" }, { type: "render" }]);
});

Deno.test("transition toggles the playing view mode with a render", () => {
  const model = createGameModel("Level 1");
  assertEquals(model.viewMode, "firstPerson");

  const toggled = transition(model, { type: "gameCommand", command: { type: "toggleView" } });
  assertEquals(toggled.model.viewMode, "topDown");
  assertEquals(toggled.effects, [{ type: "resetFirstPerson" }, { type: "render" }]);

  const restored = transition(toggled.model, { type: "gameCommand", command: { type: "toggleView" } });
  assertEquals(restored.model.viewMode, "firstPerson");
  assertEquals(restored.effects, [{ type: "resetFirstPerson" }, { type: "render" }]);
});

Deno.test("transition keeps the view mode across map loads", () => {
  const toggled = transition(createGameModel("Level 1"), {
    type: "gameCommand",
    command: { type: "toggleView" },
  });
  const loaded = transition(toggled.model, { type: "mapLoaded", mapName: "Level 2" });

  assertEquals(loaded.model.viewMode, "topDown");
});
