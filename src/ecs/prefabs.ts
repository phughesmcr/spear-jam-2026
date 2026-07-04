import type { Entity, World } from "@phughesmcr/miski";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import {
  Attack,
  Blocking,
  Defense,
  Dialogue,
  DisplayNameComponent,
  Door,
  Drawable,
  DrawableKind,
  DrawableLayer,
  Enemy,
  EnemyArchetypeComponent,
  EnemyAwareness,
  Examine,
  Facing,
  GridPos,
  Health,
  IDLE_AWARENESS,
  Interactable,
  Item,
  Locked,
  Npc,
  Player,
  Secret,
  TurnTaker,
  UplinkTerminal,
} from "@/src/ecs/components.ts";
import type { AttackSchema } from "@/src/ecs/components.ts";
import { DEFAULT_ENEMY_ARCHETYPE, type EnemyCatalogEntry, enemyCatalogEntry } from "@/src/ecs/enemy_catalog.ts";
import { DEFAULT_PLAYER_HEALTH } from "@/src/ecs/progression.ts";
import { DEFAULT_ATTACK } from "@/src/game/attack.ts";
import { normalizeDirection } from "@/src/grid/direction.ts";
import { doorSlideCode, keyColorCode } from "@/src/map/map.ts";
import { ItemKind } from "@/src/game/items.ts";
import type {
  DoorDef,
  EnemyDef,
  EntityDef,
  EntityDefFor,
  EntityPrefab,
  ItemDef,
  KeyDef,
  NpcDef,
  PlayerDef,
  UplinkCodeDef,
  UplinkTerminalDef,
  WeaponPickupDef,
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
type ExaminePrefab = {
  readonly examineTextId?: number;
};

export type PlayerPrefab = Omit<PlayerDef, "prefab">;

export function createPlayer(world: World, prefab: PlayerPrefab): Entity {
  const entity = createGridActor(world, prefab, DrawableKind.Player, DrawableLayer.Player);
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

export function createNpc(world: World, prefab: NpcPrefab): Entity {
  const entity = createGridActor(world, prefab, DrawableKind.Npc, DrawableLayer.Npc);
  world.components.addBundle(
    entity,
    [
      [DisplayNameComponent, { displayName: prefab.displayName }],
      [Npc],
      [Interactable],
    ] as const,
  );
  addExamine(world, entity, prefab);
  if (prefab.dialogueTreeId !== undefined && prefab.dialogueTreeId !== DialogueTreeId.None) {
    world.components.addToEntity(Dialogue, entity, { dialogueTreeId: prefab.dialogueTreeId });
  }
  return entity;
}

export type EnemyPrefab = Omit<EnemyDef, "prefab">;

export function createEnemy(world: World, prefab: EnemyPrefab): Entity {
  const archetype = prefab.archetype ?? DEFAULT_ENEMY_ARCHETYPE;
  const catalog = enemyCatalogEntry(archetype);
  const health = prefab.health ?? catalog.health;
  const hitDc = prefab.hitDc ?? catalog.hitDc;
  const entity = createGridActor(world, prefab, DrawableKind.Enemy, DrawableLayer.Enemy);
  world.components.addBundle(
    entity,
    [
      [DisplayNameComponent, { displayName: prefab.displayName ?? catalog.displayName }],
      [Enemy],
      [EnemyAwareness, IDLE_AWARENESS],
      [EnemyArchetypeComponent, { archetype }],
      [Health, { current: health, max: health }],
      [Defense, { hitDc }],
      [Attack, createAttackSpec(prefab, catalog)],
    ] as const,
  );
  addExamine(world, entity, prefab);
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

export function createDoor(world: World, prefab: DoorPrefab): Entity {
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
  addExamine(world, entity, prefab);
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

export function createUplinkTerminal(world: World, prefab: UplinkTerminalPrefab): Entity {
  const entity = world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [Drawable, { kind: DrawableKind.UplinkTerminal, layer: DrawableLayer.Structure }],
      [UplinkTerminal],
      [Interactable],
      [Blocking],
    ] as const,
  );
  addExamine(world, entity, prefab);
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

type MapEntityCreator<Prefab extends EntityPrefab> = (world: World, prefab: EntityDefFor<Prefab>) => Entity;

type MapEntityCreators = {
  readonly [Prefab in EntityPrefab]: MapEntityCreator<Prefab>;
};

const MAP_ENTITY_CREATORS = {
  player: createPlayer,
  npc: createNpc,
  enemy: createEnemy,
  door: createDoor,
  key: createKey,
  uplinkCode: createUplinkCode,
  uplinkTerminal: createUplinkTerminal,
  weaponPickup: createWeaponPickup,
  item: createItem,
} satisfies MapEntityCreators;

function createPickup(world: World, prefab: PositionedPrefab, item: ItemKind, value: number): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [Drawable, { kind: DrawableKind.Item, layer: DrawableLayer.Item }],
      [Item, { kind: item, value }],
    ] as const,
  );
}

function createGridActor(
  world: World,
  prefab: GridActorPrefab,
  kind: DrawableKind,
  layer: DrawableLayer,
): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, { x: prefab.x, y: prefab.y }],
      [Facing, { dir: normalizeDirection(prefab.dir) }],
      [Drawable, { kind, layer }],
      [Blocking],
      [TurnTaker],
    ] as const,
  );
}

function addExamine(world: World, entity: Entity, prefab: ExaminePrefab): void {
  if (prefab.examineTextId !== undefined) {
    world.components.addToEntity(Examine, entity, { examineTextId: prefab.examineTextId });
  }
}

export function createMapEntity(world: World, prefab: EntityDef): Entity {
  const create = MAP_ENTITY_CREATORS[prefab.prefab] as MapEntityCreator<typeof prefab.prefab>;
  return create(world, prefab);
}
