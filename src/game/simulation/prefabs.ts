import {
  DEFAULT_ENEMY_ARCHETYPE,
  enemyArchetypeForKey,
  type EnemyCatalogEntry,
  enemyCatalogEntry,
  spriteIdForEnemyArchetype,
} from "@/src/game/content/enemies.ts";
import { ITEM_KIND_BY_CONTENT_KEY, ItemKind } from "@/src/game/content/items.ts";
import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { spriteIdForDecoration, spriteIdForDisplayName, spriteIdForItem } from "@/src/game/content/sprites.ts";
import { dialogueTreeCode } from "@/src/game/content/dialogue/trees.ts";
import {
  type AttackSchema,
  DrawableLayer,
  IDLE_AWARENESS,
  PENDING_SPRITE_ANIMATION_START_MS,
  SPRITE_DEATH_MS,
} from "@/src/game/simulation/components.ts";
import { DrawableKind, SpriteAnimationKind } from "@/src/game/model/render_snapshot.ts";
import {
  DEFAULT_PLAYER_EQUIPMENT,
  DEFAULT_PLAYER_HEALTH,
  DEFAULT_PLAYER_INVENTORY,
  DEFAULT_PLAYER_PROGRESS,
} from "@/src/game/simulation/progression.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import { attackOverridesFromContent, DEFAULT_ATTACK } from "@/src/game/model/attack.ts";
import { examineTextCode } from "@/src/game/content/examine_text.ts";
import { displayNameCode } from "@/src/game/content/names.ts";
import { soundIdCode } from "@/src/game/model/sound.ts";
import { storyEventCode, storyTargetCode } from "@/src/game/content/story.ts";
import { normalizeDirection } from "@/src/game/world/direction.ts";
import {
  type DecorationDef,
  type DoorDef,
  type EnemyDef,
  type EntityDef,
  type ItemDef,
  type KeyDef,
  type LightDef,
  type NpcDef,
  type PlayerDef,
  type SoundDef,
  type SpearPickupDef,
  type SpearTurretDef,
  type UplinkCodeDef,
  type UplinkTerminalDef,
  type WeaponPickupDef,
} from "@/src/game/content/map_entities.ts";
import { doorSlideCode, keyColorCode } from "@/src/game/world/map.ts";
import { terminalDestinationCode } from "@/src/game/world/campaign.ts";
import { TerrainBlock } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";

const DEFAULT_PLAYER_HIT_DC = 10;
const PLAYER_VISION_RADIUS = 6;

type PositionedPrefab = { readonly x: number; readonly y: number };
type GridActorPrefab = PositionedPrefab & { readonly dir: number };

export type PlayerPrefab = Omit<PlayerDef, "prefab">;

export function createPlayer(runtime: GameRuntime, prefab: PlayerPrefab, stableId?: number): Entity {
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    facing: normalizeDirection(prefab.dir),
    blockMask: TerrainBlock.Movement,
    visionRadius: PLAYER_VISION_RADIUS,
    stableId,
    components: {
      Player: {},
      TurnTaker: {},
      Drawable: { kind: DrawableKind.Player, layer: DrawableLayer.Player },
      Sprite: { id: SpriteId.Player },
      Health: DEFAULT_PLAYER_HEALTH,
      PlayerInventory: DEFAULT_PLAYER_INVENTORY,
      PlayerEquipment: DEFAULT_PLAYER_EQUIPMENT,
      PlayerProgress: DEFAULT_PLAYER_PROGRESS,
      StoryFlags: { mask: 0 },
      Defense: { hitDc: DEFAULT_PLAYER_HIT_DC },
    },
  });
}

export type NpcPrefab = Omit<NpcDef, "prefab">;

export function createNpc(runtime: GameRuntime, prefab: NpcPrefab): Entity {
  return runtime.crawler.spawnCrawler({
    ...actorSpec(prefab),
    components: {
      Npc: {},
      Interactable: {},
      Drawable: { kind: DrawableKind.Actor, layer: DrawableLayer.Npc },
      Sprite: { id: spriteIdForDisplayName(prefab.displayName) },
      DisplayName: { displayName: displayNameCode(prefab.displayName) },
      ...(prefab.dialogueTreeId === undefined ? {} : {
        DialogueTreeRef: { dialogueTreeId: dialogueTreeCode(prefab.dialogueTreeId) },
      }),
      ...(prefab.examineTextId === undefined ? {} : {
        ExamineTextRef: { examineTextId: examineTextCode(prefab.examineTextId) },
      }),
      ...(prefab.storyId === undefined ? {} : { StoryTarget: { storyId: storyTargetCode(prefab.storyId) } }),
      ...(prefab.onTalkEvent === undefined ? {} : {
        OnTalkEvent: { onTalkEvent: storyEventCode(prefab.onTalkEvent) },
      }),
    },
  });
}

