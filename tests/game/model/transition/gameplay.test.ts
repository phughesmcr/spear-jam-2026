import { TrackId } from "@/src/game/content/audio/music.ts";
import { VICTORY_FADE_MS, VICTORY_HOLD_MS } from "@/src/game/content/victory.ts";
import { createGameModel, transition } from "@/tests/game/model/transition/helpers.ts";
import { assertEquals } from "@std/assert";
import type { Entity } from "turn-based-engine/ecs";

const PLAYER = 1 as Entity;
const LEVEL_STATS = {
  elapsedMs: 125_900,
  moves: 184,
  monstersKilled: 7,
  totalMonsters: 9,
} as const;

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
  assertEquals(result.effects, [{ type: "render" }, { type: "scheduleMapAssets", mapName: "Level 2" }]);
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

Deno.test("transition passes smart action through as a player command", () => {
  const model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  const result = transition(model, { type: "gameCommand", command: { type: "smartAction" } });

  assertEquals(result.effects, [{ type: "runPlayerCommand", command: { type: "smartAction" } }]);
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
  assertEquals(result.model.mode, { type: "loading", completed: 0, total: 0 });
  assertEquals(result.effects, [
    { type: "render" },
    { type: "retryMap", mapName: "Level 2" },
  ]);
});

Deno.test("transition presents victory as an ending intermission before returning to the title screen", () => {
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
  assertEquals(mode.completion, { type: "returnToTitle" });
  assertEquals(mode.revealStartedAtMs, 1000 + VICTORY_HOLD_MS + VICTORY_FADE_MS);
  assertEquals(mode.revealed, false);
  assertEquals(result.effects, [{ type: "render" }]);

  mode = { ...mode, pageIndex: mode.pages.length - 1, revealed: true };
  model = { ...result.model, mode };
  result = transition(model, { type: "gameCommand", command: { type: "wait" }, nowMs: 1000 });
  assertEquals(result.model.presentation, { messages: [], combatFeedback: [] });
  assertEquals(result.model.mode, { type: "title", intent: "start" });
  assertEquals(result.effects, [
    { type: "render" },
    { type: "endRun" },
  ]);
});
