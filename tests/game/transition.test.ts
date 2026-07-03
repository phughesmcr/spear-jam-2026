import { assertEquals } from "@std/assert";
import type { Entity } from "@phughesmcr/miski";
import { createGameModel, type GameModel, transition } from "@/src/game/transition.ts";
import { KeyColor } from "@/src/map/map.ts";

const PLAYER = 1 as Entity;

Deno.test("transition starts with render and map loading effects", () => {
  const result = transition(createGameModel("Level 1"), { type: "start" });

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
    playerState: { heldKeys: [KeyColor.Red] },
  });

  assertEquals(result.model.currentMapName, "Level 2");
  assertEquals(result.model.currentLevelEntryState?.heldKeys, [KeyColor.Red]);
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "ensureInput" }, { type: "render" }]);
});

Deno.test("transition derives command result intermission state", () => {
  const playing = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;
  const playerState = { hasUplinkCode: true };

  const result = transition(playing, {
    type: "playerCommandResult",
    playerEntity: PLAYER,
    playerState,
    result: {
      events: [{ type: "examined", text: "The uplink hums." }],
      mapChange: { goto: "Level 2" },
    },
  });

  assertEquals(result.model.mode, {
    type: "intermission",
    message: "Entering Level 2. Space to continue.",
    goto: "Level 2",
    playerState,
  });
  assertEquals(result.effects, [{ type: "render" }]);
});

Deno.test("transition confirms pointer verbs only when down and up hit the same hotspot", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 0 });

  ({ model } = transition(model, { type: "verbPointer", phase: "down", hotspotIndex: 1 }));
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 1 });

  let result = transition(model, { type: "verbPointer", phase: "up", hotspotIndex: 2 });
  model = result.model;
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 2 });
  assertEquals(result.effects, [{ type: "render" }]);

  ({ model } = transition(model, { type: "verbPointer", phase: "down", hotspotIndex: 2 }));
  result = transition(model, { type: "verbPointer", phase: "up", hotspotIndex: 2 });
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "runPlayerCommand", command: { type: "interact", verb: "open" } }]);
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
    treeKey: "john_intro",
    message: "The uplink is down. Find the code and get to the terminal.",
    choices: [{ label: "GOT IT." }],
  });
  assertEquals(advanced.effects, [{ type: "render" }]);

  const closed = transition(model, { type: "gameCommand", command: { type: "selectWeapon", slot: 2 } });
  assertEquals(closed.model.mode, { type: "playing" });
  assertEquals(closed.effects, [{ type: "render" }]);

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
  assertEquals(result.effects, [{ type: "render" }]);
});

Deno.test("transition retries defeat from the current level entry snapshot", () => {
  const entryState = {
    heldKeys: [KeyColor.Yellow],
    health: { current: 8, max: 10 },
  };
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 2",
    playerState: entryState,
  }).model;

  ({ model } = transition(model, {
    type: "playerCommandResult",
    playerEntity: PLAYER,
    playerState: { health: { current: 0, max: 10 } },
    result: {
      events: [{ type: "examined", text: "You fall." }],
      outcome: "defeat",
    },
  }));

  const result = transition(model, { type: "gameCommand", command: { type: "wait" } });
  assertEquals(result.model.combatFeedback, []);
  assertEquals(result.model.mode, { type: "loading" });
  assertEquals(result.effects, [
    { type: "render" },
    { type: "loadMap", mapName: "Level 2", playerState: entryState },
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
