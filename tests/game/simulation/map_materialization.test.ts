import type { EntityDef } from "@/src/game/content/map_entities.ts";
import { KeyColor } from "@/src/game/content/map_entities.ts";
import { DialogueTreeId } from "@/src/game/content/dialogue/trees.ts";
import { ExamineTextId } from "@/src/game/content/examine_text.ts";
import { ItemKind } from "@/src/game/content/items.ts";
import { DisplayName } from "@/src/game/content/names.ts";
import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { StoryEventId, StoryTargetId } from "@/src/game/content/story.ts";
import { DrawableKind } from "@/src/game/model/render_snapshot.ts";
import { SoundId } from "@/src/game/model/sound.ts";
import {
  AttackPattern,
  AttackTargetMode,
  DrawableLayer,
  GAME_COMPONENTS,
  type GameComponentMap,
} from "@/src/game/simulation/components.ts";
import { materializeMap } from "@/src/game/simulation/map_materialization.ts";
import { Direction } from "turn-based-engine/crawler";
import { createGameMap, doorSlideCode } from "@/src/game/world/map.ts";
import { DEFAULT_WALL_TERRAIN_ID } from "@/src/game/world/terrain_palette.ts";
import { flatTestMap } from "@/tests/game/simulation/helpers.ts";
import { assertEquals, assertNotStrictEquals, assertThrows } from "@std/assert";
import { type CrawlerSpawnSpec, createCrawlerSimulation, TerrainBlock } from "turn-based-engine/crawler";

const MIXED_ENTITIES = [
  { prefab: "key", x: 1, y: 0, color: KeyColor.Red },
  { prefab: "player", x: 0, y: 0, dir: Direction.East },
  {
    prefab: "npc",
    x: 2,
    y: 0,
    dir: Direction.West,
    displayName: DisplayName.John,
    dialogueTreeId: DialogueTreeId.JohnIntro,
    examineTextId: ExamineTextId.BootSectorUplinkTerminal,
    storyId: StoryTargetId.John,
    onTalkEvent: StoryEventId.JohnSpoken,
  },
  { prefab: "enemy", x: 3, y: 0, dir: Direction.West, archetype: "meleeDog" },
  { prefab: "door", x: 4, y: 0, locked: true, color: KeyColor.Blue, secret: true },
  { prefab: "uplinkCode", x: 5, y: 0 },
  { prefab: "uplinkTerminal", x: 6, y: 0, goto: "Data Conduit", requiresSpear: true },
  { prefab: "weaponPickup", x: 7, y: 0, slot: 2 },
  { prefab: "item", x: 8, y: 0, item: "healthPatch", amount: 3 },
  { prefab: "decoration", x: 9, y: 0, decoration: "mainframeCore" },
  { prefab: "light", x: 10, y: 0, color: "#123456", radius: 4 },
  { prefab: "sound", x: 11, y: 0, soundId: SoundId.AmbientHum, radius: 5 },
  { prefab: "spearPickup", x: 12, y: 0 },
  { prefab: "spearTurret", x: 13, y: 0 },
] as const satisfies readonly EntityDef[];

