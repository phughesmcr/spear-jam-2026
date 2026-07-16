import { materializeMap } from "@/src/game/simulation/map_materialization.ts";
import {
  type PlayerProgressionCheckpoint,
  restorePlayerProgressionCheckpoint,
} from "@/src/game/simulation/progression.ts";
import { createRuntime, type GameRuntime } from "@/src/game/simulation/runtime.ts";
import { assertUniqueTargets } from "@/src/game/simulation/session/story_actions.ts";
import type { GameMap } from "@/src/game/world/map.ts";
import type { Entity } from "turn-based-engine/ecs";
import type { GameSessionContent } from "@/src/game/simulation/content.ts";
import type { CrawlerRngInput } from "turn-based-engine/crawler";

export type MapSessionState = {
  readonly map: GameMap;
  readonly runtime: GameRuntime;
  readonly player: Entity;
};

export function createMapSessionState(
  map: GameMap,
  content: GameSessionContent,
  rng: CrawlerRngInput,
  checkpoint?: PlayerProgressionCheckpoint,
): MapSessionState {
  const materialization = materializeMap(map, content);
  const runtime = createRuntime(materialization, content, rng);
  const player = runtime.simulation.crawler.entityForStableId(materialization.playerStableId);
  if (player === undefined) {
    throw new Error(
      `Materialized map "${materialization.mapId}" is missing player stable ID ${materialization.playerStableId}.`,
    );
  }
  if (checkpoint !== undefined) {
    runtime.simulation.mutateAtomically(({ mutation }) =>
      restorePlayerProgressionCheckpoint(mutation, player, checkpoint)
    );
  }
  assertUniqueTargets(runtime);
  runtime.simulation.crawler.assertInvariants();
  return { map, runtime, player };
}
