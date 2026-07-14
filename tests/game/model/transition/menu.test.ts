import { createGameModel, transition } from "@/src/game/model/transition/mod.ts";
import { assertEquals } from "@std/assert";

Deno.test("escape opens the title menu while playing and resume closes it", () => {
  const playing = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  const opened = transition(playing, { type: "gameCommand", command: { type: "menu" } });
  assertEquals(opened.model.mode, { type: "title", intent: "resume" });
  assertEquals(opened.effects, [{ type: "render" }]);

  const resumed = transition(opened.model, { type: "gameCommand", command: { type: "wait" } });
  assertEquals(resumed.model.mode, { type: "playing" });
  assertEquals(resumed.effects, [{ type: "render" }]);

  const reopened = transition(playing, { type: "gameCommand", command: { type: "menu" } }).model;
  const escaped = transition(reopened, { type: "gameCommand", command: { type: "menu" } });
  assertEquals(escaped.model.mode, { type: "playing" });
  assertEquals(escaped.effects, [{ type: "render" }]);
});

Deno.test("title settings opens settings and back restores the same title intent", () => {
  const startTitle = transition(createGameModel("Level 1", { showTitle: true }), { type: "start" }).model;
  const opened = transition(startTitle, { type: "gameCommand", command: { type: "settings" } });
  assertEquals(opened.model.mode, { type: "settings", returnIntent: "start" });
  assertEquals(opened.effects, [{ type: "render" }]);

  const closed = transition(opened.model, { type: "gameCommand", command: { type: "wait" } });
  assertEquals(closed.model.mode, { type: "title", intent: "start" });
  assertEquals(closed.effects, [{ type: "render" }]);

  const playing = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;
  const resumeTitle = transition(playing, { type: "gameCommand", command: { type: "menu" } }).model;
  const openedFromResume = transition(resumeTitle, { type: "gameCommand", command: { type: "settings" } });
  assertEquals(openedFromResume.model.mode, { type: "settings", returnIntent: "resume" });

  const closedFromResume = transition(openedFromResume.model, { type: "gameCommand", command: { type: "menu" } });
  assertEquals(closedFromResume.model.mode, { type: "title", intent: "resume" });
});

Deno.test("title pointer move tracks hovered menu buttons", () => {
  const titled = transition(createGameModel("Level 1", { showTitle: true }), { type: "start" }).model;

  const startHover = transition(titled, {
    type: "titlePointer",
    phase: "move",
    hoverButton: "start",
  });
  assertEquals(startHover.model.mode, { type: "title", intent: "start", hoverButton: "start" });
  assertEquals(startHover.effects, [{ type: "render" }]);

  const settingsHover = transition(startHover.model, {
    type: "titlePointer",
    phase: "move",
    hoverButton: "settings",
  });
  assertEquals(settingsHover.model.mode, { type: "title", intent: "start", hoverButton: "settings" });
  assertEquals(settingsHover.effects, [{ type: "render" }]);

  const cleared = transition(settingsHover.model, {
    type: "titlePointer",
    phase: "move",
  });
  assertEquals(cleared.model.mode, { type: "title", intent: "start" });
  assertEquals(cleared.effects, [{ type: "render" }]);

  const unchanged = transition(cleared.model, {
    type: "titlePointer",
    phase: "move",
  });
  assertEquals(unchanged.model.mode, { type: "title", intent: "start" });
  assertEquals(unchanged.effects, []);
});

Deno.test("settings pointer drag updates music and sound volumes", () => {
  const startTitle = transition(createGameModel("Level 1", { showTitle: true }), { type: "start" }).model;
  const settings = transition(startTitle, { type: "gameCommand", command: { type: "settings" } }).model;

  const musicDown = transition(settings, {
    type: "settingsPointer",
    phase: "down",
    slider: "music",
    volume: 0.4,
  });
  assertEquals(musicDown.model.audio.musicVolume, 0.4);
  assertEquals(musicDown.model.audio.soundVolume, 1);
  assertEquals(musicDown.model.mode, {
    type: "settings",
    returnIntent: "start",
    dragging: "music",
  });
  assertEquals(musicDown.effects, [{ type: "applyAudioVolumes" }, { type: "render" }]);

  const musicMove = transition(musicDown.model, {
    type: "settingsPointer",
    phase: "move",
    slider: "music",
    volume: 0.25,
  });
  assertEquals(musicMove.model.audio.musicVolume, 0.25);
  assertEquals(musicMove.effects, [{ type: "applyAudioVolumes" }, { type: "render" }]);

  const musicUp = transition(musicMove.model, {
    type: "settingsPointer",
    phase: "up",
    slider: "music",
    volume: 0.25,
  });
  assertEquals(musicUp.model.mode, { type: "settings", returnIntent: "start" });
  assertEquals(musicUp.model.audio.musicVolume, 0.25);
  assertEquals(musicUp.effects, []);

  const soundDown = transition(musicUp.model, {
    type: "settingsPointer",
    phase: "down",
    slider: "sound",
    volume: 0.7,
  });
  assertEquals(soundDown.model.audio, { musicVolume: 0.25, soundVolume: 0.7 });
  assertEquals(soundDown.model.mode, {
    type: "settings",
    returnIntent: "start",
    dragging: "sound",
  });
});

Deno.test("settings pointer drag updates interactive fps", () => {
  const startTitle = transition(createGameModel("Level 1", { showTitle: true }), { type: "start" }).model;
  const settings = transition(startTitle, { type: "gameCommand", command: { type: "settings" } }).model;

  const fpsDown = transition(settings, {
    type: "settingsPointer",
    phase: "down",
    slider: "fps",
    volume: 0,
  });
  assertEquals(fpsDown.model.interactiveFps, 12);
  assertEquals(fpsDown.model.mode, {
    type: "settings",
    returnIntent: "start",
    dragging: "fps",
  });
  assertEquals(fpsDown.effects, [{ type: "render" }]);

  const fpsMove = transition(fpsDown.model, {
    type: "settingsPointer",
    phase: "move",
    slider: "fps",
    volume: 1,
  });
  assertEquals(fpsMove.model.interactiveFps, 60);
  assertEquals(fpsMove.effects, [{ type: "render" }]);
});

Deno.test("title help opens help and closes back to the same title intent", () => {
  const startTitle = transition(createGameModel("Level 1", { showTitle: true }), { type: "start" }).model;
  const opened = transition(startTitle, { type: "gameCommand", command: { type: "help" } });
  assertEquals(opened.model.mode, {
    type: "help",
    returnTo: { kind: "title", intent: "start" },
  });
  assertEquals(opened.effects, [{ type: "render" }]);

  const closed = transition(opened.model, { type: "gameCommand", command: { type: "wait" } });
  assertEquals(closed.model.mode, { type: "title", intent: "start" });
  assertEquals(closed.effects, [{ type: "render" }]);

  const playing = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;
  const resumeTitle = transition(playing, { type: "gameCommand", command: { type: "menu" } }).model;
  const openedFromResume = transition(resumeTitle, { type: "gameCommand", command: { type: "help" } });
  assertEquals(openedFromResume.model.mode, {
    type: "help",
    returnTo: { kind: "title", intent: "resume" },
  });

  const closedFromResume = transition(openedFromResume.model, { type: "gameCommand", command: { type: "menu" } });
  assertEquals(closedFromResume.model.mode, { type: "title", intent: "resume" });
});
