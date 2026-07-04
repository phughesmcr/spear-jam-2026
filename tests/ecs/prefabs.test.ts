import { assertEquals, assertThrows } from "@std/assert";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import {
  Attack,
  AttackFacingRequirement,
  AttackPattern,
  Defense,
  Dialogue,
  DisplayNameComponent,
  Enemy,
  EnemyArchetypeComponent,
  Examine,
  Health,
  Npc,
} from "@/src/ecs/components.ts";
import { EnemyArchetype } from "@/src/ecs/enemy_catalog.ts";
import { ExamineTextId } from "@/src/game/examine.ts";
import { DisplayName } from "@/src/game/names.ts";
import { createDoor, createEnemy, createNpc, createUplinkTerminal } from "@/src/ecs/prefabs.ts";
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
  const enemy = createEnemy(world, { x: 2, y: 1, dir: 3, displayName: DisplayName.DigitalDog });

  assertEquals(world.components.entityHas(Npc, npc), true);
  assertEquals(world.components.entityHas(Dialogue, npc), true);
  assertEquals(world.components.entityHas(Enemy, npc), false);
  assertEquals(world.components.getEntityData(DisplayNameComponent, npc), { displayName: DisplayName.John });
  assertEquals(world.components.getEntityData(Dialogue, npc), { dialogueTreeId: DialogueTreeId.JohnIntro });

  assertEquals(world.components.entityHas(Npc, enemy), false);
  assertEquals(world.components.entityHas(Dialogue, enemy), false);
  assertEquals(world.components.entityHas(Enemy, enemy), true);
  assertEquals(world.components.getEntityData(DisplayNameComponent, enemy), { displayName: DisplayName.DigitalDog });
});

Deno.test("a locked door without a key color is rejected", async () => {
  const world = await createWorld();

  assertThrows(() => createDoor(world, { x: 1, y: 1, locked: true }), Error, "key color");
});

Deno.test("prefabs attach authored examine text when provided", async () => {
  const world = await createWorld();
  const npc = createNpc(world, {
    x: 1,
    y: 1,
    dir: 1,
    displayName: DisplayName.John,
    examineTextId: ExamineTextId.BootSectorUplinkTerminal,
  });
  const enemy = createEnemy(world, {
    x: 2,
    y: 1,
    dir: 3,
    displayName: DisplayName.DigitalDog,
    examineTextId: ExamineTextId.BootSectorUplinkTerminal,
  });
  const door = createDoor(world, { x: 3, y: 1, examineTextId: ExamineTextId.BootSectorUplinkTerminal });
  const terminal = createUplinkTerminal(world, {
    x: 4,
    y: 1,
    goto: "Next Map",
    examineTextId: ExamineTextId.BootSectorUplinkTerminal,
  });

  for (const entity of [npc, enemy, door, terminal]) {
    assertEquals(world.components.getEntityData(Examine, entity), {
      examineTextId: ExamineTextId.BootSectorUplinkTerminal,
    });
  }
});

Deno.test("enemy archetypes apply top-down tuning defaults", async () => {
  const world = await createWorld();

  const cases = [
    {
      archetype: EnemyArchetype.MeleeDog,
      displayName: DisplayName.DigitalDog,
      code: EnemyArchetype.MeleeDog,
      health: 2,
      hitDc: 10,
      damage: 1,
      range: 1,
      pattern: AttackPattern.Line,
      requiresFacing: AttackFacingRequirement.Required,
    },
    {
      archetype: EnemyArchetype.Gunslinger,
      displayName: DisplayName.GigabitGunslinger,
      code: EnemyArchetype.Gunslinger,
      health: 2,
      hitDc: 10,
      damage: 1,
      range: 4,
      pattern: AttackPattern.Line,
      requiresFacing: AttackFacingRequirement.Required,
    },
    {
      archetype: EnemyArchetype.NetworkNeophyte,
      displayName: DisplayName.NetworkNeophyte,
      code: EnemyArchetype.NetworkNeophyte,
      health: 3,
      hitDc: 10,
      damage: 1,
      range: 1,
      pattern: AttackPattern.Line,
      requiresFacing: AttackFacingRequirement.Required,
    },
    {
      archetype: EnemyArchetype.SystemSentinel,
      displayName: DisplayName.SystemSentinel,
      code: EnemyArchetype.SystemSentinel,
      health: 7,
      hitDc: 10,
      damage: 2,
      range: 1,
      pattern: AttackPattern.Line,
      requiresFacing: AttackFacingRequirement.Required,
    },
    {
      archetype: EnemyArchetype.AgenticAcolyte,
      displayName: DisplayName.AgenticAcolyte,
      code: EnemyArchetype.AgenticAcolyte,
      health: 4,
      hitDc: 10,
      damage: 2,
      range: 2,
      pattern: AttackPattern.Adjacent,
      requiresFacing: AttackFacingRequirement.None,
    },
  ] as const;

  for (const expected of cases) {
    const entity = createEnemy(world, {
      x: 1,
      y: 1,
      dir: 1,
      archetype: expected.archetype,
    });
    const attack = world.components.getEntityData(Attack, entity);

    assertEquals(world.components.getEntityData(DisplayNameComponent, entity), {
      displayName: expected.displayName,
    });
    assertEquals(world.components.getEntityData(EnemyArchetypeComponent, entity), {
      archetype: expected.code,
    });
    assertEquals(world.components.getEntityData(Health, entity), {
      current: expected.health,
      max: expected.health,
    });
    assertEquals(world.components.getEntityData(Defense, entity), {
      hitDc: expected.hitDc,
    });
    assertEquals(attack.minDamage, expected.damage);
    assertEquals(attack.maxDamage, expected.damage);
    assertEquals(attack.range, expected.range);
    assertEquals(attack.pattern, expected.pattern);
    assertEquals(attack.requiresFacing, expected.requiresFacing);
  }
});