Deno.test("materializeMap translates every authored prefab into exact crawler specs", () => {
  const result = materializeMap(flatTestMap(14, 1, MIXED_ENTITIES), SHIPPED_GAME);
  const dog = SHIPPED_GAME.simulation.enemyForKey("meleeDog");
  const expected = [
    {
      x: 0,
      y: 0,
      facing: Direction.East,
      blockMask: TerrainBlock.Movement,
      visionRadius: 6,
      stableId: 1,
      components: {
        Player: {},
        TurnTaker: {},
        Drawable: { kind: DrawableKind.Player, layer: DrawableLayer.Player },
        Sprite: { id: SpriteId.Player },
        Health: { current: 10, max: 10 },
        PlayerInventory: { keyMask: 0, hasUplinkCode: 0, hasSpear: 0, pistolAmmo: 0, cannonAmmo: 0 },
        PlayerEquipment: { selectedWeapon: 1, unlockedWeaponMask: 2 },
        PlayerProgress: { credits: 0, score: 0, xp: 0, levelCredits: 0 },
        StoryFlags: { mask: 0 },
        Defense: { hitDc: 10 },
      },
    },
    {
      x: 1,
      y: 0,
      components: {
        Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Item },
        Sprite: { id: SHIPPED_GAME.presentation.spriteForItem(ItemKind.Key, 1) },
        Item: { kind: ItemKind.Key, value: 1 },
      },
    },
    {
      x: 2,
      y: 0,
      facing: Direction.West,
      blockMask: TerrainBlock.Movement,
      components: {
        Npc: {},
        Interactable: {},
        Drawable: { kind: DrawableKind.Actor, layer: DrawableLayer.Npc },
        Sprite: { id: SHIPPED_GAME.presentation.spriteForDisplayName(DisplayName.John) },
        DisplayName: { displayName: SHIPPED_GAME.simulation.displayNameCode(DisplayName.John) },
        DialogueTreeRef: { dialogueTreeId: SHIPPED_GAME.dialogue.code(DialogueTreeId.JohnIntro) },
        ExamineTextRef: {
          examineTextId: SHIPPED_GAME.simulation.examineTextCode(ExamineTextId.BootSectorUplinkTerminal),
        },
        StoryTarget: { storyId: SHIPPED_GAME.simulation.storyTargetCode(StoryTargetId.John) },
        OnTalkEvent: { onTalkEvent: SHIPPED_GAME.simulation.storyEventCode(StoryEventId.JohnSpoken) },
      },
    },
    {
      x: 3,
      y: 0,
      facing: Direction.West,
      blockMask: TerrainBlock.Movement,
      components: {
        Enemy: {},
        TurnTaker: {},
        EnemyAwareness: { state: 0, lastKnownX: -1, lastKnownY: -1, turnsSinceSeen: 0 },
        EnemyArchetype: { archetype: dog.code },
        Health: { current: dog.definition.health, max: dog.definition.health },
        Defense: { hitDc: dog.definition.hitDc },
        Attack: { ...dog.definition.attack, minDamage: dog.definition.damage, maxDamage: dog.definition.damage },
        Drawable: { kind: DrawableKind.Actor, layer: DrawableLayer.Enemy },
        Sprite: { id: dog.sprite },
        DisplayName: { displayName: SHIPPED_GAME.simulation.displayNameCode(dog.definition.displayName) },
      },
    },
    {
      x: 4,
      y: 0,
      blockMask: TerrainBlock.Movement | TerrainBlock.Sight | TerrainBlock.EffectLine,
      components: {
        Drawable: { kind: DrawableKind.Door, layer: DrawableLayer.Structure },
        Door: { open: 0, slide: 0, openMs: 0 },
        Interactable: {},
        Locked: { color: 2 },
        Secret: {},
      },
    },
    {
      x: 5,
      y: 0,
      components: {
        Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Item },
        Sprite: { id: SHIPPED_GAME.presentation.spriteForItem(ItemKind.UplinkCode, 0) },
        Item: { kind: ItemKind.UplinkCode, value: 0 },
      },
    },
    {
      x: 6,
      y: 0,
      blockMask: TerrainBlock.Movement,
      components: {
        Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure },
        Sprite: { id: SpriteId.UplinkTerminal },
        UplinkTerminal: { requiresSpear: 1 },
        Interactable: {},
        TerminalDestination: { destination: SHIPPED_GAME.levels.codeForDestination("Data Conduit") },
      },
    },
    {
      x: 7,
      y: 0,
      components: {
        Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Item },
        Sprite: { id: SHIPPED_GAME.presentation.spriteForItem(ItemKind.Weapon, 2) },
        Item: { kind: ItemKind.Weapon, value: 2 },
      },
    },
    {
      x: 8,
      y: 0,
      components: {
        Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Item },
        Sprite: { id: SHIPPED_GAME.presentation.spriteForItem(ItemKind.HealthPatch, 3) },
        Item: { kind: ItemKind.HealthPatch, value: 3 },
      },
    },
    {
      x: 9,
      y: 0,
      components: {
        Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure },
        Sprite: { id: SpriteId.MainframeCore },
      },
    },
    {
      x: 10,
      y: 0,
      components: {
        LightEmitter: { red: 0x12, green: 0x34, blue: 0x56, radius: 4, flickerAmount: 0, flickerSpeed: 0 },
      },
    },
    {
      x: 11,
      y: 0,
      components: {
        SoundEmitter: { soundId: SHIPPED_GAME.audio.soundCode(SoundId.AmbientHum), radius: 5, volume: 1 },
      },
    },
    {
      x: 12,
      y: 0,
      components: {
        Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Item },
        Sprite: { id: SHIPPED_GAME.presentation.spriteForItem(ItemKind.Spear, 0) },
        Item: { kind: ItemKind.Spear, value: 0 },
      },
    },
    {
      x: 13,
      y: 0,
      blockMask: TerrainBlock.Movement,
      components: {
        Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure },
        Sprite: { id: SpriteId.SpearTurret },
        SpearTurret: {},
        Interactable: {},
      },
    },
  ] satisfies readonly CrawlerSpawnSpec<GameComponentMap>[];

  assertEquals(result.entities, expected);
  const byX = new Map(result.entities.map((entity) => [entity.x, entity]));
  const player = byX.get(0)!;
  const key = byX.get(1)!;
  const npc = byX.get(2)!;
  const enemy = byX.get(3)!;
  const door = byX.get(4)!;
  const code = byX.get(5)!;
  const terminal = byX.get(6)!;
  const weapon = byX.get(7)!;
  const item = byX.get(8)!;
  const decoration = byX.get(9)!;
  const light = byX.get(10)!;
  const sound = byX.get(11)!;
  const spear = byX.get(12)!;
  const turret = byX.get(13)!;

  assertEquals(result.mapId, "Test Map");
  assertEquals(result.playerStableId, 1);
  assertEquals(result.entities.length, MIXED_ENTITIES.length);
  assertEquals(player.stableId, 1);
  assertEquals(player.facing, Direction.East);
  assertEquals(player.visionRadius, 6);
  assertEquals(player.blockMask, TerrainBlock.Movement);
  assertEquals(player.components?.Health, { current: 10, max: 10 });
  assertEquals(player.components?.PlayerInventory, {
    keyMask: 0,
    hasUplinkCode: 0,
    hasSpear: 0,
    pistolAmmo: 0,
    cannonAmmo: 0,
  });
  assertEquals(player.components?.Defense, { hitDc: 10 });

  assertEquals(key.components?.Item, { kind: ItemKind.Key, value: 1 });
  assertEquals(key.blockMask, undefined);
  assertEquals(npc.blockMask, TerrainBlock.Movement);
  assertEquals(npc.components?.Drawable, { kind: DrawableKind.Actor, layer: DrawableLayer.Npc });
  assertEquals(npc.components?.DialogueTreeRef, {
    dialogueTreeId: SHIPPED_GAME.dialogue.code(DialogueTreeId.JohnIntro),
  });
  assertEquals(npc.components?.ExamineTextRef, {
    examineTextId: SHIPPED_GAME.simulation.examineTextCode(ExamineTextId.BootSectorUplinkTerminal),
  });
  assertEquals(npc.components?.StoryTarget, { storyId: SHIPPED_GAME.simulation.storyTargetCode(StoryTargetId.John) });
  assertEquals(npc.components?.OnTalkEvent, {
    onTalkEvent: SHIPPED_GAME.simulation.storyEventCode(StoryEventId.JohnSpoken),
  });

  assertEquals(enemy.blockMask, TerrainBlock.Movement);
  assertEquals(enemy.components?.EnemyArchetype, { archetype: dog.code });
  assertEquals(enemy.components?.Health, { current: dog.definition.health, max: dog.definition.health });
  assertEquals(enemy.components?.Attack?.minDamage, dog.definition.damage);
  assertEquals(enemy.components?.Sprite, { id: dog.sprite });

  assertEquals(door.blockMask, TerrainBlock.Movement | TerrainBlock.Sight | TerrainBlock.EffectLine);
  assertEquals(door.components?.Door, { open: 0, slide: 0, openMs: 0 });
  assertEquals(door.components?.Locked, { color: 2 });
  assertEquals(door.components?.Secret, {});
  assertEquals(code.components?.Item, { kind: ItemKind.UplinkCode, value: 0 });
  assertEquals(terminal.blockMask, TerrainBlock.Movement);
  assertEquals(terminal.components?.Sprite, { id: SpriteId.UplinkTerminal });
  assertEquals(terminal.components?.UplinkTerminal, { requiresSpear: 1 });
  assertEquals(terminal.components?.TerminalDestination, {
    destination: SHIPPED_GAME.levels.codeForDestination("Data Conduit"),
  });
  assertEquals(weapon.components?.Item, { kind: ItemKind.Weapon, value: 2 });
  assertEquals(item.components?.Item, { kind: ItemKind.HealthPatch, value: 3 });
  assertEquals(decoration.components?.Sprite, { id: SpriteId.MainframeCore });
  assertEquals(light.components?.LightEmitter, {
    red: 0x12,
    green: 0x34,
    blue: 0x56,
    radius: 4,
    flickerAmount: 0,
    flickerSpeed: 0,
  });
  assertEquals(sound.components?.SoundEmitter, {
    soundId: SHIPPED_GAME.audio.soundCode(SoundId.AmbientHum),
    radius: 5,
    volume: 1,
  });
  assertEquals(spear.components?.Item, { kind: ItemKind.Spear, value: 0 });
  assertEquals(turret.blockMask, TerrainBlock.Movement);
  assertEquals(turret.components?.Sprite, { id: SpriteId.SpearTurret });
  assertEquals(turret.components?.SpearTurret, {});
});

