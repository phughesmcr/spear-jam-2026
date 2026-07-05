import { assertEquals } from "@std/assert";
import type { Entity } from "@phughesmcr/miski";
import { createGameModel, type GameModel, transition } from "@/src/game/transition.ts";
import { DisplayName } from "@/src/game/names.ts";

const PLAYER = 1 as Entity;

Deno.test("transition starts with render and map loading effects", () => {
  const result = transition(createGameModel("Level 1"), { type: "start" });

  assertEquals(result.model.mode, { type: "loading" });
  assertEquals(result.effects, [
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
  assertEquals(mode.goto, "Level 1");
  assertEquals(mode.revealStartedAtMs, 1000);
  assertEquals(mode.revealed, false);
  assertEquals(result.effects, [{ type: "ensureInput" }, { type: "render" }]);

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
      events: [{ type: "examined", text: "The uplink hums." }],
      mapChange: { goto: "Level 2" },
    },
  });

  assertEquals(result.model.mode, {
    type: "intermission",
    pages: ["Entering Level 2."],
    pageIndex: 0,
    prompt: "Space to continue",
    goto: "Level 2",
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
  assertEquals(result.model.mode, { type: "help", selectedIndex: 0 });
  assertEquals(result.effects, [{ type: "render" }]);

  result = transition(result.model, { type: "gameCommand", command: { type: "wait" } });
  assertEquals(result.model.mode, { type: "verbMenu", selectedIndex: 0 });
  assertEquals(result.effects, [{ type: "render" }]);
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

Deno.test("transition confirms dialogue pointer only when down and up hit the same option", () => {
  let model: GameModel = { ...createGameModel("Level 1"), mode: DIALOGUE_MODE };

  ({ model } = transition(model, { type: "dialoguePointer", phase: "down", optionSlot: 1 }));
  assertEquals(model.dialoguePointerDownSlot, 1);

  let result = transition(model, { type: "dialoguePointer", phase: "up", optionSlot: 2 });
  model = result.model;
  assertEquals(model.mode, DIALOGUE_MODE);
  assertEquals(model.dialoguePointerDownSlot, undefined);
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

Deno.test("transition resets victory through a fresh-run effect", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Final Level",
  }).model;

  ({ model } = transition(model, {
    type: "playerCommandResult",
    playerEntity: PLAYER,
    result: {
      events: [{ type: "examined", text: "The system reboots." }],
      outcome: "victory",
    },
  }));

  const result = transition(model, { type: "gameCommand", command: { type: "wait" } });
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
