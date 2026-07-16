import { GAME_COMPONENTS, type GameComponentMap } from "@/src/game/simulation/components.ts";
import { createCrawlerMap } from "@/src/game/simulation/crawler_map.ts";
import type { GameMap } from "@/src/game/world/map.ts";
import type { GameSessionContent } from "@/src/game/simulation/content.ts";
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
  readonly content: GameSessionContent;
  readonly game: CrawlerGame<GameComponentMap>;
  readonly crawler: CrawlerSession<GameComponentMap>;
  readonly hearingField: GridInfluenceField;
  readonly pathfinder: GridPathfinder;
};

export function createRuntime(map: GameMap, content: GameSessionContent): GameRuntime {
  const crawlerMap = createCrawlerMap(map);
  const { game, session: crawler } = createCrawlerGame({
    capacity: RUNTIME_CAPACITY,
    map: crawlerMap,
    mapId: map.name,
    components: GAME_COMPONENTS,
    distanceMetric: "euclidean",
  });
  return {
    content,
    game,
    crawler,
    hearingField: createGridInfluenceField(crawlerMap),
    pathfinder: createGridPathfinder(crawler),
  };
}
