import { assertEquals, assertThrows } from "@std/assert";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import {
  Attack,
  AttackFacingRequirement,
  AttackPattern,
  Blocking,
  Defense,
  DialogueTreeRef,
  DisplayNameComponent,
  Drawable,
  DrawableKind,
  DrawableLayer,
  Enemy,
  EnemyArchetypeComponent,
  ExamineTextRef,
  Health,
  Interactable,
  Item,
  Npc,
  OnTalkEvent,
  SoundEmitter,
  Sprite,
  SpriteId,
  StoryTarget,
  TerminalDestination,
} from "@/src/ecs/components.ts";
import { EnemyArchetype } from "@/src/ecs/enemy_catalog.ts";
import { dialogueTreeCode } from "@/src/dialogue/dialogue.ts";
import { ExamineTextId } from "@/src/game/examine.ts";
import { examineTextCode } from "@/src/game/examine_content.ts";
import { DisplayName, displayNameCode } from "@/src/game/names.ts";
import { SoundId, soundIdCode } from "@/src/game/sound.ts";
import { storyEventCode, StoryEventId, storyTargetCode, StoryTargetId } from "@/src/game/story.ts";
import {
  createDecoration,
  createDoor,
  createEnemy,
  createNpc,
  createSound,
  createUplinkTerminal,
} from "@/src/ecs/prefabs.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { terminalDestinationCode } from "@/src/map/map.ts";

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
  assertEquals(world.components.entityHas(Enemy, npc), false);
  assertEquals(world.components.getEntityData(DisplayNameComponent, npc), {
    displayName: displayNameCode(DisplayName.John),
  });
  assertEquals(world.components.getEntityData(DialogueTreeRef, npc), {
    dialogueTreeId: dialogueTreeCode(DialogueTreeId.JohnIntro),
  });

  assertEquals(world.components.entityHas(Npc, enemy), false);
  assertEquals(world.components.entityHas(Enemy, enemy), true);
  assertEquals(world.components.getEntityData(DisplayNameComponent, enemy), {
    displayName: displayNameCode(DisplayName.DigitalDog),
  });
});

Deno.test("a locked door without a key color is rejected", async () => {
  const world = await createWorld();

  assertThrows(() => createDoor(world, { x: 1, y: 1, locked: true }), Error, "key color");
});

Deno.test("doors are interactable structure entities without blocking occupancy", async () => {
  const world = await createWorld();
  const door = createDoor(world, { x: 1, y: 1 });

  assertEquals(world.components.entityHas(Interactable, door), true);
  assertEquals(world.components.entityHas(Blocking, door), false);
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
    assertEquals(world.components.getEntityData(ExamineTextRef, entity), {
      examineTextId: examineTextCode(ExamineTextId.BootSectorUplinkTerminal),
    });
  }
});

Deno.test("prefabs attach story and terminal metadata components", async () => {
  const world = await createWorld();
  const npc = createNpc(world, {
    x: 1,
    y: 1,
    dir: 1,
    displayName: DisplayName.John,
    storyId: StoryTargetId.John,
    onTalkEvent: StoryEventId.JohnSpoken,
  });
  const terminal = createUplinkTerminal(world, { x: 2, y: 1, goto: "Next Map" });

  assertEquals(world.components.getEntityData(DisplayNameComponent, npc), {
    displayName: displayNameCode(DisplayName.John),
  });
  assertEquals(world.components.getEntityData(StoryTarget, npc), {
    storyId: storyTargetCode(StoryTargetId.John),
  });
  assertEquals(world.components.getEntityData(OnTalkEvent, npc), {
    onTalkEvent: storyEventCode(StoryEventId.JohnSpoken),
  });
  assertEquals(world.components.getEntityData(TerminalDestination, terminal), {
    destination: terminalDestinationCode("Next Map"),
  });
});

Deno.test("prefabs omit optional metadata components when content is absent", async () => {
  const world = await createWorld();
  const door = createDoor(world, { x: 1, y: 1 });

  assertEquals(world.components.readEntityData(ExamineTextRef, door), undefined);
});

Deno.test("decorations spawn as non-blocking structure sprites", async () => {
  const world = await createWorld();
  const decoration = createDecoration(world, {
    x: 1,
    y: 1,
    decoration: "serverPile",
  });

  assertEquals(world.components.getEntityData(Drawable, decoration), {
    kind: DrawableKind.Sprite,
    layer: DrawableLayer.Structure,
  });
  assertEquals(world.components.getEntityData(Sprite, decoration), { id: SpriteId.DecorServerPile });
  assertEquals(world.components.entityHas(Blocking, decoration), false);
  assertEquals(world.components.entityHas(Item, decoration), false);
});

Deno.test("sound prefabs attach positional sound emitter metadata", async () => {
  const world = await createWorld();
  const sound = createSound(world, {
    x: 1,
    y: 2,
    soundId: SoundId.AmbientHum,
    radius: 6,
    volume: 0.5,
  });

  assertEquals(world.components.getEntityData(SoundEmitter, sound), {
    soundId: soundIdCode(SoundId.AmbientHum),
    radius: 6,
    volume: 0.5,
  });
});

Deno.test("enemy archetypes apply top-down tuning defaults", async () => {
  const world = await createWorld();

  const cases = [
    {
      archetype: "meleeDog",
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
      archetype: "gunslinger",
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
      archetype: "networkNeophyte",
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
      archetype: "systemSentinel",
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
      archetype: "agenticAcolyte",
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
      displayName: displayNameCode(expected.displayName),
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