Deno.test("materializeMap puts the player first and preserves remaining authored order", () => {
  const result = materializeMap(flatTestMap(14, 1, MIXED_ENTITIES), SHIPPED_GAME);
  assertEquals(result.entities.map((entity) => entity.x), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assertEquals(result.entities.map((entity) => entity.stableId), [1, ...Array.from({ length: 13 }, () => undefined)]);
});

Deno.test("materializeMap preserves authored override and optional-component branches", () => {
  const result = materializeMap(
    flatTestMap(5, 1, [
      { prefab: "player", x: 0, y: 0, dir: Direction.East },
      {
        prefab: "enemy",
        x: 1,
        y: 0,
        dir: Direction.South,
        displayName: DisplayName.John,
        health: 7,
        hitDc: 15,
        damage: 4,
        attack: {
          minDamage: 2,
          maxDamage: 6,
          range: 3,
          attackBonus: -1,
          critThreshold: 19,
          critMultiplier: 3,
          pattern: "adjacent",
          targets: "all",
        },
        examineTextId: ExamineTextId.BootSectorUplinkTerminal,
      },
      {
        prefab: "door",
        x: 2,
        y: 0,
        glass: true,
        slide: "up",
        openMs: 600,
        examineTextId: ExamineTextId.BootSectorUplinkTerminal,
      },
      { prefab: "light", x: 3, y: 0, color: "#abcdef", radius: 6, flickerAmount: 0.5, flickerSpeed: 7 },
      { prefab: "sound", x: 4, y: 0, soundId: SoundId.AmbientHum, radius: 3, volume: 0.5 },
    ]),
    SHIPPED_GAME,
  );
  const defaultEnemy = SHIPPED_GAME.simulation.enemyForCode(SHIPPED_GAME.simulation.defaultEnemy);

  assertEquals(result.entities[1], {
    x: 1,
    y: 0,
    facing: Direction.South,
    blockMask: TerrainBlock.Movement,
    components: {
      Enemy: {},
      TurnTaker: {},
      EnemyAwareness: { state: 0, lastKnownX: -1, lastKnownY: -1, turnsSinceSeen: 0 },
      EnemyArchetype: { archetype: defaultEnemy.code },
      Health: { current: 7, max: 7 },
      Defense: { hitDc: 15 },
      Attack: {
        minDamage: 2,
        maxDamage: 6,
        range: 3,
        attackBonus: -1,
        critThreshold: 19,
        critMultiplier: 3,
        pattern: AttackPattern.Adjacent,
        targets: AttackTargetMode.All,
      },
      Drawable: { kind: DrawableKind.Actor, layer: DrawableLayer.Enemy },
      Sprite: { id: defaultEnemy.sprite },
      DisplayName: { displayName: SHIPPED_GAME.simulation.displayNameCode(DisplayName.John) },
      ExamineTextRef: {
        examineTextId: SHIPPED_GAME.simulation.examineTextCode(ExamineTextId.BootSectorUplinkTerminal),
      },
    },
  });
  assertEquals(result.entities[2], {
    x: 2,
    y: 0,
    blockMask: TerrainBlock.Movement | TerrainBlock.EffectLine,
    components: {
      Drawable: { kind: DrawableKind.Door, layer: DrawableLayer.Structure },
      Door: { open: 0, slide: doorSlideCode("up"), openMs: 600 },
      Interactable: {},
      ExamineTextRef: {
        examineTextId: SHIPPED_GAME.simulation.examineTextCode(ExamineTextId.BootSectorUplinkTerminal),
      },
      Glass: {},
    },
  });
  assertEquals(result.entities[3], {
    x: 3,
    y: 0,
    components: {
      LightEmitter: { red: 0xab, green: 0xcd, blue: 0xef, radius: 6, flickerAmount: 0.5, flickerSpeed: 7 },
    },
  });
  assertEquals(result.entities[4], {
    x: 4,
    y: 0,
    components: {
      SoundEmitter: { soundId: SHIPPED_GAME.audio.soundCode(SoundId.AmbientHum), radius: 3, volume: 0.5 },
    },
  });
});

Deno.test("materializeMap requires exactly one player", () => {
  assertThrows(
    () => materializeMap(flatTestMap(), SHIPPED_GAME),
    Error,
    'Map "Test Map" must contain exactly one player; found 0.',
  );
  assertThrows(
    () =>
      materializeMap(
        flatTestMap(2, 1, [
          { prefab: "player", x: 0, y: 0, dir: Direction.East },
          { prefab: "player", x: 1, y: 0, dir: Direction.West },
        ]),
        SHIPPED_GAME,
      ),
    Error,
    'Map "Test Map" must contain exactly one player; found 2.',
  );
});

Deno.test("materializations retain fresh payloads without mutating authored input", () => {
  const map = flatTestMap(14, 1, MIXED_ENTITIES);
  const before = structuredClone(map);
  const first = materializeMap(map, SHIPPED_GAME);
  const second = materializeMap(map, SHIPPED_GAME);

  assertEquals(map, before);
  assertEquals(first.entities, second.entities);
  assertNotStrictEquals(first.entities, second.entities);
  assertNotStrictEquals(first.entities[0]?.components, second.entities[0]?.components);
  assertNotStrictEquals(first.entities[0]?.components?.Health, second.entities[0]?.components?.Health);
  assertNotStrictEquals(first.entities[3]?.components?.EnemyAwareness, second.entities[3]?.components?.EnemyAwareness);
});

Deno.test("materializeMap preserves locked-door and terrain validation", () => {
  assertThrows(
    () =>
      materializeMap(
        flatTestMap(2, 1, [
          { prefab: "player", x: 0, y: 0, dir: Direction.East },
          { prefab: "door", x: 1, y: 0, locked: true },
        ]),
        SHIPPED_GAME,
      ),
    Error,
    "Locked door prefab is missing a key color",
  );

  const blocked = createGameMap("Blocked Door", [[0, DEFAULT_WALL_TERRAIN_ID]], [
    { prefab: "player", x: 0, y: 0, dir: Direction.East },
    { prefab: "door", x: 1, y: 0 },
  ]);
  assertThrows(
    () => materializeMap(blocked, SHIPPED_GAME),
    Error,
    'Door at (1,0) in map "Blocked Door" must be authored on open terrain.',
  );
});

Deno.test("every shipped map materializes into a deterministic coherent crawler world", () => {
  for (const level of SHIPPED_GAME.levels.all) {
    const materialization = materializeMap(level.map, SHIPPED_GAME);
    const simulation = createCrawlerSimulation({
      capacity: 1000,
      map: materialization.map,
      mapId: materialization.mapId,
      entities: materialization.entities,
      components: GAME_COMPONENTS,
      distanceMetric: "euclidean",
      rng: 0,
    });
    const crawler = simulation.crawler;

    assertEquals(materialization.entities.length, level.map.entities.length, level.map.name);
    assertEquals(crawler.entities().length, level.map.entities.length, level.map.name);
    assertEquals(
      crawler.entities().map((entity) => crawler.entityStableId(entity)),
      Array.from({ length: level.map.entities.length }, (_, index) => index + 1),
      level.map.name,
    );
    assertEquals(crawler.entityForStableId(materialization.playerStableId), crawler.entities()[0], level.map.name);
    crawler.assertInvariants();
  }
});

Deno.test("batch bootstrap does not discover tiles hidden behind an initially closed door", () => {
  const map = flatTestMap(5, 3, [
    { prefab: "player", x: 1, y: 1, dir: Direction.East },
    { prefab: "door", x: 2, y: 1 },
  ]);
  const materialization = materializeMap(map, SHIPPED_GAME);
  const simulation = createCrawlerSimulation({
    map: materialization.map,
    entities: materialization.entities,
    components: GAME_COMPONENTS,
    rng: 0,
  });
  const player = simulation.crawler.entityForStableId(materialization.playerStableId)!;

  assertEquals(simulation.crawler.isVisibleTo(player, 3, 1), false);
  assertEquals(simulation.crawler.isDiscoveredBy(player, 3, 1), false);
});
