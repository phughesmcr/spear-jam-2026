import { GAME_COMPONENTS, type GameComponentMap } from "@/src/game/simulation/components.ts";
import { createCrawlerMap } from "@/src/game/simulation/crawler_map.ts";
import type { GameMap } from "@/src/game/world/map.ts";
import {
  type CrawlerGame,
  type CrawlerSession,
  createCrawlerGame,
  createGridInfluenceField,
  createGridPathfinder,
  type GridInfluenceField,
  type GridPathfinder,
} from "turn-based-engine/crawler";

const RUNTIME_CAPACITY = 1000;

export type GameRuntime = {
  readonly game: CrawlerGame<GameComponentMap>;
  readonly crawler: CrawlerSession<GameComponentMap>;
  readonly hearingField: GridInfluenceField;
  readonly pathfinder: GridPathfinder;
};

export function createRuntime(map: GameMap): GameRuntime {
  const crawlerMap = createCrawlerMap(map);
  const { game, session: crawler } = createCrawlerGame({
    capacity: RUNTIME_CAPACITY,
    map: crawlerMap,
    mapId: map.name,
    components: GAME_COMPONENTS,
    distanceMetric: "euclidean",
  });
  return {
    game,
    crawler,
    hearingField: createGridInfluenceField(crawlerMap),
    pathfinder: createGridPathfinder(crawler),
  };
}