export type EnemyPrefab = Omit<EnemyDef, "prefab">;

export function createEnemy(runtime: GameRuntime, prefab: EnemyPrefab): Entity {
  const archetype = prefab.archetype === undefined ? DEFAULT_ENEMY_ARCHETYPE : enemyArchetypeForKey(prefab.archetype);
  const catalog = enemyCatalogEntry(archetype);
  const health = prefab.health ?? catalog.health;
  const displayName = prefab.displayName ?? catalog.displayName;
  return runtime.crawler.spawnCrawler({
    ...actorSpec(prefab),
    components: {
      Enemy: {},
      TurnTaker: {},
      EnemyAwareness: IDLE_AWARENESS,
      EnemyArchetype: { archetype },
      Health: { current: health, max: health },
      Defense: { hitDc: prefab.hitDc ?? catalog.hitDc },
      Attack: createAttackSpec(prefab, catalog),
      Drawable: { kind: DrawableKind.Actor, layer: DrawableLayer.Enemy },
      Sprite: { id: spriteIdForEnemyArchetype(archetype) },
      DisplayName: { displayName: displayNameCode(displayName) },
      ...(prefab.examineTextId === undefined ? {} : {
        ExamineTextRef: { examineTextId: examineTextCode(prefab.examineTextId) },
      }),
    },
  });
}

function createAttackSpec(prefab: EnemyPrefab, catalog: EnemyCatalogEntry): AttackSchema {
  const damage = prefab.damage ?? catalog.damage;
  return {
    ...DEFAULT_ATTACK,
    ...catalog.attack,
    minDamage: damage,
    maxDamage: damage,
    ...attackOverridesFromContent(prefab.attack),
  };
}

export type DoorPrefab = Omit<DoorDef, "prefab">;

export function createDoor(runtime: GameRuntime, prefab: DoorPrefab): Entity {
  if (prefab.locked === true && prefab.color === undefined) {
    throw new Error("Locked door prefab is missing a key color");
  }
  const mask = TerrainBlock.Movement | TerrainBlock.EffectLine | (prefab.glass === true ? 0 : TerrainBlock.Sight);
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    blockMask: mask,
    components: {
      Drawable: { kind: DrawableKind.Door, layer: DrawableLayer.Structure },
      Door: { open: 0, slide: doorSlideCode(prefab.slide), openMs: prefab.openMs ?? 0 },
      Interactable: {},
      ...(prefab.examineTextId === undefined ? {} : {
        ExamineTextRef: { examineTextId: examineTextCode(prefab.examineTextId) },
      }),
      ...(prefab.locked === true && prefab.color !== undefined ?
        { Locked: { color: keyColorCode(prefab.color) } } :
        {}),
      ...(prefab.secret === true ? { Secret: {} } : {}),
      ...(prefab.glass === true ? { Glass: {} } : {}),
    },
  });
}

export function createKey(runtime: GameRuntime, prefab: Omit<KeyDef, "prefab">): Entity {
  return createPickup(runtime, prefab, ItemKind.Key, keyColorCode(prefab.color));
}

export function createUplinkCode(runtime: GameRuntime, prefab: Omit<UplinkCodeDef, "prefab">): Entity {
  return createPickup(runtime, prefab, ItemKind.UplinkCode, 0);
}

export function createSpearPickup(runtime: GameRuntime, prefab: Omit<SpearPickupDef, "prefab">): Entity {
  return createPickup(runtime, prefab, ItemKind.Spear, 0);
}

