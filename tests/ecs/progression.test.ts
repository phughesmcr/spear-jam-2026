import { assertEquals } from "@std/assert";
import type { Entity } from "@phughesmcr/miski";
import { Health, PlayerEquipment, PlayerInventory, PlayerProgress } from "@/src/ecs/components.ts";
import {
  applyItemPickupToPlayer,
  awardCreditsForDefeats,
  capturePlayerProgressionCheckpoint,
  clearTransientPlayerState,
  completePlayerLevel,
  playerStatusSnapshotFor,
  resetPlayerProgression,
  restorePlayerProgressionCheckpoint,
  selectedPlayerWeapon,
  selectPlayerWeapon,
  spendPlayerAmmo,
} from "@/src/ecs/progression.ts";
import { createPlayer } from "@/src/ecs/prefabs.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { StoryFlag } from "@/src/game/story.ts";
import { KeyColor } from "@/src/map/map.ts";

Deno.test("player progression reset restores default ECS components", async () => {
  const world = await createWorld();
  const player = createProgressionPlayer(world);

  world.components.setEntityData(Health, player, { current: 2, max: 10 });
  applyItemPickupToPlayer(world, player, { type: "key", entity: 2 as Entity, color: KeyColor.Red });
  world.components.setEntityData(PlayerProgress, player, { credits: 7, score: 8, xp: 9, levelCredits: 10 });
  resetPlayerProgression(world, player);

  assertEquals(playerStatusSnapshotFor(world, player), {
    heldKeys: [],
    selectedWeapon: 1,
    unlockedWeapons: [1],
    ammo: { pistol: 0, cannon: 0 },
    health: { current: 10, max: 10 },
    hasUplinkCode: false,
    progress: { credits: 0, score: 0, xp: 0, levelCredits: 0 },
  });
  assertEquals(world.components.getEntityData(PlayerInventory, player), {
    keyMask: 0,
    hasUplinkCode: 0,
    pistolAmmo: 0,
    cannonAmmo: 0,
  });
  assertEquals(world.components.getEntityData(PlayerEquipment, player), {
    selectedWeapon: 1,
    unlockedWeaponMask: 2,
  });
  assertEquals(world.components.getEntityData(Health, player), {
    current: 10,
    max: 10,
  });
});

Deno.test("player status snapshot excludes story flags", async () => {
  const world = await createWorld();
  const player = createProgressionPlayer(world);

  assertEquals(Object.hasOwn(playerStatusSnapshotFor(world, player), "storyFlags"), false);
});

Deno.test("player progression tracks weapons and ammo in ECS components", async () => {
  const world = await createWorld();
  const player = createProgressionPlayer(world);

  applyItemPickupToPlayer(world, player, { type: "weapon", entity: 2 as Entity, slot: 2 });
  applyItemPickupToPlayer(world, player, { type: "weapon", entity: 3 as Entity, slot: 3 });
  applyItemPickupToPlayer(world, player, { type: "ammo", entity: 4 as Entity, ammo: "pistol", amount: 1 });
  selectPlayerWeapon(world, player, 3);

  assertEquals(selectedPlayerWeapon(world, player), 3);
  assertEquals(playerStatusSnapshotFor(world, player).unlockedWeapons, [1, 2, 3]);
  assertEquals(spendPlayerAmmo(world, player, "pistol"), true);
  assertEquals(spendPlayerAmmo(world, player, "pistol"), false);
  assertEquals(world.components.getEntityData(PlayerInventory, player), {
    keyMask: 0,
    hasUplinkCode: 0,
    pistolAmmo: 0,
    cannonAmmo: 0,
  });
});

Deno.test("player progression returns credit and XP events from ECS progress", async () => {
  const world = await createWorld();
  const player = createProgressionPlayer(world);
  const enemy = 2 as Entity;

  world.components.setEntityData(PlayerProgress, player, {
    credits: 5,
    score: 7,
    xp: 11,
    levelCredits: 3,
  });

  assertEquals(
    awardCreditsForDefeats(
      world,
      player,
      [{
        type: "entityDefeated",
        actor: player,
        entity: enemy,
        entityName: "Digital Dog",
      }],
    ),
    [
      {
        type: "entityDefeated",
        actor: player,
        entity: enemy,
        entityName: "Digital Dog",
      },
      {
        type: "creditsEarned",
        amount: 10,
        credits: 15,
        score: 17,
      },
    ],
  );
  assertEquals(world.components.getEntityData(PlayerProgress, player), {
    credits: 15,
    score: 17,
    xp: 11,
    levelCredits: 13,
  });
  assertEquals(completePlayerLevel(world, player, []), [{ type: "xpGained", amount: 13, xp: 24 }]);
  assertEquals(completePlayerLevel(world, player, []), []);
  assertEquals(playerStatusSnapshotFor(world, player).progress, { credits: 15, score: 17, xp: 24, levelCredits: 0 });
});

Deno.test("player progression clears transient key and uplink ECS state", async () => {
  const world = await createWorld();
  const player = createProgressionPlayer(world);

  applyItemPickupToPlayer(world, player, { type: "key", entity: 2 as Entity, color: KeyColor.Red });
  applyItemPickupToPlayer(world, player, { type: "uplinkCode", entity: 3 as Entity });

  clearTransientPlayerState(world, player);

  assertEquals(playerStatusSnapshotFor(world, player).heldKeys, []);
  assertEquals(playerStatusSnapshotFor(world, player).hasUplinkCode, false);
  assertEquals(world.components.getEntityData(PlayerInventory, player), {
    keyMask: 0,
    hasUplinkCode: 0,
    pistolAmmo: 0,
    cannonAmmo: 0,
  });
});

Deno.test("player progression checkpoint round-trips raw durable ECS state and story flags", async () => {
  const world = await createWorld();
  const player = createProgressionPlayer(world);

  world.components.setEntityData(Health, player, { current: 4, max: 9 });
  applyItemPickupToPlayer(world, player, { type: "key", entity: 2 as Entity, color: KeyColor.Blue });
  applyItemPickupToPlayer(world, player, { type: "uplinkCode", entity: 3 as Entity });
  applyItemPickupToPlayer(world, player, { type: "weapon", entity: 4 as Entity, slot: 2 });
  applyItemPickupToPlayer(world, player, { type: "ammo", entity: 5 as Entity, ammo: "pistol", amount: 6 });
  selectPlayerWeapon(world, player, 2);
  world.components.setEntityData(PlayerProgress, player, {
    credits: 20,
    score: 30,
    xp: 40,
    levelCredits: 50,
  });

  const checkpoint = capturePlayerProgressionCheckpoint(world, player, [StoryFlag.JohnSpoken]);
  resetPlayerProgression(world, player);

  const storyFlags = restorePlayerProgressionCheckpoint(world, player, checkpoint);

  assertEquals(storyFlags, [StoryFlag.JohnSpoken]);
  assertEquals(playerStatusSnapshotFor(world, player), {
    heldKeys: [KeyColor.Blue],
    selectedWeapon: 2,
    unlockedWeapons: [1, 2],
    ammo: { pistol: 6, cannon: 0 },
    health: { current: 4, max: 9 },
    hasUplinkCode: true,
    progress: { credits: 20, score: 30, xp: 40, levelCredits: 50 },
  });
});

function createProgressionPlayer(world: Parameters<typeof createPlayer>[0]): Entity {
  return createPlayer(world, { x: 1, y: 1, dir: 1 });
}
