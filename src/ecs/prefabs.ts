import type { Entity, World } from "@phughesmcr/miski";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import {
  Attack,
  Blocking,
  DecorationKind,
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
  ItemKind,
  LightEmitter,
  Locked,
  Npc,
  PENDING_SPRITE_ANIMATION_START_MS,
  Player,
  Secret,
  Sprite,
  SPRITE_DEATH_MS,
  SpriteAnimation,
  SpriteAnimationKind,
  SpriteId,
  TurnTaker,
  UplinkTerminal,
} from "@/src/ecs/components.ts";
import type { AttackSchema } from "@/src/ecs/components.ts";
import {
  DEFAULT_ENEMY_ARCHETYPE,
  EnemyArchetype,
  type EnemyCatalogEntry,
  enemyCatalogEntry,
} from "@/src/ecs/enemy_catalog.ts";
import { DEFAULT_PLAYER_HEALTH } from "@/src/ecs/progression.ts";
import { DEFAULT_ATTACK } from "@/src/game/attack.ts";
import { DisplayName } from "@/src/game/names.ts";
import { normalizeDirection } from "@/src/grid/direction.ts";
import { doorSlideCode, KeyColor, keyColorCode, keyColorForCode } from "@/src/map/map.ts";
import type {
  DecorationDef,
  DoorDef,
  EnemyDef,
  EntityDef,
  EntityDefFor,
  EntityPrefab,
  ItemDef,
  KeyDef,
  LightDef,
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

export function createNpc(world: World, prefab: NpcPrefab): Entity {
  const entity = createGridActor(
    world,
    prefab,
    DrawableKind.Actor,
    DrawableLayer.Npc,
    spriteIdForNpc(prefab.displayName),
  );
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
  const entity = createGridActor(world, prefab, DrawableKind.Actor, DrawableLayer.Enemy, spriteIdForEnemy(archetype));
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
      [Drawable, { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure }],
      [Sprite, { id: SpriteId.UplinkTerminal }],
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
  decoration: createDecoration,
  light: createLight,
} satisfies MapEntityCreators;

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

function addExamine(world: World, entity: Entity, prefab: ExaminePrefab): void {
  if (prefab.examineTextId !== undefined) {
    world.components.addToEntity(Examine, entity, { examineTextId: prefab.examineTextId });
  }
}

export function createMapEntity(world: World, prefab: EntityDef): Entity {
  const create = MAP_ENTITY_CREATORS[prefab.prefab] as MapEntityCreator<typeof prefab.prefab>;
  return create(world, prefab);
}

export function createCorpse(world: World, position: PositionedPrefab): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, position],
      [Drawable, { kind: DrawableKind.Sprite, layer: DrawableLayer.Item }],
      [Sprite, { id: SpriteId.Corpse }],
    ] as const,
  );
}

export function createDeathEffect(world: World, position: PositionedPrefab, sprite: SpriteId): Entity {
  return world.entities.createWithOrThrow(
    [
      [GridPos, position],
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

function spriteIdForNpc(displayName: number): SpriteId {
  return displayName === DisplayName.John ? SpriteId.John : SpriteId.Npc;
}

function spriteIdForEnemy(archetype: EnemyArchetype): SpriteId {
  switch (archetype) {
    case EnemyArchetype.MeleeDog:
      return SpriteId.DigitalDog;
    case EnemyArchetype.Gunslinger:
      return SpriteId.GigabitGunslinger;
    case EnemyArchetype.NetworkNeophyte:
      return SpriteId.NetworkNeophyte;
    case EnemyArchetype.SystemSentinel:
      return SpriteId.SystemSentinel;
    case EnemyArchetype.AgenticAcolyte:
      return SpriteId.AgenticAcolyte;
  }
}

function spriteIdForItem(item: ItemKind, value: number): SpriteId {
  switch (item) {
    case ItemKind.HealthPatch:
      return SpriteId.HealthPatch;
    case ItemKind.PistolAmmo:
      return SpriteId.PistolAmmo;
    case ItemKind.CannonAmmo:
      return SpriteId.CannonAmmo;
    case ItemKind.Key:
      switch (keyColorForCode(value)) {
        case KeyColor.Red:
          return SpriteId.RedKey;
        case KeyColor.Blue:
          return SpriteId.BlueKey;
        case KeyColor.Yellow:
          return SpriteId.YellowKey;
        default:
          throw new Error(`Unknown key color code: ${value}`);
      }
    case ItemKind.UplinkCode:
      return SpriteId.UplinkCode;
    case ItemKind.Weapon:
      return value === 2 ? SpriteId.Weapon2 : SpriteId.Weapon3;
  }
}

function spriteIdForDecoration(decoration: DecorationKind): SpriteId {
  switch (decoration) {
    case DecorationKind.ServerPile:
      return SpriteId.DecorServerPile;
    case DecorationKind.Cyborg:
      return SpriteId.DecorCyborg;
    case DecorationKind.CeilingHook:
      return SpriteId.DecorCeilingHook;
    case DecorationKind.CeilingLight:
      return SpriteId.DecorCeilingLight;
    case DecorationKind.CeilingWires:
      return SpriteId.DecorCeilingWires;
  }
}

function colorChannels(color: string): readonly [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ] as const;
}
