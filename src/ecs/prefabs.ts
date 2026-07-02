import type { Entity, World } from "@phughesmcr/miski";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import {
  Attack,
  AttackFacingRequirement,
  AttackPattern,
  AttackTargetMode,
  Blocking,
  Dialogue,
  DisplayNameComponent,
  Door,
  Drawable,
  DrawableKind,
  DrawableLayer,
  Enemy,
  EnemyArchetype,
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
  TurnTaker,
  UplinkTerminal,
} from "@/src/ecs/components.ts";
import type { AttackSchema } from "@/src/ecs/components.ts";
import { DEFAULT_ATTACK } from "@/src/game/attack.ts";
import { normalizeDirection } from "@/src/grid/direction.ts";
import { keyColorCode } from "@/src/map/map.ts";
import { DEFAULT_PLAYER_STATE } from "@/src/game/state.ts";
import { ItemKind } from "@/src/game/items.ts";
import type {
  DoorDef,
  EnemyDef,
  EntityDef,
  ItemDef,
  KeyDef,
  NpcDef,
  PlayerDef,
  UplinkCodeDef,
  UplinkTerminalDef,
  WeaponPickupDef,
} from "@/src/map/map.ts";

type EnemyArchetypeDefaults = {
  readonly health: number;
  readonly damage: number;
  readonly attack: Partial<AttackSchema>;
};

const ENEMY_ARCHETYPE_DEFAULTS: Readonly<Record<EnemyArchetype, EnemyArchetypeDefaults>> = {
  [EnemyArchetype.MeleeDog]: {
    health: 2,
    damage: 1,
    attack: {
      attackBonus: 4,
      range: 1,
    },
  },
  [EnemyArchetype.Gunslinger]: {
    health: 2,
    damage: 1,
    attack: {
      attackBonus: 3,
      range: 4,
    },
  },
  [EnemyArchetype.NetworkNeophyte]: {
    health: 3,
    damage: 1,
    attack: {
      attackBonus: 2,
      range: 1,
    },
  },
  [EnemyArchetype.SystemSentinel]: {
    health: 7,
    damage: 2,
    attack: {
      attackBonus: 4,
      range: 1,
    },
  },
  [EnemyArchetype.AgenticAcolyte]: {
    health: 4,
    damage: 2,
    attack: {
      requiresFacing: AttackFacingRequirement.None,
      attackBonus: 3,
      range: 2,
      pattern: AttackPattern.Adjacent,
      targets: AttackTargetMode.All,
    },
  },
};

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
      [Health, { current: DEFAULT_PLAYER_STATE.health.max, max: DEFAULT_PLAYER_STATE.health.max }],
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
  const archetype = prefab.archetype ?? EnemyArchetype.MeleeDog;
  const defaults = ENEMY_ARCHETYPE_DEFAULTS[archetype];
  const health = prefab.health ?? defaults.health;
  const entity = createGridActor(world, prefab, DrawableKind.Enemy, DrawableLayer.Enemy);
  world.components.addBundle(
    entity,
    [
      [DisplayNameComponent, { displayName: prefab.displayName }],
      [Enemy],
      [EnemyAwareness, IDLE_AWARENESS],
      [EnemyArchetypeComponent, { archetype }],
      [Health, { current: health, max: health }],
      [Attack, createAttackSpec(prefab, defaults)],
    ] as const,
  );
  addExamine(world, entity, prefab);
  return entity;
}

function createAttackSpec(prefab: EnemyPrefab, defaults: EnemyArchetypeDefaults): AttackSchema {
  const fixedDamage = prefab.damage ?? defaults.damage;
  return {
    ...DEFAULT_ATTACK,
    ...defaults.attack,
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
      [Door, { open: 0 }],
      [Interactable],
      [Blocking],
    ] as const,
  );
  addExamine(world, entity, prefab);
  if (prefab.locked === true && prefab.color !== undefined) {
    world.components.addToEntity(Locked, entity, { color: keyColorCode(prefab.color) });
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
  switch (prefab.prefab) {
    case "player":
      return createPlayer(world, prefab);
    case "npc":
      return createNpc(world, prefab);
    case "enemy":
      return createEnemy(world, prefab);
    case "door":
      return createDoor(world, prefab);
    case "key":
      return createKey(world, prefab);
    case "uplinkCode":
      return createUplinkCode(world, prefab);
    case "uplinkTerminal":
      return createUplinkTerminal(world, prefab);
    case "weaponPickup":
      return createWeaponPickup(world, prefab);
    case "item":
      return createItem(world, prefab);
  }
}