export function createUplinkTerminal(runtime: GameRuntime, prefab: Omit<UplinkTerminalDef, "prefab">): Entity {
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    blockMask: TerrainBlock.Movement,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure },
      Sprite: { id: SpriteId.UplinkTerminal },
      UplinkTerminal: { requiresSpear: prefab.requiresSpear === true ? 1 : 0 },
      Interactable: {},
      TerminalDestination: { destination: terminalDestinationCode(prefab.goto) },
      ...(prefab.examineTextId === undefined ? {} : {
        ExamineTextRef: { examineTextId: examineTextCode(prefab.examineTextId) },
      }),
    },
  });
}

export function createSpearTurret(runtime: GameRuntime, prefab: Omit<SpearTurretDef, "prefab">): Entity {
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    blockMask: TerrainBlock.Movement,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure },
      Sprite: { id: SpriteId.SpearTurret },
      SpearTurret: {},
      Interactable: {},
    },
  });
}

export function createWeaponPickup(runtime: GameRuntime, prefab: Omit<WeaponPickupDef, "prefab">): Entity {
  return createPickup(runtime, prefab, ItemKind.Weapon, prefab.slot);
}

export function createItem(runtime: GameRuntime, prefab: Omit<ItemDef, "prefab">): Entity {
  return createPickup(runtime, prefab, ITEM_KIND_BY_CONTENT_KEY[prefab.item], prefab.amount);
}

export function createDecoration(runtime: GameRuntime, prefab: Omit<DecorationDef, "prefab">): Entity {
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure },
      Sprite: { id: spriteIdForDecoration(prefab.decoration) },
    },
  });
}

export function createLight(runtime: GameRuntime, prefab: Omit<LightDef, "prefab">): Entity {
  const [red, green, blue] = colorChannels(prefab.color);
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    components: {
      LightEmitter: {
        red,
        green,
        blue,
        radius: prefab.radius,
        flickerAmount: prefab.flickerAmount ?? 0,
        flickerSpeed: prefab.flickerSpeed ?? 0,
      },
    },
  });
}

export function createSound(runtime: GameRuntime, prefab: Omit<SoundDef, "prefab">): Entity {
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    components: {
      SoundEmitter: {
        soundId: soundIdCode(prefab.soundId),
        radius: prefab.radius,
        volume: prefab.volume ?? 1,
      },
    },
  });
}

function createPickup(runtime: GameRuntime, prefab: PositionedPrefab, item: ItemKind, value: number): Entity {
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Item },
      Sprite: { id: spriteIdForItem(item, value) },
      Item: { kind: item, value },
    },
  });
}

function actorSpec(prefab: GridActorPrefab) {
  return {
    x: prefab.x,
    y: prefab.y,
    facing: normalizeDirection(prefab.dir),
    blockMask: TerrainBlock.Movement,
  } as const;
}

export function createMapEntity(runtime: GameRuntime, prefab: EntityDef): Entity {
  switch (prefab.prefab) {
    case "player":
      return createPlayer(runtime, prefab);
    case "npc":
      return createNpc(runtime, prefab);
    case "enemy":
      return createEnemy(runtime, prefab);
    case "door":
      return createDoor(runtime, prefab);
    case "key":
      return createKey(runtime, prefab);
    case "uplinkCode":
      return createUplinkCode(runtime, prefab);
    case "uplinkTerminal":
      return createUplinkTerminal(runtime, prefab);
    case "weaponPickup":
      return createWeaponPickup(runtime, prefab);
    case "item":
      return createItem(runtime, prefab);
    case "decoration":
      return createDecoration(runtime, prefab);
    case "light":
      return createLight(runtime, prefab);
    case "sound":
      return createSound(runtime, prefab);
    case "spearPickup":
      return createSpearPickup(runtime, prefab);
    case "spearTurret":
      return createSpearTurret(runtime, prefab);
  }
}

export function createCorpse(runtime: GameRuntime, position: PositionedPrefab): Entity {
  return runtime.crawler.spawnCrawler({
    ...position,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Item },
      Sprite: { id: SpriteId.Corpse },
    },
  });
}

export function createDeathEffect(runtime: GameRuntime, position: PositionedPrefab, sprite: SpriteId): Entity {
  return runtime.crawler.spawnCrawler({
    ...position,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Item },
      Sprite: { id: sprite },
      SpriteAnimation: {
        kind: SpriteAnimationKind.Death,
        startedAtMs: PENDING_SPRITE_ANIMATION_START_MS,
        durationMs: SPRITE_DEATH_MS,
      },
    },
  });
}

function colorChannels(color: string): readonly [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}
