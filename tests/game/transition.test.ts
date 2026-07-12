import { DisplayName } from "@/src/game/names.ts";
import { VoiceId } from "@/src/dialogue/voice.ts";
import { TrackId } from "@/src/audio/music_catalog.ts";
import { createGameModel, type GameModel, transition } from "@/src/game/transition.ts";
import { VICTORY_FADE_MS, VICTORY_HOLD_MS } from "@/src/game/victory.ts";
import type { Entity } from "turn-based-engine/ecs";
import { assertEquals } from "@std/assert";

const PLAYER = 1 as Entity;
const LEVEL_STATS = {
  elapsedMs: 125_900,
  moves: 184,
  monstersKilled: 7,
  totalMonsters: 9,
} as const;

Deno.test("transition starts with render and map loading effects", () => {
  const result = transition(createGameModel("Level 1"), { type: "start" });

  assertEquals(result.model.mode, { type: "loading" });
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
  ]);
});

Deno.test("title start without intro loads the start map", () => {
  const titled = transition(createGameModel("Level 1", { showTitle: true }), { type: "start" }).model;
  const result = transition(titled, { type: "gameCommand", command: { type: "wait" } });

  assertEquals(result.model.mode, { type: "loading" });
  assertEquals(result.effects, [
    { type: "applyAudioVolumes" },
    { type: "render" },
    { type: "loadMap", mapName: "Level 1" },
  ]);
});

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
  assertEquals(result.model.mode, { type: "loading" });
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

Deno.test("transition derives command result intermission state", () => {
  const playing = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  const result = transition(playing, {
    type: "playerCommandResult",
    playerEntity: PLAYER,
    result: {
      type: "mapChange",
      events: [{ type: "examined", text: "The uplink hums." }],
      mapChange: { goto: "Level 2" },
      levelStats: LEVEL_STATS,
    },
  });

  assertEquals(result.model.mode, {
    type: "intermission",
    pages: [
      "LEVEL COMPLETE\n\nTIME 02:05\nMOVES 184\nMONSTERS 7/9 (78%)",
      "Entering Level 2.",
    ],
    pageIndex: 0,
    prompt: "Space to continue",
    background: "system",
    completion: { type: "loadMap", mapName: "Level 2" },
    revealStartedAtMs: 0,
    revealed: false,
  });
  assertEquals(result.model.presentation.messages, [{ text: "The uplink hums.", expiresAtMs: 2200 }]);
  assertEquals(result.effects, [{ type: "render" }]);
});

Deno.test("transition stores command result combat feedback in presentation", () => {
  const playing = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  const result = transition(playing, {
    type: "playerCommandResult",
    playerEntity: PLAYER,
    nowMs: 100,
    result: {
      type: "continue",
      events: [{
        type: "damageDealt",
        actor: PLAYER,
        actorName: "You",
        target: 2 as Entity,
        targetName: "Drone",
        roll: 14,
        total: 18,
        amount: 3,
        critical: false,
      }],
    },
  });

  assertEquals(result.model.presentation.combatFeedback, [{
    text: "HIT 3",
    tone: "hit",
    side: "player",
    roll: 14,
    total: 18,
  }]);
  assertEquals(result.model.presentation.messages, [{ text: "You hit Drone for 3.", expiresAtMs: 2300 }]);
});

Deno.test("transition confirms pointer verbs only when down and up hit the same hotspot", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 0 });

  ({ model } = transition(model, { type: "verbPointer", phase: "down", target: { kind: "verb", verbIndex: 1 } }));
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 1 });

  let result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "verb", verbIndex: 2 } });
  model = result.model;
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 2 });
  assertEquals(result.effects, [{ type: "render" }]);

  ({ model } = transition(model, { type: "verbPointer", phase: "down", target: { kind: "verb", verbIndex: 2 } }));
  result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "verb", verbIndex: 2 } });
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "runPlayerCommand", command: { type: "interact", verb: "open" } }]);
});

