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
import type { DoorDef, EnemyDef, KeyDef, MapEntityDef, NpcDef, PlayerDef } from "@/src/map/map.ts";
import type { DisplayName } from "@/src/game/names.ts";

const DEFAULT_PLAYER_HEALTH = 10;
const DEFAULT_ENEMY_HEALTH = 3;
const DEFAULT_ENEMY_DAMAGE = 1;
const DEFAULT_ATTACK: AttackSchema = {
  minDamage: DEFAULT_ENEMY_DAMAGE,
  maxDamage: DEFAULT_ENEMY_DAMAGE,
  range: 1,
  requiresFacing: AttackFacingRequirement.Required,
  attackBonus: 2,
  critThreshold: 20,
  critMultiplier: 2,
  pattern: AttackPattern.Line,
  targets: AttackTargetMode.First,
};

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
  const entity = createEntity(world, "player");
  addGridActor(world, entity, prefab, DrawableKind.Player, DrawableLayer.Player);
  world.components.addToEntity(Player, entity);
  addHealth(world, entity, DEFAULT_PLAYER_HEALTH);
  world.components.addToEntity(Attack, entity, {
    ...DEFAULT_ATTACK,
    minDamage: 1,
    maxDamage: 2,
    attackBonus: 4,
  });
  return entity;
}

export type NpcPrefab = Omit<NpcDef, "prefab">;

export function createNpc(world: World, prefab: NpcPrefab): Entity {
  const entity = createEntity(world, "npc");
  addGridActor(world, entity, prefab, DrawableKind.Npc, DrawableLayer.Npc);
  addDisplayName(world, entity, prefab.displayName);
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

  const health = prefab.health ?? DEFAULT_ENEMY_HEALTH;
  addGridActor(world, entity, prefab, DrawableKind.Enemy, DrawableLayer.Enemy);
  addDisplayName(world, entity, prefab.displayName);
  world.components.addToEntity(Enemy, entity);
  addHealth(world, entity, health);
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

export type DoorPrefab = Omit<DoorDef, "prefab">;

export function createDoor(world: World, prefab: DoorPrefab): Entity {
  if (prefab.locked === true && prefab.lockId === undefined) {
    throw new Error("Locked door prefab is missing a lock id");
  }

  const entity = createEntity(world, "door");
  addPosition(world, entity, prefab);
  addDrawable(world, entity, DrawableKind.Door, DrawableLayer.Structure);
  world.components.addToEntity(Door, entity, { open: 0 });
  world.components.addToEntity(Interactable, entity);
  world.components.addToEntity(Blocking, entity);
  if (prefab.locked === true && prefab.lockId !== undefined) {
    world.components.addToEntity(Locked, entity, { lockId: prefab.lockId });
  }
  return entity;
}

export type KeyPrefab = Omit<KeyDef, "prefab">;

export function createKey(world: World, prefab: KeyPrefab): Entity {
  const entity = createEntity(world, "key");
  addPosition(world, entity, prefab);
  addDrawable(world, entity, DrawableKind.Key, DrawableLayer.Item);
  world.components.addToEntity(Key, entity, { lockId: prefab.lockId });
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

function addHealth(world: World, entity: Entity, health: number): void {
  world.components.addToEntity(Health, entity, { current: health, max: health });
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
