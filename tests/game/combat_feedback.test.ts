import { assertEquals } from "@std/assert";
import { combatFeedbackForEvents } from "@/src/game/combat_feedback.ts";

const PLAYER = 1;
const ENEMY = 2;

Deno.test("combatFeedbackForEvents reports misses, hits, crits, and defeats", () => {
  assertEquals(
    combatFeedbackForEvents(PLAYER, [
      { type: "attackMissed", actor: PLAYER, actorName: "You" },
      {
        type: "damageDealt",
        actor: PLAYER,
        actorName: "You",
        target: ENEMY,
        targetName: "Digital Dog",
        amount: 2,
        critical: false,
      },
      {
        type: "damageDealt",
        actor: PLAYER,
        actorName: "You",
        target: ENEMY,
        targetName: "Digital Dog",
        amount: 4,
        critical: true,
      },
      { type: "entityDefeated", actor: PLAYER, entity: ENEMY, entityName: "Digital Dog" },
    ]),
    [
      { text: "MISS", tone: "miss" },
      { text: "HIT 2", tone: "hit" },
      { text: "CRIT 4", tone: "crit" },
      { text: "DOWN", tone: "defeat" },
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
        amount: 1,
        critical: false,
      },
    ]),
    [{ text: "HIT 1", tone: "hurt" }],
  );
});

Deno.test("combatFeedbackForEvents ignores non-combat events", () => {
  assertEquals(combatFeedbackForEvents(PLAYER, [{ type: "keyPickedUp", entity: 3 }]), []);
});
