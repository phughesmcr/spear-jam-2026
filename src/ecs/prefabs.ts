import type { Entity, World } from "@phughesmcr/miski";
import {
  Attack,
  type AttackSchema,
  Blocking,
  Defense,
  Door,
  Drawable,
  DrawableLayer,
  Enemy,
  EnemyArchetypeComponent,
  EnemyAwareness,
  Facing,
  GridPos,
  Health,
  IDLE_AWARENESS,
  Interactable,
  Item,
  ItemKind,
  LightEmitter,
  Locked,
  MapScoped,
  Npc,
  PENDING_SPRITE_ANIMATION_START_MS,
  Player,
  Secret,
  Sprite,
  SPRITE_DEATH_MS,
  SpriteAnimation,
  SpriteAnimationKind,
  TurnTaker,
  UplinkTerminal,
} from "@/src/ecs/components.ts";
import {
  DrawableKind,
  SpriteId,
  spriteIdForDecoration,
  spriteIdForDisplayName,
  spriteIdForEnemyArchetype,
  spriteIdForItem,
} from "@/src/ecs/drawables.ts";
import {
  DEFAULT_ENEMY_ARCHETYPE,
  type EnemyArchetype as EnemyArchetypeType,
  type EnemyCatalogEntry,
  enemyCatalogEntry,
} from "@/src/ecs/enemy_catalog.ts";
import { type EntityContentStore, setEntityContent } from "@/src/ecs/entity_content.ts";
import { DEFAULT_PLAYER_HEALTH } from "@/src/ecs/progression.ts";
import { DEFAULT_ATTACK } from "@/src/game/attack.ts";
import { normalizeDirection } from "@/src/grid/direction.ts";
import {
  type DecorationDef,
  type DoorDef,
  doorSlideCode,
  type EnemyDef,
  type EntityDef,
  type ItemDef,
  keyColorCode,
  type KeyDef,
  type LightDef,
  type NpcDef,
  type PlayerDef,
  type UplinkCodeDef,
  type UplinkTerminalDef,
  type WeaponPickupDef,
} from "@/src/map/map.ts";

const DEFAULT_PLAYER_HIT_DC = 10;

type PositionedPrefab = {
  readonly x: number;
  readonly y: number;
};

type FacingPrefab = {
  readonly dir: number;
};

type GridActorPrefab = PositionedPrefab & FacingPrefab;

export type PlayerPrefab = Omit<PlayerDef, "prefab">;

export function createPlayer(world: World, prefab: PlayerPrefab): Entity {
  const entity = createGridActor(world, prefab, DrawableKind.Player, DrawableLayer.Player, SpriteId.Player);
  world.components.addBundle(
    entity,
    [
      [Player],
      [Health, { current: DEFAULT_PLAYER_HEALTH.max, max: DEFAULT_PLAYER_HEALTH.max }],
      [Defense, { hitDc: DEFAULT_PLAYER_HIT_DC }],
    ] as const,
  );
  return entity;
}

export type NpcPrefab = Omit<NpcDef, "prefab">;

export function createNpc(world: World, contentStore: EntityContentStore, prefab: NpcPrefab): Entity {
  const entity = createGridActor(
    world,
    prefab,
    DrawableKind.Actor,
    DrawableLayer.Npc,
    spriteIdForDisplayName(prefab.displayName),
  );
  world.components.addBundle(
    entity,
    [
      [Npc],
      [Interactable],
    ] as const,
  );
  setEntityContent(contentStore, entity, {
    displayName: prefab.displayName,
    dialogueTreeId: prefab.dialogueTreeId,
    examineTextId: prefab.examineTextId,
    storyId: prefab.storyId,
    onTalkEvent: prefab.onTalkEvent,
  });
  return entity;
}

export type EnemyPrefab = Omit<EnemyDef, "prefab">;

export function createEnemy(world: World, contentStore: EntityContentStore, prefab: EnemyPrefab): Entity {
  const archetype = enemyArchetypeForPrefab(prefab.archetype);
  const catalog = enemyCatalogEntry(archetype);
  const health = prefab.health ?? catalog.health;
  const hitDc = prefab.hitDc ?? catalog.hitDc;
  const displayName = prefab.displayName ?? catalog.displayName;
  const entity = createGridActor(
    world,
    prefab,
    DrawableKind.Actor,
    DrawableLayer.Enemy,
    spriteIdForEnemyArchetype(archetype),
  );
  world.components.addBundle(
    entity,
    [
      [Enemy],
      [EnemyAwareness, IDLE_AWARENESS],
      [EnemyArchetypeComponent, { archetype }],
      [Health, { current: health, max: health }],
      [Defense, { hitDc }],
      [Attack, createAttackSpec(prefab, catalog)],
    ] as const,
  );
  setEntityContent(contentStore, entity, {
    displayName,
    examineTextId: prefab.examineTextId,
  });
  return entity;
}

function createAttackSpec(prefab: EnemyPrefab, catalog: EnemyCatalogEntry): AttackSchema {
  const fixedDamage = prefab.damage ?? catalog.damage;
  return {
    ...DEFAULT_ATTACK,
    ...catalog.attack,
    minDamage: fixedDamage,
    maxDamage: fixedDamage,
    ...prefab.attack,
  };
}

export type DoorPrefab = Omit<DoorDef, "prefab">;

