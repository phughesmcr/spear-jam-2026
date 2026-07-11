import { assertEquals } from "@std/assert";
import { combatFeedbackForEvents } from "@/src/game/combat_feedback.ts";
import type { Entity } from "turn-based-engine/ecs";

const PLAYER = 1 as Entity;
const ENEMY = 2 as Entity;
const PICKUP = 3 as Entity;

Deno.test("combatFeedbackForEvents reports misses, hits, crits, and defeats", () => {
  assertEquals(
    combatFeedbackForEvents(PLAYER, [
      { type: "attackMissed", actor: PLAYER, actorName: "You", roll: 3, total: 5 },
      {
        type: "damageDealt",
        actor: PLAYER,
        actorName: "You",
        target: ENEMY,
        targetName: "Digital Dog",
        roll: 12,
        total: 16,
        amount: 2,
        critical: false,
      },
      {
        type: "damageDealt",
        actor: PLAYER,
        actorName: "You",
        target: ENEMY,
        targetName: "Digital Dog",
        roll: 20,
        total: 24,
        amount: 4,
        critical: true,
      },
      { type: "entityDefeated", actor: PLAYER, entity: ENEMY, entityName: "Digital Dog" },
    ]),
    [
      { text: "MISS", tone: "miss", side: "player", roll: 3, total: 5 },
      { text: "HIT 2", tone: "hit", side: "player", roll: 12, total: 16 },
      { text: "CRIT 4", tone: "crit", side: "player", roll: 20, total: 24 },
      { text: "DOWN", tone: "defeat", side: "player" },
    ],
  );
});

Deno.test("combatFeedbackForEvents marks enemy damage as hurt", () => {
  assertEquals(
    combatFeedbackForEvents(PLAYER, [
      {
        type: "damageDealt",
        actor: ENEMY,
        actorName: "Digital Dog",
        target: PLAYER,
        targetName: "You",
        roll: 17,
        total: 19,
        amount: 1,
        critical: false,
      },
    ]),
    [{ text: "HIT 1", tone: "hurt", side: "enemy", roll: 17, total: 19 }],
  );
});

Deno.test("combatFeedbackForEvents ignores non-combat events", () => {
  assertEquals(combatFeedbackForEvents(PLAYER, [{ type: "keyPickedUp", entity: PICKUP }]), []);
});
