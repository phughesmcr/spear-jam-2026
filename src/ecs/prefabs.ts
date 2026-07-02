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
  Examine,
  Facing,
  GridPos,
  Health,
  Interactable,
  Item,
  ItemKind,
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
import type { DisplayName } from "@/src/game/names.ts";

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
  const entity = createEntity(world, "player");
  addGridActor(world, entity, prefab, DrawableKind.Player, DrawableLayer.Player);
  world.components.addToEntity(Player, entity);
  addHealth(world, entity, DEFAULT_PLAYER_STATE.health.max);
  return entity;
}

export type NpcPrefab = Omit<NpcDef, "prefab">;

export function createNpc(world: World, prefab: NpcPrefab): Entity {
  const entity = createEntity(world, "npc");
  addGridActor(world, entity, prefab, DrawableKind.Npc, DrawableLayer.Npc);
  addDisplayName(world, entity, prefab.displayName);
  addExamine(world, entity, prefab);
  world.components.addToEntity(Npc, entity);
  if (prefab.dialogueTreeId !== undefined && prefab.dialogueTreeId !== DialogueTreeId.None) {
    world.components.addToEntity(Dialogue, entity, { dialogueTreeId: prefab.dialogueTreeId });
  }
  world.components.addToEntity(Interactable, entity);
  return entity;
}

export type EnemyPrefab = Omit<EnemyDef, "prefab">;

export function createEnemy(world: World, prefab: EnemyPrefab): Entity {
  const entity = createEntity(world, "enemy");

  const archetype = prefab.archetype ?? EnemyArchetype.MeleeDog;
  const defaults = ENEMY_ARCHETYPE_DEFAULTS[archetype];
  const health = prefab.health ?? defaults.health;
  addGridActor(world, entity, prefab, DrawableKind.Enemy, DrawableLayer.Enemy);
  addDisplayName(world, entity, prefab.displayName);
  addExamine(world, entity, prefab);
  world.components.addToEntity(Enemy, entity);
  world.components.addToEntity(EnemyArchetypeComponent, entity, { archetype });
  addHealth(world, entity, health);
  world.components.addToEntity(Attack, entity, createAttackSpec(prefab, defaults));
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

  const entity = createEntity(world, "door");
  addPosition(world, entity, prefab);
  addDrawable(world, entity, DrawableKind.Door, DrawableLayer.Structure);
  addExamine(world, entity, prefab);
  world.components.addToEntity(Door, entity, { open: 0 });
  world.components.addToEntity(Interactable, entity);
  world.components.addToEntity(Blocking, entity);
  if (prefab.locked === true && prefab.color !== undefined) {
    world.components.addToEntity(Locked, entity, { color: keyColorCode(prefab.color) });
  }
  return entity;
}

export type KeyPrefab = Omit<KeyDef, "prefab">;

export function createKey(world: World, prefab: KeyPrefab): Entity {
  const entity = createEntity(world, "key");
  addPosition(world, entity, prefab);
  addDrawable(world, entity, DrawableKind.Key, DrawableLayer.Item);
  addItem(world, entity, ItemKind.Key, keyColorCode(prefab.color));
  return entity;
}

export type UplinkCodePrefab = Omit<UplinkCodeDef, "prefab">;

export function createUplinkCode(world: World, prefab: UplinkCodePrefab): Entity {
  const entity = createEntity(world, "uplinkCode");
  addPosition(world, entity, prefab);
  addDrawable(world, entity, DrawableKind.UplinkCode, DrawableLayer.Item);
  addItem(world, entity, ItemKind.UplinkCode, 0);
  return entity;
}

export type UplinkTerminalPrefab = Omit<UplinkTerminalDef, "prefab">;

export function createUplinkTerminal(world: World, prefab: UplinkTerminalPrefab): Entity {
  const entity = createEntity(world, "uplinkTerminal");
  addPosition(world, entity, prefab);
  addDrawable(world, entity, DrawableKind.UplinkTerminal, DrawableLayer.Structure);
  addExamine(world, entity, prefab);
  world.components.addToEntity(UplinkTerminal, entity);
  world.components.addToEntity(Interactable, entity);
  world.components.addToEntity(Blocking, entity);
  return entity;
}

export type WeaponPickupPrefab = Omit<WeaponPickupDef, "prefab">;

export function createWeaponPickup(world: World, prefab: WeaponPickupPrefab): Entity {
  const entity = createEntity(world, "weaponPickup");
  addPosition(world, entity, prefab);
  addDrawable(world, entity, DrawableKind.WeaponPickup, DrawableLayer.Item);
  addItem(world, entity, ItemKind.Weapon, prefab.slot);
  return entity;
}

export type ItemPrefab = Omit<ItemDef, "prefab">;

export function createItem(world: World, prefab: ItemPrefab): Entity {
  const entity = createEntity(world, "item");
  addPosition(world, entity, prefab);
  addDrawable(world, entity, DrawableKind.Item, DrawableLayer.Item);
  addItem(world, entity, prefab.item, prefab.amount);
  return entity;
}

function createEntity(world: World, prefabName: string): Entity {
  const entity = world.entities.create();
  if (entity === undefined) throw new Error(`Failed to create ${prefabName} entity`);
  return entity;
}

function addGridActor(
  world: World,
  entity: Entity,
  prefab: GridActorPrefab,
  kind: DrawableKind,
  layer: DrawableLayer,
): void {
  addPosition(world, entity, prefab);
  addFacing(world, entity, prefab);
  addDrawable(world, entity, kind, layer);
  world.components.addToEntity(Blocking, entity);
  world.components.addToEntity(TurnTaker, entity);
}

function addPosition(world: World, entity: Entity, prefab: PositionedPrefab): void {
  world.components.addToEntity(GridPos, entity, { x: prefab.x, y: prefab.y });
}

function addFacing(world: World, entity: Entity, prefab: FacingPrefab): void {
  world.components.addToEntity(Facing, entity, { dir: normalizeDirection(prefab.dir) });
}

function addDrawable(world: World, entity: Entity, kind: DrawableKind, layer: DrawableLayer): void {
  world.components.addToEntity(Drawable, entity, { kind, layer });
}

function addDisplayName(world: World, entity: Entity, displayName: DisplayName): void {
  world.components.addToEntity(DisplayNameComponent, entity, { displayName });
}

function addExamine(world: World, entity: Entity, prefab: ExaminePrefab): void {
  if (prefab.examineTextId !== undefined) {
    world.components.addToEntity(Examine, entity, { examineTextId: prefab.examineTextId });
  }
}

function addHealth(world: World, entity: Entity, health: number): void {
  world.components.addToEntity(Health, entity, { current: health, max: health });
}

function addItem(world: World, entity: Entity, kind: ItemKind, value: number): void {
  world.components.addToEntity(Item, entity, { kind, value });
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
