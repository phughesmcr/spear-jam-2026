import type {
  DoorDef,
  EnemyDef,
  EntityDef,
  KeyDef,
  NpcDef,
  PlayerDef,
  SpearTurretDef,
} from "@/src/game/content/map_entities.ts";
import { createCrawlerMap } from "@/src/game/simulation/crawler_map.ts";
import { type MapMaterialization, materializeMap } from "@/src/game/simulation/map_materialization.ts";
import { Direction } from "@/src/game/world/direction.ts";
import type { GameMap } from "@/src/game/world/map.ts";
import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import {
  createGameSession as createBoundGameSession,
  type GameSession,
  type GameSessionOptions,
} from "@/src/game/simulation/session.ts";
import { createRuntime as createBoundRuntime, type GameRuntime } from "@/src/game/simulation/runtime.ts";
import type { Entity } from "turn-based-engine/ecs";
import type { CrawlerMutation, CrawlerTurnExecution } from "turn-based-engine/crawler";
import type { GameComponentMap } from "@/src/game/simulation/components.ts";

export type { GameRuntime } from "@/src/game/simulation/runtime.ts";

export const TEST_SESSION_CONTENT = SHIPPED_GAME;

export function createRuntime(map: GameMap): GameRuntime {
  const materialization: MapMaterialization = {
    mapId: map.name,
    map: createCrawlerMap(map),
    entities: [],
    playerStableId: 1,
  };
  return createBoundRuntime(materialization, TEST_SESSION_CONTENT, 0);
}

export function mutateRuntime<T>(
  runtime: GameRuntime,
  fn: (mutation: CrawlerMutation<GameComponentMap>) => T & (T extends PromiseLike<unknown> ? never : unknown),
): T {
  return runtime.simulation.mutateAtomically(({ mutation }) => fn(mutation));
}

export function executeRuntime<T>(
  runtime: GameRuntime,
  fn: (execution: CrawlerTurnExecution<GameComponentMap>) => T & (T extends PromiseLike<unknown> ? never : unknown),
): T {
  return runtime.simulation.executeTurn(fn).value;
}

export function createGameSession(
  map: GameMap,
  seed: number | (() => number),
  options: GameSessionOptions = {},
): GameSession {
  const value = typeof seed === "number" ? seed : Math.floor(seed() * 0x1_0000_0000);
  return createBoundGameSession(map, value, TEST_SESSION_CONTENT, options);
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
          kind: "floor",
          id: 0,
          floor_texture: "floor",
          ceiling_texture: "ceiling",
        },
      ],
      tiles: Array.from({ length: height }, () => [...row]),
    },
    entities,
  };
}

export function createPlayer(runtime: GameRuntime, prefab: Omit<PlayerDef, "prefab">, stableId?: number): Entity {
  return spawnMaterialized(runtime, { prefab: "player", ...prefab }, stableId);
}

export function createEnemy(runtime: GameRuntime, prefab: Omit<EnemyDef, "prefab">): Entity {
  return spawnMaterialized(runtime, { prefab: "enemy", ...prefab });
}

export function createNpc(runtime: GameRuntime, prefab: Omit<NpcDef, "prefab">): Entity {
  return spawnMaterialized(runtime, { prefab: "npc", ...prefab });
}

export function createDoor(runtime: GameRuntime, prefab: Omit<DoorDef, "prefab">): Entity {
  return spawnMaterialized(runtime, { prefab: "door", ...prefab });
}

export function createKey(runtime: GameRuntime, prefab: Omit<KeyDef, "prefab">): Entity {
  return spawnMaterialized(runtime, { prefab: "key", ...prefab });
}

export function createSpearTurret(runtime: GameRuntime, prefab: Omit<SpearTurretDef, "prefab">): Entity {
  return spawnMaterialized(runtime, { prefab: "spearTurret", ...prefab });
}

function spawnMaterialized(runtime: GameRuntime, entity: EntityDef, stableId?: number): Entity {
  const entities: readonly EntityDef[] = entity.prefab === "player" ?
    [entity] :
    [{ prefab: "player", x: 0, y: 0, dir: Direction.North }, entity];
  const map = flatTestMap(Math.max(entity.x + 1, 1), Math.max(entity.y + 1, 1), entities);
  const materialization = materializeMap(map, TEST_SESSION_CONTENT);
  const spec = entity.prefab === "player" ? materialization.entities[0] : materialization.entities[1];
  if (spec === undefined) throw new Error(`Failed to materialize test entity "${entity.prefab}".`);
  return runtime.simulation.mutateAtomically(({ mutation }) =>
    mutation.spawnCrawler(stableId === undefined ? spec : { ...spec, stableId })
  );
}
