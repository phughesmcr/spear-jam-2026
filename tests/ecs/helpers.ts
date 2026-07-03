import type { Entity, World } from "@phughesmcr/miski";
import { keyColorCode } from "@/src/map/map.ts";
import type { EntityDef, GameMap, KeyColor } from "@/src/map/map.ts";
import {
  Attack,
  type AttackSchema,
  Blocking,
  Dialogue,
  DisplayNameComponent,
  Door,
  Enemy,
  type EnemyArchetype,
  EnemyArchetypeComponent,
  EnemyAwareness,
  Examine,
  Facing,
  GridPos,
  Health,
  type HealthSchema,
  IDLE_AWARENESS,
  Interactable,
  Item,
  Locked,
  Npc,
  Player as PlayerComponent,
  TurnTaker,
  UplinkTerminal,
} from "@/src/ecs/components.ts";
import type { CardinalDirection } from "@/src/grid/direction.ts";
import type { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import type { DisplayName } from "@/src/game/names.ts";
import { ItemKind } from "@/src/game/items.ts";
import { Player } from "@/src/ecs/player.ts";
import { GameSession } from "@/src/ecs/session.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import { createPlayerState } from "@/src/game/state.ts";
import type { CommandSlot, PlayerStateInput } from "@/src/game/state.ts";

export function createEntity(world: World): Entity {
  return world.entities.createOrThrow();
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
          floor_texture: "floor",
          ceiling_texture: "ceiling",
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
  examineTextId?: number;
};

export function createTestNpc(world: World, opts: TestNpcOptions): Entity {
  const entity = createEntity(world);
  world.components.addToEntity(GridPos, entity, { x: opts.x, y: opts.y });
  world.components.addToEntity(DisplayNameComponent, entity, { displayName: opts.displayName });
  world.components.addToEntity(Npc, entity);
  if (opts.dialogueTreeId !== undefined) {
    world.components.addToEntity(Dialogue, entity, { dialogueTreeId: opts.dialogueTreeId });
  }
  if (opts.examineTextId !== undefined) {
    world.components.addToEntity(Examine, entity, { examineTextId: opts.examineTextId });
  }
  if (opts.interactable) world.components.addToEntity(Interactable, entity);
  return entity;
}

export type TestDoorOptions = {
  x: number;
  y: number;
  open?: number;
  color?: KeyColor;
  blocking?: boolean;
  interactable?: boolean;
  examineTextId?: number;
};

export function createTestDoor(world: World, opts: TestDoorOptions): Entity {
  const entity = createEntity(world);
  world.components.addToEntity(GridPos, entity, { x: opts.x, y: opts.y });
  world.components.addToEntity(Door, entity, { open: opts.open ?? 0 });
  if (opts.color !== undefined) {
    world.components.addToEntity(Locked, entity, { color: keyColorCode(opts.color) });
  }
  if (opts.examineTextId !== undefined) {
    world.components.addToEntity(Examine, entity, { examineTextId: opts.examineTextId });
  }
  if (opts.blocking) world.components.addToEntity(Blocking, entity);
  if (opts.interactable) world.components.addToEntity(Interactable, entity);
  return entity;
}

export type TestKeyOptions = {
  x: number;
  y: number;
  color: KeyColor;
};

export function createTestKey(world: World, opts: TestKeyOptions): Entity {
  const entity = createEntity(world);
  world.components.addToEntity(GridPos, entity, { x: opts.x, y: opts.y });
  world.components.addToEntity(Item, entity, { kind: ItemKind.Key, value: keyColorCode(opts.color) });
  return entity;
}

export type TestUplinkCodeOptions = {
  x: number;
  y: number;
};

export function createTestUplinkCode(world: World, opts: TestUplinkCodeOptions): Entity {
  const entity = createEntity(world);
  world.components.addToEntity(GridPos, entity, { x: opts.x, y: opts.y });
  world.components.addToEntity(Item, entity, { kind: ItemKind.UplinkCode, value: 0 });
  return entity;
}

export type TestUplinkTerminalOptions = {
  x: number;
  y: number;
  blocking?: boolean;
  interactable?: boolean;
  examineTextId?: number;
};

export function createTestUplinkTerminal(world: World, opts: TestUplinkTerminalOptions): Entity {
  const entity = createEntity(world);
  world.components.addToEntity(GridPos, entity, { x: opts.x, y: opts.y });
  world.components.addToEntity(UplinkTerminal, entity);
  if (opts.examineTextId !== undefined) {
    world.components.addToEntity(Examine, entity, { examineTextId: opts.examineTextId });
  }
  if (opts.blocking) world.components.addToEntity(Blocking, entity);
  if (opts.interactable) world.components.addToEntity(Interactable, entity);
  return entity;
}

export type TestWeaponPickupOptions = {
  x: number;
  y: number;
  slot: CommandSlot;
};

export function createTestWeaponPickup(world: World, opts: TestWeaponPickupOptions): Entity {
  const entity = createEntity(world);
  world.components.addToEntity(GridPos, entity, { x: opts.x, y: opts.y });
  world.components.addToEntity(Item, entity, { kind: ItemKind.Weapon, value: opts.slot });
  return entity;
}

export type TestItemOptions = {
  x: number;
  y: number;
  kind: ItemKind;
  amount: number;
};

export function createTestItem(world: World, opts: TestItemOptions): Entity {
  const entity = createEntity(world);
  world.components.addToEntity(GridPos, entity, { x: opts.x, y: opts.y });
  world.components.addToEntity(Item, entity, { kind: opts.kind, value: opts.amount });
  return entity;
}

export type TestEnemyOptions = {
  x: number;
  y: number;
  dir?: CardinalDirection;
  displayName: DisplayName;
  attack: AttackSchema;
  health?: HealthSchema;
  archetype?: EnemyArchetype;
  examineTextId?: number;
};

export function createTestEnemy(world: World, opts: TestEnemyOptions): Entity {
  const entity = createEntity(world);
  world.components.addToEntity(GridPos, entity, { x: opts.x, y: opts.y });
  world.components.addToEntity(Facing, entity, { dir: opts.dir ?? 1 });
  world.components.addToEntity(Blocking, entity);
  world.components.addToEntity(Enemy, entity);
  world.components.addToEntity(EnemyAwareness, entity, IDLE_AWARENESS);
  world.components.addToEntity(TurnTaker, entity);
  world.components.addToEntity(DisplayNameComponent, entity, { displayName: opts.displayName });
  world.components.addToEntity(Attack, entity, opts.attack);
  if (opts.examineTextId !== undefined) {
    world.components.addToEntity(Examine, entity, { examineTextId: opts.examineTextId });
  }
  if (opts.health !== undefined) world.components.addToEntity(Health, entity, opts.health);
  if (opts.archetype !== undefined) {
    world.components.addToEntity(EnemyArchetypeComponent, entity, { archetype: opts.archetype });
  }
  return entity;
}

export function createTestSession(
  world: World,
  playerEntity: Entity,
  map: GameMap = flatTestMap(3, 2),
  opts: {
    random?: RandomSource;
    terminalDestinations?: ReadonlyMap<Entity, string>;
    playerState?: PlayerStateInput;
  } = {},
): GameSession {
  world.refresh();
  return new GameSession(
    world,
    new Player(world, playerEntity),
    map,
    opts.random ?? (() => 0),
    opts.terminalDestinations ?? new Map(),
    createPlayerState(opts.playerState),
  );
}
