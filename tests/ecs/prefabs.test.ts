import { assertEquals, assertThrows } from "@std/assert";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import {
  Attack,
  Dialogue,
  DisplayNameComponent,
  Enemy,
  EnemyArchetype,
  EnemyArchetypeComponent,
  Health,
  Npc,
} from "@/src/ecs/components.ts";
import { DisplayName } from "@/src/game/names.ts";
import { createDoor, createEnemy, createNpc } from "@/src/ecs/prefabs.ts";
import { createWorld } from "@/src/ecs/world.ts";

Deno.test("neutral NPCs and enemies share display names without sharing NPC identity", async () => {
  const world = await createWorld();
  const npc = createNpc(world, {
    x: 1,
    y: 1,
    dir: 1,
    displayName: DisplayName.John,
    dialogueTreeId: DialogueTreeId.JohnIntro,
  });
  const enemy = createEnemy(world, { x: 2, y: 1, dir: 3, displayName: DisplayName.Imp });

  assertEquals(world.components.entityHas(Npc, npc), true);
  assertEquals(world.components.entityHas(Dialogue, npc), true);
  assertEquals(world.components.entityHas(Enemy, npc), false);
  assertEquals(world.components.getEntityData(DisplayNameComponent, npc), { displayName: DisplayName.John });
  assertEquals(world.components.getEntityData(Dialogue, npc), { dialogueTreeId: DialogueTreeId.JohnIntro });

  assertEquals(world.components.entityHas(Npc, enemy), false);
  assertEquals(world.components.entityHas(Dialogue, enemy), false);
  assertEquals(world.components.entityHas(Enemy, enemy), true);
  assertEquals(world.components.getEntityData(DisplayNameComponent, enemy), { displayName: DisplayName.Imp });
});

Deno.test("a locked door without a key color is rejected", async () => {
  const world = await createWorld();

  assertThrows(() => createDoor(world, { x: 1, y: 1, locked: true }), Error, "key color");
});

Deno.test("enemy archetypes apply top-down tuning defaults", async () => {
  const world = await createWorld();

  const dog = createEnemy(world, {
    x: 1,
    y: 1,
    dir: 1,
    displayName: DisplayName.DigitalDog,
    archetype: "meleeDog",
  });
  const gunslinger = createEnemy(world, {
    x: 2,
    y: 1,
    dir: 3,
    displayName: DisplayName.GigabitGunslinger,
    archetype: "gunslinger",
  });

  assertEquals(world.components.getEntityData(EnemyArchetypeComponent, dog), {
    archetype: EnemyArchetype.MeleeDog,
  });
  assertEquals(world.components.getEntityData(Health, dog), { current: 2, max: 2 });
  assertEquals(world.components.getEntityData(Attack, dog).range, 1);

  assertEquals(world.components.getEntityData(EnemyArchetypeComponent, gunslinger), {
    archetype: EnemyArchetype.Gunslinger,
  });
  assertEquals(world.components.getEntityData(Health, gunslinger), { current: 2, max: 2 });
  assertEquals(world.components.getEntityData(Attack, gunslinger).range, 4);
});