Deno.test("transition tracks pointer hover targets in the verb menu", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));

  let result = transition(model, {
    type: "verbPointer",
    phase: "move",
    target: { kind: "control", control: "close" },
  });
  assertEquals(result.model.mode, {
    type: "verbMenu",
    selectedIndex: 0,
    hoverTarget: { kind: "control", control: "close" },
  });
  assertEquals(result.effects, [{ type: "render" }]);

  result = transition(result.model, {
    type: "verbPointer",
    phase: "move",
    target: { kind: "weapon", slot: 3 },
  });
  assertEquals(result.model.mode, {
    type: "verbMenu",
    selectedIndex: 0,
    hoverTarget: { kind: "weapon", slot: 3 },
  });
  assertEquals(result.effects, [{ type: "render" }]);

  result = transition(result.model, {
    type: "verbPointer",
    phase: "move",
    target: { kind: "verb", verbIndex: 3 },
  });
  assertEquals(result.model.mode, {
    type: "verbMenu",
    selectedIndex: 3,
    hoverTarget: { kind: "verb", verbIndex: 3 },
  });
  assertEquals(result.effects, [{ type: "render" }]);

  result = transition(result.model, { type: "verbPointer", phase: "move" });
  assertEquals(result.model.mode, { type: "verbMenu", selectedIndex: 3 });
  assertEquals(result.effects, [{ type: "render" }]);
});

Deno.test("transition makes keyboard verb cycling visually explicit", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));

  const result = transition(model, {
    type: "gameCommand",
    command: { type: "move", direction: "backward" },
  });
  assertEquals(result.model.mode, {
    type: "verbMenu",
    selectedIndex: 1,
    hoverTarget: { kind: "verb", verbIndex: 1 },
  });
  assertEquals(result.effects, [{ type: "render" }]);
});

Deno.test("transition confirms pointer weapon buttons only when down and up hit the same button", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 0 });

  ({ model } = transition(model, { type: "verbPointer", phase: "down", target: { kind: "weapon", slot: 2 } }));
  let result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "weapon", slot: 3 } });
  model = result.model;
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 0 });
  assertEquals(result.effects, []);

  ({ model } = transition(model, { type: "verbPointer", phase: "down", target: { kind: "weapon", slot: 2 } }));
  result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "weapon", slot: 2 } });
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "runPlayerCommand", command: { type: "selectWeapon", slot: 2 } }]);
});

Deno.test("transition confirms pointer control buttons only when down and up hit the same button", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 0 });

  ({ model } = transition(model, { type: "verbPointer", phase: "down", target: { kind: "control", control: "wait" } }));
  let result = transition(model, {
    type: "verbPointer",
    phase: "up",
    target: { kind: "control", control: "toggleView" },
  });
  model = result.model;
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 0 });
  assertEquals(result.effects, []);

  ({ model } = transition(model, { type: "verbPointer", phase: "down", target: { kind: "control", control: "wait" } }));
  result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "control", control: "wait" } });
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "runPlayerCommand", command: { type: "wait" } }]);
  model = result.model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));
  ({ model } = transition(model, {
    type: "verbPointer",
    phase: "down",
    target: { kind: "control", control: "toggleView" },
  }));
  result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "control", control: "toggleView" } });
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.model.viewMode, "topDown");
  assertEquals(result.effects, [{ type: "render" }]);

  ({ model } = transition(result.model, { type: "gameCommand", command: { type: "action" } }));
  ({ model } = transition(model, {
    type: "verbPointer",
    phase: "down",
    target: { kind: "control", control: "close" },
  }));
  result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "control", control: "close" } });
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "render" }]);
});

Deno.test("transition opens help from the verb menu and closes it back to the verb menu", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));
  ({ model } = transition(model, {
    type: "verbPointer",
    phase: "down",
    target: { kind: "control", control: "help" },
  }));
  let result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "control", control: "help" } });
  assertEquals(result.model.mode, {
    type: "help",
    returnTo: { kind: "verbMenu", selectedIndex: 0 },
  });
  assertEquals(result.effects, [{ type: "render" }]);

  result = transition(result.model, { type: "gameCommand", command: { type: "wait" } });
  assertEquals(result.model.mode, { type: "verbMenu", selectedIndex: 0 });
  assertEquals(result.effects, [{ type: "render" }]);
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

