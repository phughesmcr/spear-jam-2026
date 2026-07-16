import { type MusicTrack, TrackId } from "@/src/game/content/audio/music.ts";
import type { SoundCatalogEntry } from "@/src/game/content/audio/sounds.ts";
import { compileGameCatalog, type GameCatalogSource } from "@/src/game/content/catalog.ts";
import { DIALOGUE_TREE_IDS, type DialogueTreeId } from "@/src/game/content/dialogue/trees.ts";
import { VOICE_IDS } from "@/src/game/content/dialogue/voices.ts";
import { ENEMY_ARCHETYPE_KEYS, type EnemyArchetypeKey } from "@/src/game/content/enemies.ts";
import { EXAMINE_TEXT_IDS } from "@/src/game/content/examine_text.ts";
import {
  ITEM_KIND_CODES,
  ItemKind,
  MapItemKind,
  type MapItemKind as MapItemKindType,
} from "@/src/game/content/items.ts";
import { DECORATION_KINDS, KEY_COLORS } from "@/src/game/content/map_entities.ts";
import { DISPLAY_NAME_IDS, type DisplayName } from "@/src/game/content/names.ts";
import { SpriteId, type SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import { STORY_EVENT_IDS, STORY_TARGET_IDS, type StoryEventDefinition } from "@/src/game/content/story.ts";
import type { TopDownSpriteAppearance } from "@/src/game/content/sprites.ts";
import type { PlayerWeaponSpec } from "@/src/game/content/weapons.ts";
import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import { AttackPattern, AttackTargetMode } from "@/src/game/model/attack.ts";
import { SOUND_IDS } from "@/src/game/model/sound.ts";
import { assert, assertEquals, assertNotStrictEquals, assertStrictEquals, assertThrows } from "@std/assert";

const TRACK_IDS = Object.values(TrackId);
const SPRITE_IDS = Object.values(SpriteId);
const FIXED_ITEM_KINDS = [
  ItemKind.HealthPatch,
  ItemKind.PistolAmmo,
  ItemKind.CannonAmmo,
  ItemKind.UplinkCode,
  ItemKind.Spear,
] as const;
const PICKUP_WEAPON_SLOTS = [2, 3] as const;
const COMMAND_SLOTS = [1, 2, 3] as const;

type FixtureEnemy = GameCatalogSource["simulation"]["enemies"][EnemyArchetypeKey];

Deno.test("shipped game publishes stable level identity and exact music coverage", () => {
  assertEquals(SHIPPED_GAME.levels.start.map.name, "Boot Sector");
  assertStrictEquals(SHIPPED_GAME.levels.start, SHIPPED_GAME.levels.get("Boot Sector"));
  assertStrictEquals(SHIPPED_GAME.levels.start, SHIPPED_GAME.levels.all[0]);
  assertEquals(
    SHIPPED_GAME.levels.all.map((level) => [level.map.name, level.music]),
    [
      ["Boot Sector", TrackId.Map1],
      ["Data Conduit", TrackId.Map2],
      ["Firewall", TrackId.Map3],
      ["The Nexus", TrackId.Map4],
      ["Mainframe Core", TrackId.Map5],
    ],
  );
});

Deno.test("shipped level destinations preserve campaign identity and code order", () => {
  assertEquals(SHIPPED_GAME.levels.codeForDestination("victory"), 1);
  for (const [index, level] of SHIPPED_GAME.levels.all.entries()) {
    const code = SHIPPED_GAME.levels.codeForDestination(level.map.name);
    assertEquals(code, index + 2);
    const destination = SHIPPED_GAME.levels.destinationForCode(code);
    assertEquals(destination.kind, "level");
    if (destination.kind === "level") assertStrictEquals(destination.level, level);
  }
  assertEquals(SHIPPED_GAME.levels.destinationForCode(1), { kind: "victory" });
});

Deno.test("separately compiled catalogs isolate every projection", () => {
  const first = compileGameCatalog(sourceFor("First Start", "First Exit", "first", "#111111"));
  const second = compileGameCatalog(sourceFor("Second Start", "Second Exit", "second", "#222222"));

  assertNotStrictEquals(first, second);
  assertNotStrictEquals(first.levels, second.levels);
  assertNotStrictEquals(first.simulation, second.simulation);
  assertNotStrictEquals(first.dialogue, second.dialogue);
  assertNotStrictEquals(first.audio, second.audio);
  assertNotStrictEquals(first.presentation, second.presentation);
  assertNotStrictEquals(first.levels.start.map, second.levels.start.map);

  const displayName = DISPLAY_NAME_IDS[0];
  const dialogueTree = DIALOGUE_TREE_IDS[0];
  assertEquals(first.levels.start.map.name, "First Start");
  assertEquals(second.levels.start.map.name, "Second Start");
  assertEquals(first.simulation.displayNameForCode(first.simulation.displayNameCode(displayName)).text, "first:john");
  assertEquals(
    second.simulation.displayNameForCode(second.simulation.displayNameCode(displayName)).text,
    "second:john",
  );
  assertEquals(first.dialogue.start(dialogueTree).node.text, "first:dialogue:johnIntro");
  assertEquals(second.dialogue.start(dialogueTree).node.text, "second:dialogue:johnIntro");
  assertEquals(first.audio.track(TrackId.Title).src, "/first/audio/title.ogg");
  assertEquals(second.audio.track(TrackId.Title).src, "/second/audio/title.ogg");
  assertEquals(first.presentation.appearance(SpriteId.Player).color, "#111111");
  assertEquals(second.presentation.appearance(SpriteId.Player).color, "#222222");
});

Deno.test("catalog compilation snapshots plain source data before publication", () => {
  const source = sourceFor("Stable Start", "Stable Exit", "stable", "#123456");
  const catalog = compileGameCatalog(source);
  const enemyKey = ENEMY_ARCHETYPE_KEYS[0];
  const dialogueId = DIALOGUE_TREE_IDS[0];
  const dialogueKey = source.dialogue.keys[dialogueId];

  (source.campaign as { maps: Array<{ name: string }> }).maps[0]!.name = "Mutated Start";
  (source.musicByMap as Record<string, TrackId>)["Stable Start"] = TrackId.Map5;
  (source.simulation.displayNames as Record<DisplayName, string>)[DISPLAY_NAME_IDS[0]] = "mutated:name";
  const enemies = source.simulation.enemies as Record<EnemyArchetypeKey, FixtureEnemy>;
  enemies[enemyKey] = { ...enemies[enemyKey], health: 99 };
  (source.dialogue.trees as Record<string, unknown>)[dialogueKey] = {
    start: "start",
    nodes: { start: { text: "mutated:dialogue" } },
  };
  (source.audio.tracks as Record<TrackId, MusicTrack>)[TrackId.Title] = {
    src: "/mutated.ogg",
    volume: 1,
    loop: false,
  };
  (source.presentation.appearances as Record<SpriteIdType, TopDownSpriteAppearance>)[SpriteId.Player] = {
    shape: "none",
    color: "#ffffff",
  };

  assertEquals(catalog.levels.start.map.name, "Stable Start");
  assertEquals(catalog.levels.start.music, TrackId.Map1);
  assertEquals(catalog.simulation.displayNameForCode(1).text, "stable:john");
  assertEquals(catalog.simulation.enemyForKey(enemyKey).definition.health, 1);
  assertEquals(catalog.dialogue.start(dialogueId).node.text, "stable:dialogue:johnIntro");
  assertEquals(catalog.audio.track(TrackId.Title).src, "/stable/audio/title.ogg");
  assertEquals(catalog.presentation.appearance(SpriteId.Player).color, "#123456");
});

Deno.test("catalog compilation rejects missing and stray level music", () => {
  const missing = sourceFor("Start", "Exit", "missing", "#111111");
  const missingMusic = { ...missing.musicByMap };
  delete missingMusic.Exit;
  assertThrows(
    () => compileGameCatalog({ ...missing, musicByMap: missingMusic }),
    Error,
    'Invalid level music: missing "Exit"',
  );

  const stray = sourceFor("Start", "Exit", "stray", "#111111");
  assertThrows(
    () => compileGameCatalog({ ...stray, musicByMap: { ...stray.musicByMap, Missing: TrackId.Map3 } }),
    Error,
    'Invalid level music: unknown "Missing"',
  );
});

Deno.test("catalog compilation rejects cross-domain dangling references", () => {
  const source = sourceFor("Start", "Exit", "dangling", "#111111");
  const enemyKey = ENEMY_ARCHETYPE_KEYS[0];
  const enemies = source.simulation.enemies as Record<EnemyArchetypeKey, FixtureEnemy>;
  enemies[enemyKey] = {
    ...enemies[enemyKey],
    displayName: "missingDisplayName" as DisplayName,
  };

  assertThrows(
    () => compileGameCatalog(source),
    Error,
    'enemy "meleeDog" has an invalid display name',
  );
});

Deno.test("catalog compilation rejects stable semantic and code-order drift", () => {
  const semanticDrift = sourceFor("Start", "Exit", "semantic", "#111111");
  const itemKinds = semanticDrift.simulation.itemKinds as Record<MapItemKindType, ItemKind>;
  itemKinds[MapItemKind.HealthPatch] = ItemKind.PistolAmmo;
  assertThrows(
    () => compileGameCatalog(semanticDrift),
    Error,
    'Map item "healthPatch" must compile to stable item kind 1',
  );

  const codeDrift = sourceFor("Start", "Exit", "codes", "#111111");
  const dialogueIds = codeDrift.dialogue.ids as DialogueTreeId[];
  [dialogueIds[0], dialogueIds[1]] = [dialogueIds[1]!, dialogueIds[0]!];
  assertThrows(
    () => compileGameCatalog(codeDrift),
    Error,
    "dialogue tree ids must preserve the stable code order",
  );
});

Deno.test("catalog compilation rejects malformed nested authored values", () => {
  assertMalformed((source) => {
    const enemy = source.simulation.enemies[ENEMY_ARCHETYPE_KEYS[0]] as unknown as Record<string, unknown>;
    enemy.health = "broken";
  }, "health must be an integer between 1 and 255");
  assertMalformed((source) => {
    const enemy = source.simulation.enemies[ENEMY_ARCHETYPE_KEYS[0]] as unknown as Record<string, unknown>;
    enemy.health = 256;
  }, "health must be an integer between 1 and 255");
  assertMalformed((source) => {
    const enemy = source.simulation.enemies[ENEMY_ARCHETYPE_KEYS[0]] as unknown as Record<string, unknown>;
    enemy.behavior = { alert: { type: "teleport" }, investigate: { type: "watch" } };
  }, "unknown alert behavior");
  assertMalformed((source) => {
    const weapon = source.simulation.weapons[1] as unknown as Record<string, unknown>;
    weapon.minDamage = -99;
  }, "minDamage must be an integer between 0 and 255");
  assertMalformed((source) => {
    const sound = source.audio.sounds[SOUND_IDS[0]] as unknown as Record<string, unknown>;
    sound.category = "music";
    sound.volume = -5;
  }, "Invalid sound entry");
  assertMalformed((source) => {
    const appearance = source.presentation.appearances[SpriteId.Player] as unknown as Record<string, unknown>;
    appearance.shape = "triangle";
  }, "Invalid sprite appearance");
});

Deno.test("catalog compilation rejects unknown authored keys", () => {
  assertMalformed((source) => {
    const enemy = source.simulation.enemies[ENEMY_ARCHETYPE_KEYS[0]] as unknown as {
      attack: Record<string, unknown>;
    };
    enemy.attack.attakBonus = 99;
  }, "attakBonus");
  assertMalformed((source) => {
    const weapon = source.simulation.weapons[1] as unknown as Record<string, unknown>;
    weapon.amo = "cannon";
  }, "amo");
  assertMalformed((source) => {
    const appearance = source.presentation.appearances[SpriteId.Player] as unknown as Record<string, unknown>;
    appearance.symbl = "X";
  }, "symbl");
  assertMalformed((source) => {
    const root = source as unknown as Record<string, unknown>;
    root.unexpectedRoot = true;
  }, "unexpectedRoot");
});

Deno.test("catalog compilation rejects dialogue tree aliases", () => {
  const source = sourceFor("Start", "Exit", "alias", "#111111");
  const keys = source.dialogue.keys as Record<DialogueTreeId, string>;
  keys[DIALOGUE_TREE_IDS[1]] = keys[DIALOGUE_TREE_IDS[0]];
  assertThrows(() => compileGameCatalog(source), Error, "Dialogue tree keys must be unique");
});

Deno.test("catalog compilation joins triggered story events to same-map targets", () => {
  const missing = sourceFor("Start", "Exit", "story-missing", "#111111");
  addStoryNpc(missing, false);
  assertThrows(
    () => compileGameCatalog(missing),
    Error,
    'event "johnSpoken" requires one story target "john"',
  );

  const outside = sourceFor("Start", "Exit", "story-outside", "#111111");
  addStoryNpc(outside, true);
  const event = outside.simulation.storyEvents[STORY_EVENT_IDS[0]] as unknown as {
    actions: Array<{ destination: { x: number; y: number } }>;
  };
  event.actions[0]!.destination.x = 99;
  assertThrows(() => compileGameCatalog(outside), Error, "destination (99,0) is outside the map");
});

Deno.test("failed compilation cannot corrupt a published catalog", () => {
  const stable = compileGameCatalog(sourceFor("Stable Start", "Stable Exit", "stable", "#123456"));
  const broken = sourceFor("Broken Start", "Broken Exit", "broken", "#654321");
  const enemies = broken.simulation.enemies as Record<EnemyArchetypeKey, FixtureEnemy>;
  const enemyKey = ENEMY_ARCHETYPE_KEYS[0];
  enemies[enemyKey] = { ...enemies[enemyKey], displayName: "missingDisplayName" as DisplayName };

  assertThrows(() => compileGameCatalog(broken), Error, 'enemy "meleeDog" has an invalid display name');
  assertEquals(stable.levels.start.map.name, "Stable Start");
  assertEquals(stable.simulation.enemyForKey(enemyKey).definition.health, 1);
  assertEquals(stable.audio.track(TrackId.Title).src, "/stable/audio/title.ogg");
});

Deno.test("published catalog projections and maps are frozen", () => {
  const catalog = compileGameCatalog(sourceFor("Frozen Start", "Frozen Exit", "frozen", "#111111"));
  for (
    const projection of [
      catalog,
      catalog.levels,
      catalog.simulation,
      catalog.dialogue,
      catalog.audio,
      catalog.presentation,
    ]
  ) {
    assert(Object.isFrozen(projection));
  }

  assert(Object.isFrozen(catalog.levels.all));
  assert(Object.isFrozen(catalog.simulation.enemyForKey(ENEMY_ARCHETYPE_KEYS[0])));
  assert(Object.isFrozen(catalog.simulation.enemyForKey(ENEMY_ARCHETYPE_KEYS[0]).definition));
  assert(Object.isFrozen(catalog.simulation.storyEvent(STORY_EVENT_IDS[0])));
  assert(Object.isFrozen(catalog.simulation.weapon(1)));
  assert(Object.isFrozen(catalog.dialogue.start(DIALOGUE_TREE_IDS[0]).node));
  assert(Object.isFrozen(catalog.dialogue.start(DIALOGUE_TREE_IDS[0]).node.choices));
  assert(Object.isFrozen(catalog.audio.track(TrackId.Title)));
  assert(Object.isFrozen(catalog.audio.sound(SOUND_IDS[0])));
  assert(Object.isFrozen(catalog.presentation.appearance(SpriteId.Player)));
  for (const level of catalog.levels.all) {
    assert(Object.isFrozen(level));
    assert(Object.isFrozen(level.map));
    assert(Object.isFrozen(level.map.terrain));
    assert(Object.isFrozen(level.map.terrain.palette));
    assert(Object.isFrozen(level.map.terrain.tiles));
    assert(level.map.terrain.tiles.every(Object.isFrozen));
    assert(Object.isFrozen(level.map.entities));
    assert(level.map.entities.every(Object.isFrozen));
  }
});

Deno.test("published catalog lookups survive rejected vocabulary mutations", () => {
  const itemBefore = SHIPPED_GAME.simulation.itemKindForCode(ItemKind.HealthPatch);
  const keySpriteBefore = SHIPPED_GAME.presentation.spriteForItem(ItemKind.Key, 1);

  assert(Object.isFrozen(ITEM_KIND_CODES));
  assert(Object.isFrozen(KEY_COLORS));
  assertThrows(() => {
    (ITEM_KIND_CODES as unknown as number[])[0] = 99;
  }, TypeError);
  assertThrows(() => {
    (KEY_COLORS as unknown as string[])[0] = KEY_COLORS[1]!;
  }, TypeError);

  assertEquals(SHIPPED_GAME.simulation.itemKindForCode(ItemKind.HealthPatch), itemBefore);
  assertEquals(SHIPPED_GAME.presentation.spriteForItem(ItemKind.Key, 1), keySpriteBefore);
});

function sourceFor(
  startName: string,
  exitName: string,
  marker: string,
  color: string,
): GameCatalogSource {
  const simulation: GameCatalogSource["simulation"] = {
    defaultEnemy: ENEMY_ARCHETYPE_KEYS[0],
    enemies: recordFor(ENEMY_ARCHETYPE_KEYS, (_key, index): FixtureEnemy => {
      const soundId = SOUND_IDS[index % SOUND_IDS.length]!;
      return {
        displayName: DISPLAY_NAME_IDS[index + 1]!,
        health: index + 1,
        hitDc: 10,
        damage: 1,
        attack: {},
        behavior: {
          alert: { type: "advance", steps: 1 },
          investigate: { type: "move", steps: 1 },
        },
        senses: { sightRadius: 5, hearingRadius: 7 },
        sounds: {
          idle: {
            soundId,
            radius: 5,
            volume: 0.5,
            minDelayMs: 100,
            maxDelayMs: 200,
          },
          alert: soundId,
          attack: soundId,
          hurt: soundId,
          defeat: soundId,
        },
      };
    }),
    itemKinds: {
      [MapItemKind.HealthPatch]: ItemKind.HealthPatch,
      [MapItemKind.PistolAmmo]: ItemKind.PistolAmmo,
      [MapItemKind.CannonAmmo]: ItemKind.CannonAmmo,
    },
    displayNames: recordFor(DISPLAY_NAME_IDS, (id) => `${marker}:${id}`),
    examineTexts: recordFor(EXAMINE_TEXT_IDS, (id) => `${marker}:examine:${id}`),
    storyEvents: recordFor(STORY_EVENT_IDS, (id): StoryEventDefinition => ({
      flag: id,
      actions: [{
        type: "moveEntity",
        target: STORY_TARGET_IDS[0],
        destination: { x: 1, y: 0 },
      }],
    })),
    storyTargets: [...STORY_TARGET_IDS],
    weapons: recordFor(COMMAND_SLOTS, (slot): PlayerWeaponSpec => ({
      label: `${marker}:weapon:${slot}`,
      minDamage: 1,
      maxDamage: 1,
      range: slot,
      attackBonus: 1,
      critThreshold: 20,
      critMultiplier: 2,
      pattern: AttackPattern.Line,
      targets: AttackTargetMode.First,
      noiseRadius: slot,
    })),
  };

  const dialogueKeys = recordFor(DIALOGUE_TREE_IDS, (id) => `${marker}-${id}`);
  const dialogueTrees = recordFor(DIALOGUE_TREE_IDS, (id, index) => ({
    start: "start",
    nodes: {
      start: {
        text: `${marker}:dialogue:${id}`,
        voice: VOICE_IDS[index % VOICE_IDS.length],
        choices: [{ label: "CONTINUE." }],
      },
    },
  }));

  const audio: GameCatalogSource["audio"] = {
    tracks: recordFor(TRACK_IDS, (id): MusicTrack => ({
      src: `/${marker}/audio/${id}.ogg`,
      volume: 0.5,
      loop: true,
    })),
    sounds: recordFor(SOUND_IDS, (id): SoundCatalogEntry => ({
      soundId: id,
      src: `/${marker}/sound/${id}.ogg`,
      category: "sfx",
      volume: 0.5,
      radius: 4,
      loop: false,
    })),
    voices: recordFor(VOICE_IDS, (id) => `/${marker}/voice/${id}.mp3`),
  };

  const presentation: GameCatalogSource["presentation"] = {
    appearances: recordFor(SPRITE_IDS, (): TopDownSpriteAppearance => ({ shape: "badge", color })),
    displayNameSprites: recordFor(DISPLAY_NAME_IDS, () => SpriteId.Player),
    enemySprites: recordFor(ENEMY_ARCHETYPE_KEYS, (_key, index) => SPRITE_IDS[index]!),
    itemSprites: recordFor(FIXED_ITEM_KINDS, () => SpriteId.Player),
    keySprites: recordFor(KEY_COLORS, () => SpriteId.Player),
    weaponSprites: recordFor(PICKUP_WEAPON_SLOTS, () => SpriteId.Player),
    decorationSprites: recordFor(DECORATION_KINDS, () => SpriteId.Player),
  };

  return {
    campaign: {
      startMapName: startName,
      maps: [authoredMap(startName, exitName), authoredMap(exitName, "victory")],
    },
    musicByMap: {
      [startName]: TrackId.Map1,
      [exitName]: TrackId.Map2,
    },
    simulation,
    dialogue: {
      ids: [...DIALOGUE_TREE_IDS],
      keys: dialogueKeys,
      trees: Object.fromEntries(DIALOGUE_TREE_IDS.map((id) => [dialogueKeys[id], dialogueTrees[id]])),
    },
    audio,
    presentation,
  };
}

function authoredMap(name: string, destination: string): unknown {
  return {
    name,
    tiles: [[0, 0, 0]],
    entities: [
      { prefab: "player", x: 0, y: 0, dir: 1 },
      { prefab: "uplinkCode", x: 1, y: 0 },
      { prefab: "uplinkTerminal", x: 2, y: 0, goto: destination },
    ],
  };
}

function assertMalformed(mutate: (source: GameCatalogSource) => void, message: string): void {
  const source = sourceFor("Start", "Exit", "malformed", "#111111");
  mutate(source);
  assertThrows(() => compileGameCatalog(source), Error, message);
}

function addStoryNpc(source: GameCatalogSource, includeTarget: boolean): void {
  const campaign = source.campaign as {
    maps: Array<{ tiles: number[][]; entities: Array<Record<string, unknown>> }>;
  };
  const map = campaign.maps[0]!;
  map.tiles[0]!.push(0);
  map.entities.push({
    prefab: "npc",
    x: 3,
    y: 0,
    dir: 1,
    displayName: DISPLAY_NAME_IDS[0],
    onTalkEvent: STORY_EVENT_IDS[0],
    ...(includeTarget ? { storyId: STORY_TARGET_IDS[0] } : {}),
  });
}

function recordFor<Key extends PropertyKey, Value>(
  keys: readonly Key[],
  valueFor: (key: Key, index: number) => Value,
): Record<Key, Value> {
  return Object.fromEntries(keys.map((key, index) => [key, valueFor(key, index)])) as Record<Key, Value>;
}
