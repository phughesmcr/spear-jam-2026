import { assertEquals, assertThrows } from "@std/assert";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import {
  Attack,
  AttackFacingRequirement,
  AttackPattern,
  Blocking,
  DecorationKind,
  Defense,
  Drawable,
  DrawableKind,
  DrawableLayer,
  Enemy,
  EnemyArchetypeComponent,
  Health,
  Item,
  Npc,
  Sprite,
  SpriteId,
} from "@/src/ecs/components.ts";
import { createEntityContentStore, entityContent } from "@/src/ecs/entity_content.ts";
import { EnemyArchetype } from "@/src/ecs/enemy_catalog.ts";
import { ExamineTextId } from "@/src/game/examine.ts";
import { DisplayName } from "@/src/game/names.ts";
import { StoryEventId, StoryTargetId } from "@/src/game/story.ts";
import { createDecoration, createDoor, createEnemy, createNpc, createUplinkTerminal } from "@/src/ecs/prefabs.ts";
import { createWorld } from "@/src/ecs/world.ts";

Deno.test("neutral NPCs and enemies share display names without sharing NPC identity", async () => {
  const world = await createWorld();
  const contentStore = createEntityContentStore();
  const npc = createNpc(world, contentStore, {
    x: 1,
    y: 1,
    dir: 1,
    displayName: DisplayName.John,
    dialogueTreeId: DialogueTreeId.JohnIntro,
  });
  const enemy = createEnemy(world, contentStore, { x: 2, y: 1, dir: 3, displayName: DisplayName.DigitalDog });

  assertEquals(world.components.entityHas(Npc, npc), true);
  assertEquals(world.components.entityHas(Enemy, npc), false);
  assertEquals(entityContent(contentStore, npc), {
    displayName: DisplayName.John,
    dialogueTreeId: DialogueTreeId.JohnIntro,
  });

  assertEquals(world.components.entityHas(Npc, enemy), false);
  assertEquals(world.components.entityHas(Enemy, enemy), true);
  assertEquals(entityContent(contentStore, enemy), { displayName: DisplayName.DigitalDog });
});

Deno.test("a locked door without a key color is rejected", async () => {
  const world = await createWorld();
  const contentStore = createEntityContentStore();

  assertThrows(() => createDoor(world, contentStore, { x: 1, y: 1, locked: true }), Error, "key color");
});

Deno.test("prefabs attach authored examine text when provided", async () => {
  const world = await createWorld();
  const contentStore = createEntityContentStore();
  const npc = createNpc(world, contentStore, {
    x: 1,
    y: 1,
    dir: 1,
    displayName: DisplayName.John,
    examineTextId: ExamineTextId.BootSectorUplinkTerminal,
  });
  const enemy = createEnemy(world, contentStore, {
    x: 2,
    y: 1,
    dir: 3,
    displayName: DisplayName.DigitalDog,
    examineTextId: ExamineTextId.BootSectorUplinkTerminal,
  });
  const door = createDoor(world, contentStore, { x: 3, y: 1, examineTextId: ExamineTextId.BootSectorUplinkTerminal });
  const terminal = createUplinkTerminal(world, contentStore, {
    x: 4,
    y: 1,
    goto: "Next Map",
    examineTextId: ExamineTextId.BootSectorUplinkTerminal,
  });

  for (const entity of [npc, enemy, door, terminal]) {
    assertEquals(entityContent(contentStore, entity)?.examineTextId, ExamineTextId.BootSectorUplinkTerminal);
  }
});

Deno.test("prefabs attach content-backed story and terminal metadata", async () => {
  const world = await createWorld();
  const contentStore = createEntityContentStore();
  const npc = createNpc(world, contentStore, {
    x: 1,
    y: 1,
    dir: 1,
    displayName: DisplayName.John,
    storyId: StoryTargetId.John,
    onTalkEvent: StoryEventId.JohnSpoken,
  });
  const terminal = createUplinkTerminal(world, contentStore, { x: 2, y: 1, goto: "Next Map" });

  assertEquals(entityContent(contentStore, npc), {
    displayName: DisplayName.John,
    storyId: StoryTargetId.John,
    onTalkEvent: StoryEventId.JohnSpoken,
  });
  assertEquals(entityContent(contentStore, terminal), {
    terminalDestination: "Next Map",
  });
});

Deno.test("content store removes empty prefab content", async () => {
  const world = await createWorld();
  const contentStore = createEntityContentStore();
  const door = createDoor(world, contentStore, { x: 1, y: 1 });

  assertEquals(entityContent(contentStore, door), undefined);
});

Deno.test("decorations spawn as non-blocking structure sprites", async () => {
  const world = await createWorld();
  const decoration = createDecoration(world, {
    x: 1,
    y: 1,
    decoration: DecorationKind.ServerPile,
  });

  assertEquals(world.components.getEntityData(Drawable, decoration), {
    kind: DrawableKind.Sprite,
    layer: DrawableLayer.Structure,
  });
  assertEquals(world.components.getEntityData(Sprite, decoration), { id: SpriteId.DecorServerPile });
  assertEquals(world.components.entityHas(Blocking, decoration), false);
  assertEquals(world.components.entityHas(Item, decoration), false);
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
    const contentStore = createEntityContentStore();
    const entity = createEnemy(world, contentStore, {
      x: 1,
      y: 1,
      dir: 1,
      archetype: expected.archetype,
    });
    const attack = world.components.getEntityData(Attack, entity);

    assertEquals(entityContent(contentStore, entity)?.displayName, expected.displayName);
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
