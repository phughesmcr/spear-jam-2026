import { GAME_COMPONENTS, type GameComponentMap } from "@/src/game/simulation/components.ts";
import type { GameSessionContent } from "@/src/game/simulation/content.ts";
import type { MapMaterialization } from "@/src/game/simulation/map_materialization.ts";
import {
  type CrawlerRngInput,
  type CrawlerSimulation,
  createCrawlerSimulation,
  createGridPathfinder,
  type GridPathfinder,
} from "turn-based-engine/crawler";

const RUNTIME_CAPACITY = 1000;

export type GameRuntime = {
  readonly content: GameSessionContent;
  readonly simulation: CrawlerSimulation<GameComponentMap>;
  readonly pathfinder: GridPathfinder;
};

export function createRuntime(
  materialization: MapMaterialization,
  content: GameSessionContent,
  rng: CrawlerRngInput,
): GameRuntime {
  const simulation = createCrawlerSimulation({
    capacity: RUNTIME_CAPACITY,
    map: materialization.map,
    mapId: materialization.mapId,
    components: GAME_COMPONENTS,
    distanceMetric: "euclidean",
    entities: materialization.entities,
    rng,
  });
  return {
    content,
    simulation,
    pathfinder: createGridPathfinder(simulation.crawler),
  };
}
