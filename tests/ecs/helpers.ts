import type { Entity, World } from "@phughesmcr/miski";
import type { EntityDef, GameMap, LockId } from "@/src/map/map.ts";
import {
  Attack,
  type AttackSchema,
  Blocking,
  DisplayNameComponent,
  Dialogue,
  Door,
  Enemy,
  Facing,
  GridPos,
  Health,
  type HealthSchema,
  Interactable,
  Key,
  Locked,
  Npc,
  Player as PlayerComponent,
  TurnTaker,
} from "@/src/ecs/components.ts";
import type { CardinalDirection } from "@/src/grid/direction.ts";
import type { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import type { DisplayName } from "@/src/game/names.ts";
import { Player } from "@/src/ecs/player.ts";
import { GameSession } from "@/src/ecs/session.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import type { PlayerState } from "@/src/game/state.ts";

export function createEntity(world: World): Entity {
  const entity = world.entities.create();
  if (entity === undefined) throw new Error("Failed to create test entity");
  return entity;
}

export function flatTestMap(
  width = 3,
  height = 1,
  entities: readonly EntityDef[] = [],
): GameMap {
  const row = Array.from({ length: width }, () => 0);
  return {
    name: "Test Map",
    terrain: {
      palette: [
        {
          id: 0,
          color: "#000",
          floor_texture: "",
          ceiling_texture: "",
        },
      ],
      tiles: Array.from({ length: height }, () => [...row]),
    },
    entities,
  };
}

export type TestPlayerOptions = {
  x?: number;
  y?: number;
  dir?: CardinalDirection;
  blocking?: boolean;
  tag?: boolean;
  health?: HealthSchema;
};

export function createTestPlayer(world: World, opts: TestPlayerOptions = {}): Entity {
  const { x = 1, y = 1, dir = 1, blocking, tag, health } = opts;
  const entity = createEntity(world);
  world.components.addToEntity(GridPos, entity, { x, y });
  world.components.addToEntity(Facing, entity, { dir });
  if (blocking) world.components.addToEntity(Blocking, entity);
  if (tag) world.components.addToEntity(PlayerComponent, entity);
  if (health) world.components.addToEntity(Health, entity, health);
  return entity;
}

export type TestNpcOptions = {
  x: number;
  y: number;
  displayName: DisplayName;
  dialogueTreeId?: DialogueTreeId;
  interactable?: boolean;
};

export function createTestNpc(world: World, opts: TestNpcOptions): Entity {
  const entity = createEntity(world);
  world.components.addToEntity(GridPos, entity, { x: opts.x, y: opts.y });
  world.components.addToEntity(DisplayNameComponent, entity, { displayName: opts.displayName });
  world.components.addToEntity(Npc, entity);
  if (opts.dialogueTreeId !== undefined) {
    world.components.addToEntity(Dialogue, entity, { dialogueTreeId: opts.dialogueTreeId });
  }
  if (opts.interactable) world.components.addToEntity(Interactable, entity);
  return entity;
}

export type TestDoorOptions = {
  x: number;
  y: number;
  open?: number;
  lockId?: LockId;
  blocking?: boolean;
  interactable?: boolean;
};

export function createTestDoor(world: World, opts: TestDoorOptions): Entity {
  const entity = createEntity(world);
  world.components.addToEntity(GridPos, entity, { x: opts.x, y: opts.y });
  world.components.addToEntity(Door, entity, { open: opts.open ?? 0 });
  if (opts.lockId !== undefined) {
    world.components.addToEntity(Locked, entity, { lockId: opts.lockId });
  }
  if (opts.blocking) world.components.addToEntity(Blocking, entity);
  if (opts.interactable) world.components.addToEntity(Interactable, entity);
  return entity;
}

export type TestKeyOptions = {
  x: number;
  y: number;
  lockId: LockId;
};

export function createTestKey(world: World, opts: TestKeyOptions): Entity {
  const entity = createEntity(world);
  world.components.addToEntity(GridPos, entity, { x: opts.x, y: opts.y });
  world.components.addToEntity(Key, entity, { lockId: opts.lockId });
  return entity;
}

export type TestEnemyOptions = {
  x: number;
  y: number;
  dir?: CardinalDirection;
  displayName: DisplayName;
  attack: AttackSchema;
};

export function createTestEnemy(world: World, opts: TestEnemyOptions): Entity {
  const entity = createEntity(world);
  world.components.addToEntity(GridPos, entity, { x: opts.x, y: opts.y });
  world.components.addToEntity(Facing, entity, { dir: opts.dir ?? 1 });
  world.components.addToEntity(Blocking, entity);
  world.components.addToEntity(Enemy, entity);
  world.components.addToEntity(TurnTaker, entity);
  world.components.addToEntity(DisplayNameComponent, entity, { displayName: opts.displayName });
  world.components.addToEntity(Attack, entity, opts.attack);
  return entity;
}

export function createTestSession(
  world: World,
  playerEntity: Entity,
  map: GameMap = flatTestMap(3, 2),
  opts: { random?: RandomSource; playerState?: PlayerState } = {},
): GameSession {
  world.refresh();
  return new GameSession(
    world,
    new Player(world, playerEntity),
    map,
    opts.random ?? (() => 0),
    opts.playerState,
  );
}
