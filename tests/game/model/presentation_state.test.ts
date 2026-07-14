import { assertEquals } from "@std/assert";
import type { Entity } from "turn-based-engine/ecs";
import {
  consumeGameEvents,
  createPresentationState,
  type PresentationState,
  presentationView,
} from "@/src/game/model/presentation_state.ts";

const PLAYER = 1 as Entity;
const ENEMY = 2 as Entity;

Deno.test("presentation starts idle", () => {
  const state = createPresentationState();

  assertEquals(state, { messages: [], combatFeedback: [] });
  assertEquals(presentationView(state, 0), {
    messages: [],
    combatFeedback: [],
    weaponHudPhase: "idle",
    showKeys: false,
    needsFrame: false,
  });
});

Deno.test("presentation starts weapon flash only for player-authored attacks", () => {
  let state = consumeGameEvents(createPresentationState(), {
    playerEntity: PLAYER,
    nowMs: 1000,
    events: [{ type: "attackMissed", actor: ENEMY, actorName: "Drone", target: PLAYER, targetName: "You" }],
  });

  assertEquals(presentationView(state, 1000).weaponHudPhase, "idle");

  state = consumeGameEvents(state, {
    playerEntity: PLAYER,
    nowMs: 2000,
    events: [{
      type: "damageDealt",
      actor: PLAYER,
      actorName: "You",
      target: ENEMY,
      targetName: "Drone",
      roll: 14,
      total: 18,
      amount: 3,
      critical: false,
    }],
  });

  assertEquals(presentationView(state, 2000).weaponHudPhase, "active");
  assertEquals(presentationView(state, 2139).weaponHudPhase, "active");
  assertEquals(presentationView(state, 2140).weaponHudPhase, "idle");
});

Deno.test("presentation shows key HUD flash for keys and locked doors", () => {
  let state = consumeGameEvents(createPresentationState(), {
    playerEntity: PLAYER,
    nowMs: 1000,
    events: [{ type: "keyPickedUp", entity: 3 as Entity }],
  });

  assertEquals(presentationView(state, 1000).showKeys, true);
  assertEquals(presentationView(state, 2399).showKeys, true);
  assertEquals(presentationView(state, 2400).showKeys, false);

  state = consumeGameEvents(state, {
    playerEntity: PLAYER,
    nowMs: 3000,
    events: [{ type: "doorLocked", entity: 4 as Entity }],
  });

  assertEquals(presentationView(state, 3000).showKeys, true);
});

Deno.test("presentation expires messages by view time", () => {
  const state = consumeGameEvents(createPresentationState(), {
    playerEntity: PLAYER,
    nowMs: 10,
    events: [{ type: "examined", text: "A quiet terminal." }],
  });

  assertEquals(presentationView(state, 2209).messages, ["A quiet terminal."]);
  assertEquals(presentationView(state, 2210).messages, []);
  assertEquals(presentationView(state, 2210).needsFrame, false);
});

Deno.test("presentation deduplicates active messages but allows re-add after expiry", () => {
  let state = consumeGameEvents(createPresentationState(), {
    playerEntity: PLAYER,
    nowMs: 0,
    events: [
      { type: "examined", text: "Same message." },
      { type: "examined", text: "Same message." },
    ],
  });

  assertEquals(presentationView(state, 0).messages, ["Same message."]);

  state = consumeGameEvents(state, {
    playerEntity: PLAYER,
    nowMs: 1000,
    events: [{ type: "examined", text: "Same message." }],
  });

  assertEquals(presentationView(state, 1000).messages, ["Same message."]);
  assertEquals(presentationView(state, 2200).messages, []);

  state = consumeGameEvents(state, {
    playerEntity: PLAYER,
    nowMs: 2300,
    events: [{ type: "examined", text: "Same message." }],
  });

  assertEquals(presentationView(state, 2300).messages, ["Same message."]);
});

Deno.test("presentation caps messages at two chronological lines", () => {
  const state = consumeGameEvents(createPresentationState(), {
    playerEntity: PLAYER,
    nowMs: 0,
    events: [
      { type: "examined", text: "One." },
      { type: "examined", text: "Two." },
      { type: "examined", text: "Three." },
    ],
  });

  assertEquals(presentationView(state, 0).messages, ["Two.", "Three."]);
});

Deno.test("presentation needs a frame only while messages or flashes are visible", () => {
  const state = consumeGameEvents(createPresentationState(), {
    playerEntity: PLAYER,
    nowMs: 0,
    events: [{
      type: "damageDealt",
      actor: PLAYER,
      actorName: "You",
      target: ENEMY,
      targetName: "Drone",
      roll: 20,
      total: 24,
      amount: 8,
      critical: true,
    }],
  });

  assertEquals(presentationView(state, 0).needsFrame, true);
  assertEquals(presentationView(state, 2200).combatFeedback.length, 1);
  assertEquals(presentationView(state, 2200).needsFrame, false);
});

Deno.test("presentation states are returned without mutating previous snapshots", () => {
  const initial = createPresentationState();
  const next = consumeGameEvents(initial, {
    playerEntity: PLAYER,
    nowMs: 0,
    events: [{ type: "examined", text: "New message." }],
  });

  assertEquals((initial as PresentationState).messages, []);
  assertEquals(presentationView(next, 0).messages, ["New message."]);
});
