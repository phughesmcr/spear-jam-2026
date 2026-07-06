import { assertEquals } from "@std/assert";
import type { Entity } from "@phughesmcr/miski";
import { soundCuesForEvents } from "@/src/game/sound_cues.ts";
import { SoundId } from "@/src/game/sound.ts";

const PLAYER = 1 as Entity;
const ENEMY = 2 as Entity;
const DOOR = 3 as Entity;
const PICKUP = 4 as Entity;
const NPC = 5 as Entity;

Deno.test("sound cues include sound-only blocked movement", () => {
  const cues = soundCuesForEvents([], {
    playerEntity: PLAYER,
    playerPosition: { x: 1, y: 1 },
    positionsBefore: new Map(),
    positionsAfter: new Map(),
    blockedMove: true,
  });

  assertEquals(cues, [{ soundId: SoundId.BlockedMove, position: { x: 1, y: 1 }, radius: 2 }]);
});

Deno.test("sound cues use entity positions for doors, pickups, and dialogue", () => {
  const positions = new Map<Entity, { readonly x: number; readonly y: number }>([
    [DOOR, { x: 2, y: 1 }],
    [PICKUP, { x: 3, y: 1 }],
    [NPC, { x: 4, y: 1 }],
  ]);
  const cues = soundCuesForEvents([
    { type: "doorOpened", entity: DOOR },
    { type: "keyPickedUp", entity: PICKUP },
  ], {
    playerEntity: PLAYER,
    playerPosition: { x: 1, y: 1 },
    positionsBefore: positions,
    positionsAfter: positions,
    dialogueTarget: NPC,
  });

  assertEquals(cues, [
    { soundId: SoundId.NpcInteract, position: { x: 4, y: 1 }, radius: 3 },
    { soundId: SoundId.DoorOpen, position: { x: 2, y: 1 }, radius: 5 },
    { soundId: SoundId.PickupKey, position: { x: 3, y: 1 }, radius: 3 },
  ]);
});

Deno.test("sound cues map player and enemy attacks without duplicating attack sounds", () => {
  const cues = soundCuesForEvents([
    {
      type: "damageDealt",
      actor: PLAYER,
      actorName: "You",
      target: ENEMY,
      targetName: "Dog",
      roll: 16,
      total: 18,
      amount: 1,
      critical: false,
    },
    {
      type: "attackMissed",
      actor: PLAYER,
      actorName: "You",
      target: ENEMY,
      targetName: "Dog",
      roll: 4,
      total: 6,
    },
    {
      type: "damageDealt",
      actor: ENEMY,
      actorName: "Dog",
      target: PLAYER,
      targetName: "You",
      roll: 18,
      total: 22,
      amount: 1,
      critical: false,
    },
  ], {
    playerEntity: PLAYER,
    playerPosition: { x: 1, y: 1 },
    positionsBefore: new Map([[ENEMY, { x: 2, y: 1 }]]),
    positionsAfter: new Map([[ENEMY, { x: 2, y: 1 }]]),
    playerWeaponSlot: 2,
    playerWeaponRadius: 8,
  });

  assertEquals(cues, [
    { soundId: SoundId.WeaponPulsePistol, position: { x: 1, y: 1 }, radius: 8 },
    { soundId: SoundId.EnemyAttack, position: { x: 2, y: 1 }, radius: 5 },
    { soundId: SoundId.PlayerHurt, position: { x: 1, y: 1 }, radius: 1 },
  ]);
});

Deno.test("sound cues use pre-removal position for defeated enemies", () => {
  const cues = soundCuesForEvents([{
    type: "entityDefeated",
    actor: PLAYER,
    entity: ENEMY,
    entityName: "Dog",
  }], {
    playerEntity: PLAYER,
    playerPosition: { x: 1, y: 1 },
    positionsBefore: new Map([[ENEMY, { x: 5, y: 6 }]]),
    positionsAfter: new Map(),
  });

  assertEquals(cues, [{ soundId: SoundId.EnemyDefeat, position: { x: 5, y: 6 }, radius: 5 }]);
});
