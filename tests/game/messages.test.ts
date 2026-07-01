import { assertEquals } from "@std/assert";
import type { Entity } from "@phughesmcr/miski";
import { messageForEvent } from "@/src/game/messages.ts";

const PLAYER = 1 as Entity;
const IMP = 2 as Entity;
const DOOR = 3 as Entity;

Deno.test("messageForEvent covers attack outcomes", () => {
  assertEquals(
    messageForEvent(PLAYER, { type: "attackMissed", actor: PLAYER, actorName: "You" }),
    "Nothing in range.",
  );
  assertEquals(
    messageForEvent(PLAYER, {
      type: "attackMissed",
      actor: PLAYER,
      actorName: "You",
      target: IMP,
      targetName: "Imp",
      roll: 3,
      total: 5,
    }),
    "You missed Imp.",
  );
  assertEquals(
    messageForEvent(PLAYER, {
      type: "damageDealt",
      actor: IMP,
      actorName: "Imp",
      target: PLAYER,
      targetName: "You",
      amount: 2,
      critical: false,
    }),
    "Imp hit You for 2.",
  );
  assertEquals(
    messageForEvent(PLAYER, {
      type: "damageDealt",
      actor: PLAYER,
      actorName: "You",
      target: IMP,
      targetName: "Imp",
      amount: 4,
      critical: true,
    }),
    "You hit Imp for 4 critical.",
  );
});

Deno.test("messageForEvent distinguishes player defeat from enemy defeat", () => {
  assertEquals(
    messageForEvent(PLAYER, { type: "entityDefeated", actor: IMP, entity: PLAYER, entityName: "You" }),
    "You are defeated.",
  );
  assertEquals(
    messageForEvent(PLAYER, { type: "entityDefeated", actor: PLAYER, entity: IMP, entityName: "Imp" }),
    "Imp is defeated.",
  );
});

Deno.test("messageForEvent covers interaction events", () => {
  assertEquals(messageForEvent(PLAYER, { type: "keyPickedUp", entity: DOOR }), "Picked up a key.");
  assertEquals(messageForEvent(PLAYER, { type: "doorLocked", entity: DOOR }), "The door is locked.");
  assertEquals(messageForEvent(PLAYER, { type: "doorOpened", entity: DOOR }), "Opened the door.");
  assertEquals(
    messageForEvent(PLAYER, { type: "weaponSelected", slot: 2, label: "Pistol" }),
    "Selected weapon 2: Pistol.",
  );
});