export function createDoor(world: World, contentStore: EntityContentStore, prefab: DoorPrefab): Entity {
  if (prefab.locked === true && prefab.color === undefined) {
    throw new Error("Locked door prefab is missing a key color");
  }

  const entity = world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [Drawable, { kind: DrawableKind.Door, layer: DrawableLayer.Structure }],
      [Door, { open: 0, slide: doorSlideCode(prefab.slide), openMs: prefab.openMs ?? 0 }],
      [Interactable],
      [Blocking],
    ] as const,
  );
  setEntityContent(contentStore, entity, { examineTextId: prefab.examineTextId });
  if (prefab.locked === true && prefab.color !== undefined) {
    world.components.addToEntity(Locked, entity, { color: keyColorCode(prefab.color) });
  }
  if (prefab.secret === true) {
    world.components.addToEntity(Secret, entity);
  }
  return entity;
}

export type KeyPrefab = Omit<KeyDef, "prefab">;

export function createKey(world: World, prefab: KeyPrefab): Entity {
  return createPickup(world, prefab, ItemKind.Key, keyColorCode(prefab.color));
}

export type UplinkCodePrefab = Omit<UplinkCodeDef, "prefab">;

export function createUplinkCode(world: World, prefab: UplinkCodePrefab): Entity {
  return createPickup(world, prefab, ItemKind.UplinkCode, 0);
}

export type UplinkTerminalPrefab = Omit<UplinkTerminalDef, "prefab">;

export function createUplinkTerminal(
  world: World,
  contentStore: EntityContentStore,
  prefab: UplinkTerminalPrefab,
): Entity {
  const entity = world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [Drawable, { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure }],
      [Sprite, { id: SpriteId.UplinkTerminal }],
      [UplinkTerminal],
      [Interactable],
      [Blocking],
    ] as const,
  );
  setEntityContent(contentStore, entity, {
    examineTextId: prefab.examineTextId,
    terminalDestination: prefab.goto,
  });
  return entity;
}

export type WeaponPickupPrefab = Omit<WeaponPickupDef, "prefab">;

export function createWeaponPickup(world: World, prefab: WeaponPickupPrefab): Entity {
  return createPickup(world, prefab, ItemKind.Weapon, prefab.slot);
}

export type ItemPrefab = Omit<ItemDef, "prefab">;

export function createItem(world: World, prefab: ItemPrefab): Entity {
  return createPickup(world, prefab, prefab.item, prefab.amount);
}

export type DecorationPrefab = Omit<DecorationDef, "prefab">;

export function createDecoration(world: World, prefab: DecorationPrefab): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [Drawable, { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure }],
      [Sprite, { id: spriteIdForDecoration(prefab.decoration) }],
    ] as const,
  );
}

export type LightPrefab = Omit<LightDef, "prefab">;

export function createLight(world: World, prefab: LightPrefab): Entity {
  const [red, green, blue] = colorChannels(prefab.color);
  return world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [LightEmitter, {
        red,
        green,
        blue,
        radius: prefab.radius,
        flickerAmount: prefab.flickerAmount ?? 0,
        flickerSpeed: prefab.flickerSpeed ?? 0,
      }],
    ] as const,
  );
}

function enemyArchetypeForPrefab(archetype: EnemyArchetypeType | undefined): EnemyArchetypeType {
  return archetype ?? DEFAULT_ENEMY_ARCHETYPE;
}

function createPickup(world: World, prefab: PositionedPrefab, item: ItemKind, value: number): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [Drawable, { kind: DrawableKind.Sprite, layer: DrawableLayer.Item }],
      [Sprite, { id: spriteIdForItem(item, value) }],
      [Item, { kind: item, value }],
    ] as const,
  );
}

function createGridActor(
  world: World,
  prefab: GridActorPrefab,
  kind: DrawableKind,
  layer: DrawableLayer,
  sprite: SpriteId,
): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [Facing, { dir: normalizeDirection(prefab.dir) }],
      [Drawable, { kind, layer }],
      [Sprite, { id: sprite }],
      [Blocking],
      [TurnTaker],
    ] as const,
  );
}

export function createMapEntity(world: World, contentStore: EntityContentStore, prefab: EntityDef): Entity {
  const entity = createMapEntityByPrefab(world, contentStore, prefab);
  if (prefab.prefab !== "player") world.components.addToEntity(MapScoped, entity);
  return entity;
}

function createMapEntityByPrefab(world: World, contentStore: EntityContentStore, prefab: EntityDef): Entity {
  switch (prefab.prefab) {
    case "player":
      return createPlayer(world, prefab);
    case "npc":
      return createNpc(world, contentStore, prefab);
    case "enemy":
      return createEnemy(world, contentStore, prefab);
    case "door":
      return createDoor(world, contentStore, prefab);
    case "key":
      return createKey(world, prefab);
    case "uplinkCode":
      return createUplinkCode(world, prefab);
    case "uplinkTerminal":
      return createUplinkTerminal(world, contentStore, prefab);
    case "weaponPickup":
      return createWeaponPickup(world, prefab);
    case "item":
      return createItem(world, prefab);
    case "decoration":
      return createDecoration(world, prefab);
    case "light":
      return createLight(world, prefab);
  }
}

export function createCorpse(world: World, position: PositionedPrefab): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, position],
      [MapScoped],
      [Drawable, { kind: DrawableKind.Sprite, layer: DrawableLayer.Item }],
      [Sprite, { id: SpriteId.Corpse }],
    ] as const,
  );
}

export function createDeathEffect(world: World, position: PositionedPrefab, sprite: SpriteId): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, position],
      [MapScoped],
      [Drawable, { kind: DrawableKind.Sprite, layer: DrawableLayer.Item }],
      [Sprite, { id: sprite }],
      [SpriteAnimation, {
        kind: SpriteAnimationKind.Death,
        startedAtMs: PENDING_SPRITE_ANIMATION_START_MS,
        durationMs: SPRITE_DEATH_MS,
      }],
    ] as const,
  );
}

function colorChannels(color: string): readonly [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ] as const;
}