Deno.test("transition passes smart action through as a player command", () => {
  const model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  const result = transition(model, { type: "gameCommand", command: { type: "smartAction" } });

  assertEquals(result.effects, [{ type: "runPlayerCommand", command: { type: "smartAction" } }]);
});

const DIALOGUE_MODE = {
  type: "dialogue",
  title: "John",
  speaker: DisplayName.John,
  treeKey: "john_intro",
  message: "Stay sharp.",
  choices: [
    { label: "WHAT'S GOING ON?", next: "briefing" },
    { label: "BYE!" },
  ],
} as const;

Deno.test("transition lets dialogue choices advance or close the conversation", () => {
  const model = { ...createGameModel("Level 1"), mode: DIALOGUE_MODE } as const;

  const advanced = transition(model, { type: "gameCommand", command: { type: "wait" } });
  assertEquals(advanced.model.mode, {
    type: "dialogue",
    title: "John",
    speaker: DisplayName.John,
    treeKey: "john_intro",
    message: "The uplink is down. Find the code and get to the terminal.",
    choices: [{ label: "GOT IT." }],
  });
  assertEquals(advanced.effects, [{ type: "render" }]);

  const closed = transition(model, { type: "gameCommand", command: { type: "selectWeapon", slot: 2 } });
  assertEquals(closed.model.mode, { type: "playing" });
  assertEquals(closed.effects, [{ type: "closeDialogue" }, { type: "render" }]);

  const outOfRange = transition(model, { type: "gameCommand", command: { type: "selectWeapon", slot: 3 } });
  assertEquals(outOfRange.model.mode, DIALOGUE_MODE);
  assertEquals(outOfRange.effects, []);
});

Deno.test("transition starts, advances, and stops authored dialogue voices", () => {
  const playing = createGameModel("Level 1");
  const opened = transition(playing, {
    type: "playerCommandResult",
    playerEntity: PLAYER,
    result: {
      type: "dialogue",
      events: [],
      dialogue: {
        title: "John",
        speaker: DisplayName.John,
        treeKey: "john_thanks",
        message: "You made it.",
        voice: VoiceId.JohnThanksGreet,
        choices: [{ label: "WHERE TO NEXT?", next: "codes" }],
      },
    },
  });

  assertEquals(opened.effects, [
    { type: "setDialogueVoice", voice: VoiceId.JohnThanksGreet },
    { type: "render" },
  ]);

  const advanced = transition(opened.model, { type: "gameCommand", command: { type: "wait" } });
  assertEquals(
    advanced.model.mode.type === "dialogue" ? advanced.model.mode.voice : undefined,
    VoiceId.JohnThanksCodes,
  );
  assertEquals(advanced.effects, [
    { type: "setDialogueVoice", voice: VoiceId.JohnThanksCodes },
    { type: "render" },
  ]);

  const closed = transition(advanced.model, { type: "gameCommand", command: { type: "selectWeapon", slot: 2 } });
  assertEquals(closed.effects, [
    { type: "setDialogueVoice" },
    { type: "closeDialogue" },
    { type: "render" },
  ]);
});

Deno.test("transition confirms dialogue pointer only when down and up hit the same option", () => {
  let model: GameModel = { ...createGameModel("Level 1"), mode: DIALOGUE_MODE };

  ({ model } = transition(model, { type: "dialoguePointer", phase: "down", optionSlot: 1 }));
  assertEquals(model.mode.type === "dialogue" ? model.mode.pointerDownSlot : undefined, 1);

  let result = transition(model, { type: "dialoguePointer", phase: "up", optionSlot: 2 });
  model = result.model;
  assertEquals(model.mode, DIALOGUE_MODE);
  assertEquals(model.mode.type === "dialogue" ? model.mode.pointerDownSlot : undefined, undefined);
  assertEquals(result.effects, []);

  ({ model } = transition(model, { type: "dialoguePointer", phase: "down", optionSlot: 2 }));
  result = transition(model, { type: "dialoguePointer", phase: "up", optionSlot: 2 });
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "closeDialogue" }, { type: "render" }]);
});

