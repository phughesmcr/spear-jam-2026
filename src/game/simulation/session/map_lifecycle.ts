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

export type MapSessionState = {
  readonly map: GameMap;
  readonly runtime: GameRuntime;
  readonly player: Entity;
};

export function createMapSessionState(
  map: GameMap,
  content: GameSessionContent,
  checkpoint?: PlayerProgressionCheckpoint,
): MapSessionState {
  const materialization = materializeMap(map, content);
  const runtime = createRuntime(materialization, content);
  const player = runtime.crawler.entityForStableId(materialization.playerStableId);
  if (player === undefined) {
    throw new Error(
      `Materialized map "${materialization.mapId}" is missing player stable ID ${materialization.playerStableId}.`,
    );
  }
  if (checkpoint !== undefined) restorePlayerProgressionCheckpoint(runtime.game, player, checkpoint);
  assertUniqueTargets(runtime);
  runtime.crawler.assertInvariants();
  return { map, runtime, player };
}
