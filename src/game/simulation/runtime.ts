import { GAME_COMPONENTS, type GameComponentMap } from "@/src/game/simulation/components.ts";
import type { GameSessionContent } from "@/src/game/simulation/content.ts";
import type { MapMaterialization } from "@/src/game/simulation/map_materialization.ts";
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

export function createRuntime(materialization: MapMaterialization, content: GameSessionContent): GameRuntime {
  const { game, session: crawler } = createCrawlerGame({
    capacity: RUNTIME_CAPACITY,
    map: materialization.map,
    mapId: materialization.mapId,
    components: GAME_COMPONENTS,
    distanceMetric: "euclidean",
    entities: materialization.entities,
  });
  return {
    content,
    game,
    crawler,
    hearingField: createGridInfluenceField(materialization.map),
    pathfinder: createGridPathfinder(crawler),
  };
}