Deno.test("transition retries defeat through a session-owned checkpoint effect", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 2",
  }).model;

  ({ model } = transition(model, {
    type: "playerCommandResult",
    playerEntity: PLAYER,
    result: {
      type: "outcome",
      events: [{ type: "examined", text: "You fall." }],
      outcome: "defeat",
    },
  }));

  const result = transition(model, { type: "gameCommand", command: { type: "wait" } });
  assertEquals(result.model.presentation, { messages: [], combatFeedback: [] });
  assertEquals(result.model.mode, { type: "loading" });
  assertEquals(result.effects, [
    { type: "render" },
    { type: "retryMap", mapName: "Level 2" },
  ]);
});

Deno.test("transition presents victory as an ending intermission before starting a fresh run", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Final Level",
  }).model;

  let result = transition(model, {
    type: "playerCommandResult",
    playerEntity: PLAYER,
    nowMs: 1000,
    result: {
      type: "outcome",
      events: [{ type: "examined", text: "The system reboots." }],
      outcome: "victory",
      levelStats: LEVEL_STATS,
    },
  });

  assertEquals(result.model.mode, {
    type: "victoryTransition",
    fadeStartsAtMs: 1000 + VICTORY_HOLD_MS,
    completesAtMs: 1000 + VICTORY_HOLD_MS + VICTORY_FADE_MS,
    levelStats: LEVEL_STATS,
  });
  assertEquals(result.effects, [
    { type: "stopSounds" },
    { type: "playMusic", trackId: TrackId.Title },
    { type: "scheduleVictory", delayMs: VICTORY_HOLD_MS + VICTORY_FADE_MS },
    { type: "render" },
  ]);

  result = transition(result.model, {
    type: "victoryTransitionComplete",
    nowMs: 1000 + VICTORY_HOLD_MS + VICTORY_FADE_MS,
  });
  let mode = result.model.mode;
  if (mode.type !== "intermission") throw new Error(`Expected intermission mode, got ${mode.type}.`);
  assertEquals(mode.title, "SYSTEM REBOOTED");
  assertEquals(mode.pages.length, 6);
  assertEquals(mode.pages[0]?.startsWith("The Spear pierces"), true);
  assertEquals(mode.pages.at(-1), "LEVEL COMPLETE\n\nTIME 02:05\nMOVES 184\nMONSTERS 7/9 (78%)");
  assertEquals(mode.pageIndex, 0);
  assertEquals(mode.prompt, "Space to begin again");
  assertEquals(mode.background, "victory");
  assertEquals(mode.completion, { type: "resetRun", mapName: "Level 1" });
  assertEquals(mode.revealStartedAtMs, 1000 + VICTORY_HOLD_MS + VICTORY_FADE_MS);
  assertEquals(mode.revealed, false);
  assertEquals(result.effects, [{ type: "render" }]);

  mode = { ...mode, pageIndex: mode.pages.length - 1, revealed: true };
  model = { ...result.model, mode };
  result = transition(model, { type: "gameCommand", command: { type: "wait" }, nowMs: 1000 });
  assertEquals(result.model.presentation, { messages: [], combatFeedback: [] });
  assertEquals(result.model.mode, { type: "loading" });
  assertEquals(result.effects, [
    { type: "render" },
    { type: "resetRun", mapName: "Level 1" },
  ]);
});

Deno.test("transition toggles the playing view mode with a render", () => {
  const model = createGameModel("Level 1");
  assertEquals(model.viewMode, "firstPerson");

  const toggled = transition(model, { type: "gameCommand", command: { type: "toggleView" } });
  assertEquals(toggled.model.viewMode, "topDown");
  assertEquals(toggled.effects, [{ type: "render" }]);

  const restored = transition(toggled.model, { type: "gameCommand", command: { type: "toggleView" } });
  assertEquals(restored.model.viewMode, "firstPerson");
});

Deno.test("transition keeps the view mode across map loads", () => {
  const toggled = transition(createGameModel("Level 1"), {
    type: "gameCommand",
    command: { type: "toggleView" },
  });
  const loaded = transition(toggled.model, { type: "mapLoaded", mapName: "Level 2" });

  assertEquals(loaded.model.viewMode, "topDown");
});
