import { GAME_COMPONENTS, type GameComponentMap } from "@/src/ecs/components.ts";
import { createCrawlerMap } from "@/src/map/crawler_map.ts";
import type { GameMap } from "@/src/map/map.ts";
import {
  type CrawlerGame,
  type CrawlerSession,
  createCrawlerGame,
  createGridPathfinder,
  type GridPathfinder,
} from "turn-based-engine/crawler";

const RUNTIME_CAPACITY = 1000;

export type GameRuntime = {
  readonly game: CrawlerGame<GameComponentMap>;
  readonly crawler: CrawlerSession<GameComponentMap>;
  readonly pathfinder: GridPathfinder;
};

export function createRuntime(map: GameMap): GameRuntime {
  const { game, session: crawler } = createCrawlerGame({
    capacity: RUNTIME_CAPACITY,
    map: createCrawlerMap(map),
    mapId: map.name,
    components: GAME_COMPONENTS,
    distanceMetric: "euclidean",
  });
  return { game, crawler, pathfinder: createGridPathfinder(crawler) };
}
