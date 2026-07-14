import { messageForEvent } from "@/src/game/model/messages.ts";
import { assertEquals } from "@std/assert";
import type { Entity } from "turn-based-engine/ecs";

const PLAYER = 1 as Entity;
const DIGITAL_DOG = 2 as Entity;
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
      target: DIGITAL_DOG,
      targetName: "Digital Dog",
      roll: 3,
      total: 5,
    }),
    "You missed Digital Dog.",
  );
  assertEquals(
    messageForEvent(PLAYER, {
      type: "damageDealt",
      actor: DIGITAL_DOG,
      actorName: "Digital Dog",
      target: PLAYER,
      targetName: "You",
      roll: 12,
      total: 14,
      amount: 2,
      critical: false,
    }),
    "Digital Dog hit You for 2.",
  );
  assertEquals(
    messageForEvent(PLAYER, {
      type: "damageDealt",
      actor: PLAYER,
      actorName: "You",
      target: DIGITAL_DOG,
      targetName: "Digital Dog",
      roll: 20,
      total: 24,
      amount: 4,
      critical: true,
    }),
    "You hit Digital Dog for 4 critical.",
  );
});

Deno.test("messageForEvent distinguishes player defeat from enemy defeat", () => {
  assertEquals(
    messageForEvent(PLAYER, { type: "entityDefeated", actor: DIGITAL_DOG, entity: PLAYER, entityName: "You" }),
    "You are defeated.",
  );
  assertEquals(
    messageForEvent(PLAYER, { type: "entityDefeated", actor: PLAYER, entity: DIGITAL_DOG, entityName: "Digital Dog" }),
    "Digital Dog is defeated.",
  );
});

Deno.test("messageForEvent covers interaction events", () => {
  assertEquals(messageForEvent(PLAYER, { type: "keyPickedUp", entity: DOOR }), "Picked up a key.");
  assertEquals(messageForEvent(PLAYER, { type: "uplinkCodePickedUp", entity: DOOR }), "Picked up an uplink code.");
  assertEquals(messageForEvent(PLAYER, { type: "spearPickedUp", entity: DOOR }), "Picked up the Spear of Destiny.");
  assertEquals(
    messageForEvent(PLAYER, { type: "weaponPickedUp", entity: DOOR, slot: 2, label: "Pulse Pistol" }),
    "Picked up weapon 2: Pulse Pistol.",
  );
  assertEquals(
    messageForEvent(PLAYER, { type: "healthPickedUp", entity: DOOR, amount: 4, healed: 3 }),
    "Restored 3 HP.",
  );
  assertEquals(
    messageForEvent(PLAYER, { type: "ammoPickedUp", entity: DOOR, ammo: "pistol", amount: 5 }),
    "Picked up 5 pistol ammo.",
  );
  assertEquals(messageForEvent(PLAYER, { type: "doorLocked", entity: DOOR }), "The door is locked.");
  assertEquals(messageForEvent(PLAYER, { type: "doorOpened", entity: DOOR }), "Opened the door.");
  assertEquals(messageForEvent(PLAYER, { type: "doorAlreadyOpen", entity: DOOR }), "It's already open.");
  assertEquals(messageForEvent(PLAYER, { type: "doorCannotOpen", entity: DOOR }), "You can't open that.");
  assertEquals(messageForEvent(PLAYER, { type: "doorShattered", entity: DOOR }), "The glass shatters.");
  assertEquals(messageForEvent(PLAYER, { type: "uplinkTerminalLocked", entity: DOOR }), "The uplink needs a code.");
  assertEquals(
    messageForEvent(PLAYER, { type: "uplinkTerminalNeedsSpear", entity: DOOR }),
    "The uplink needs the Spear of Destiny.",
  );
  assertEquals(messageForEvent(PLAYER, { type: "uplinkTerminalActivated", entity: DOOR }), "Uplink accepted.");
  assertEquals(
    messageForEvent(PLAYER, { type: "spearTurretNeedsSpear", entity: DOOR }),
    "The turret needs the Spear of Destiny.",
  );
  assertEquals(
    messageForEvent(PLAYER, { type: "spearTurretLoaded", entity: DOOR }),
    "Loaded the Spear of Destiny.",
  );
  assertEquals(
    messageForEvent(PLAYER, { type: "weaponSelected", slot: 2, label: "Pulse Pistol" }),
    "Selected weapon 2: Pulse Pistol.",
  );
  assertEquals(
    messageForEvent(PLAYER, { type: "weaponUnavailable", slot: 3, label: "Current Cannon" }),
    "Weapon 3 is not unlocked.",
  );
  assertEquals(messageForEvent(PLAYER, { type: "ammoSpent", ammo: "pistol", amount: 1 }), "Spent 1 pistol ammo.");
  assertEquals(messageForEvent(PLAYER, { type: "noAmmo", ammo: "cannon" }), "No cannon ammo.");
  assertEquals(
    messageForEvent(PLAYER, { type: "examined", entity: DOOR, text: "The panel is warm." }),
    "The panel is warm.",
  );
  assertEquals(messageForEvent(PLAYER, { type: "verbFailed", verb: "open" }), "Nothing to open.");
  assertEquals(messageForEvent(PLAYER, { type: "verbFailed", verb: "use" }), "That didn't work.");
  assertEquals(messageForEvent(PLAYER, { type: "verbFailed", verb: "talk" }), "That didn't work.");
  assertEquals(
    messageForEvent(PLAYER, { type: "creditsEarned", amount: 10, credits: 20, score: 30 }),
    "Earned 10 credits.",
  );
  assertEquals(messageForEvent(PLAYER, { type: "xpGained", amount: 20, xp: 35 }), "Converted 20 credits to XP.");
});
