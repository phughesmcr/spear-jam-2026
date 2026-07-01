import type { Entity, World } from "@phughesmcr/miski";
import {
  Attack,
  AttackPattern,
  AttackTargetMode,
  Blocking,
  Door,
  Enemy,
  Facing,
  GridPos,
  Health,
  Interactable,
  Key,
  Locked,
  Npc,
  Player,
  TurnTaker,
} from "@/src/ecs/components.ts";
import type { AttackSchema } from "@/src/ecs/components.ts";
import { normalizeDirection } from "@/src/grid/direction.ts";
import type { LockId, MapEntityDef } from "@/src/map/map.ts";
import type { DisplayName } from "@/src/ecs/names.ts";

const DEFAULT_PLAYER_HEALTH = 10;
const DEFAULT_ENEMY_HEALTH = 3;
const DEFAULT_ENEMY_DAMAGE = 1;
const DEFAULT_ATTACK: AttackSchema = {
  minDamage: DEFAULT_ENEMY_DAMAGE,
  maxDamage: DEFAULT_ENEMY_DAMAGE,
  range: 1,
  requiresFacing: 1,
  attackBonus: 2,
  critThreshold: 20,
  critMultiplier: 2,
  pattern: AttackPattern.Line,
  targets: AttackTargetMode.First,
};

export type PlayerPrefab = {
  x: number;
  y: number;
  dir: number;
};

export function createPlayer(world: World, prefab: PlayerPrefab): Entity {
  const entity = world.entities.create();
  if (entity === undefined) throw new Error("Failed to create player entity");
  world.components.addToEntity(GridPos, entity, { x: prefab.x, y: prefab.y });
  world.components.addToEntity(Facing, entity, { dir: normalizeDirection(prefab.dir) });
  world.components.addToEntity(Player, entity);
  world.components.addToEntity(Blocking, entity);
  world.components.addToEntity(TurnTaker, entity);
  world.components.addToEntity(Health, entity, { current: DEFAULT_PLAYER_HEALTH, max: DEFAULT_PLAYER_HEALTH });
  world.components.addToEntity(Attack, entity, {
    ...DEFAULT_ATTACK,
    minDamage: 1,
    maxDamage: 2,
    attackBonus: 4,
  });
  return entity;
}

export type NpcPrefab = {
  x: number;
  y: number;
  dir: number;
  displayName: DisplayName;
};

export function createNpc(world: World, prefab: NpcPrefab): Entity {
  const entity = world.entities.create();
  if (entity === undefined) throw new Error("Failed to create npc entity");
  world.components.addToEntity(GridPos, entity, { x: prefab.x, y: prefab.y });
  world.components.addToEntity(Facing, entity, { dir: normalizeDirection(prefab.dir) });
  world.components.addToEntity(Npc, entity, { displayName: prefab.displayName });
  world.components.addToEntity(Blocking, entity);
  world.components.addToEntity(Interactable, entity);
  world.components.addToEntity(TurnTaker, entity);
  return entity;
}

export type EnemyPrefab = {
  x: number;
  y: number;
  dir: number;
  displayName: DisplayName;
  health?: number;
  damage?: number;
  attack?: Partial<AttackSchema>;
};

export function createEnemy(world: World, prefab: EnemyPrefab): Entity {
  const entity = world.entities.create();
  if (entity === undefined) throw new Error("Failed to create enemy entity");

  const health = prefab.health ?? DEFAULT_ENEMY_HEALTH;
  world.components.addToEntity(GridPos, entity, { x: prefab.x, y: prefab.y });
  world.components.addToEntity(Facing, entity, { dir: normalizeDirection(prefab.dir) });
  world.components.addToEntity(Npc, entity, { displayName: prefab.displayName });
  world.components.addToEntity(Enemy, entity);
  world.components.addToEntity(Blocking, entity);
  world.components.addToEntity(TurnTaker, entity);
  world.components.addToEntity(Health, entity, { current: health, max: health });
  world.components.addToEntity(Attack, entity, createAttackSpec(prefab));
  return entity;
}

function createAttackSpec(prefab: EnemyPrefab): AttackSchema {
  const fixedDamage = prefab.damage ?? DEFAULT_ENEMY_DAMAGE;
  return {
    ...DEFAULT_ATTACK,
    minDamage: fixedDamage,
    maxDamage: fixedDamage,
    ...prefab.attack,
  };
}

export type DoorPrefab = {
  x: number;
  y: number;
  locked?: boolean;
  lockId?: LockId;
};

export function createDoor(world: World, prefab: DoorPrefab): Entity {
  const entity = world.entities.create();
  if (entity === undefined) throw new Error("Failed to create door entity");
  if (prefab.locked === true && prefab.lockId === undefined) {
    throw new Error("Locked door prefab is missing a lock id");
  }

  world.components.addToEntity(GridPos, entity, { x: prefab.x, y: prefab.y });
  world.components.addToEntity(Door, entity, { open: 0 });
  world.components.addToEntity(Interactable, entity);
  world.components.addToEntity(Blocking, entity);
  if (prefab.locked === true && prefab.lockId !== undefined) {
    world.components.addToEntity(Locked, entity, { lockId: prefab.lockId });
  }
  return entity;
}

export type KeyPrefab = {
  x: number;
  y: number;
  lockId: LockId;
};

export function createKey(world: World, prefab: KeyPrefab): Entity {
  const entity = world.entities.create();
  if (entity === undefined) throw new Error("Failed to create key entity");
  world.components.addToEntity(GridPos, entity, { x: prefab.x, y: prefab.y });
  world.components.addToEntity(Key, entity, { lockId: prefab.lockId });
  return entity;
}

export function createMapEntity(world: World, prefab: MapEntityDef): Entity {
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
  }
}
