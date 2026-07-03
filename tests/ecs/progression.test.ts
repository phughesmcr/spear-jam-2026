import { assertEquals } from "@std/assert";
import type { Entity } from "@phughesmcr/miski";
import { Health, PlayerEquipment, PlayerInventory, PlayerProgress, PlayerTurnEffects } from "@/src/ecs/components.ts";
import {
  awardCreditsForDefeats,
  clearTransientPlayerState,
  completePlayerLevel,
  initializePlayerProgression,
  playerStateSnapshotFor,
  selectedPlayerWeapon,
  spendPlayerAmmo,
  tickPlayerTurnEffects,
} from "@/src/ecs/progression.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { TurnEffectKind } from "@/src/game/turn_effects.ts";
import { KeyColor } from "@/src/map/map.ts";
import { createEntity } from "@/tests/ecs/helpers.ts";

Deno.test("player progression defaults to melee with empty ECS resources", async () => {
  const world = await createWorld();
  const player = createEntity(world);

  initializePlayerProgression(world, player);

  assertEquals(playerStateSnapshotFor(world, player), {
    heldKeys: [],
    selectedWeapon: 1,
    unlockedWeapons: [1],
    ammo: { pistol: 0, cannon: 0 },
    health: { current: 10, max: 10 },
    hasUplinkCode: false,
    progress: { credits: 0, score: 0, xp: 0, levelCredits: 0 },
    turnEffects: [],
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

Deno.test("player progression starts from a normalized selected weapon", async () => {
  const world = await createWorld();
  const player = createEntity(world);

  initializePlayerProgression(world, player, {
    heldKeys: [],
    selectedWeapon: 3,
    unlockedWeapons: [1, 2],
  });

  assertEquals(selectedPlayerWeapon(world, player), 1);
  assertEquals(playerStateSnapshotFor(world, player).unlockedWeapons, [1, 2]);
});

Deno.test("player progression tracks weapons and ammo in ECS components", async () => {
  const world = await createWorld();
  const player = createEntity(world);

  initializePlayerProgression(world, player, {
    heldKeys: [],
    selectedWeapon: 1,
    unlockedWeapons: [3, 2],
    ammo: { pistol: 1, cannon: 0 },
  });

  assertEquals(playerStateSnapshotFor(world, player).unlockedWeapons, [1, 2, 3]);
  assertEquals(spendPlayerAmmo(world, player, "pistol"), true);
  assertEquals(spendPlayerAmmo(world, player, "pistol"), false);
  assertEquals(world.components.getEntityData(PlayerInventory, player), {
    keyMask: 0,
    hasUplinkCode: 0,
    pistolAmmo: 0,
    cannonAmmo: 0,
  });
});

Deno.test("player progression ticks active turn effects in ECS components", async () => {
  const world = await createWorld();
  const player = createEntity(world);

  initializePlayerProgression(world, player, {
    turnEffects: [{ kind: TurnEffectKind.Invisibility, remainingTurns: 2 }],
  });

  assertEquals(world.components.getEntityData(PlayerTurnEffects, player), {
    invisibility: 2,
    overclock: 0,
    toughness: 0,
    healthRegen: 0,
  });

  tickPlayerTurnEffects(world, player);
  assertEquals(playerStateSnapshotFor(world, player).turnEffects, [
    { kind: TurnEffectKind.Invisibility, remainingTurns: 1 },
  ]);

  tickPlayerTurnEffects(world, player);
  assertEquals(playerStateSnapshotFor(world, player).turnEffects, []);
});

Deno.test("player progression returns credit and XP events from ECS progress", async () => {
  const world = await createWorld();
  const player = createEntity(world);
  const enemy = 2 as Entity;

  initializePlayerProgression(world, player, {
    progress: { credits: 5, score: 7, xp: 11, levelCredits: 3 },
  });

  assertEquals(
    awardCreditsForDefeats(
      world,
      player,
      [{
        type: "entityDefeated",
        actor: player,
        entity: enemy,
        entityName: "Imp",
      }],
    ),
    [
      {
        type: "entityDefeated",
        actor: player,
        entity: enemy,
        entityName: "Imp",
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
  assertEquals(playerStateSnapshotFor(world, player).progress, { credits: 15, score: 17, xp: 24, levelCredits: 0 });
});

Deno.test("player progression clears transient key and uplink ECS state", async () => {
  const world = await createWorld();
  const player = createEntity(world);

  initializePlayerProgression(world, player, {
    heldKeys: [KeyColor.Red],
    selectedWeapon: 1,
    hasUplinkCode: true,
  });

  clearTransientPlayerState(world, player);

  assertEquals(playerStateSnapshotFor(world, player).heldKeys, []);
  assertEquals(playerStateSnapshotFor(world, player).hasUplinkCode, false);
  assertEquals(world.components.getEntityData(PlayerInventory, player), {
    keyMask: 0,
    hasUplinkCode: 0,
    pistolAmmo: 0,
    cannonAmmo: 0,
  });
});
