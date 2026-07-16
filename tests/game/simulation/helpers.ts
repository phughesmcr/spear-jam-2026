import type { EntityDef } from "@/src/game/content/map_entities.ts";
import type { GameMap } from "@/src/game/world/map.ts";
import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import type { RandomSource } from "@/src/engine/random.ts";
import {
  createGameSession as createBoundGameSession,
  type GameSession,
  type GameSessionOptions,
} from "@/src/game/simulation/session.ts";
import { createRuntime as createBoundRuntime, type GameRuntime } from "@/src/game/simulation/runtime.ts";

export type { GameRuntime } from "@/src/game/simulation/runtime.ts";

export const TEST_SESSION_CONTENT = SHIPPED_GAME;

export function createRuntime(map: GameMap): GameRuntime {
  return createBoundRuntime(map, TEST_SESSION_CONTENT);
}

export function createGameSession(
  map: GameMap,
  random: RandomSource,
  options: GameSessionOptions = {},
): Promise<GameSession> {
  return createBoundGameSession(map, random, TEST_SESSION_CONTENT, options);
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
