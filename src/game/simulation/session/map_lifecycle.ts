import { createMapEntity, createPlayer, type PlayerPrefab } from "@/src/game/simulation/spawn/mod.ts";
import {
  type PlayerProgressionCheckpoint,
  restorePlayerProgressionCheckpoint,
} from "@/src/game/simulation/progression.ts";
import { createRuntime, type GameRuntime } from "@/src/game/simulation/runtime.ts";
import { assertUniqueTargets } from "@/src/game/simulation/session/story_actions.ts";
import type { EntityDef } from "@/src/game/content/map_entities.ts";
import type { GameMap } from "@/src/game/world/map.ts";
import type { Entity } from "turn-based-engine/ecs";

const PLAYER_STABLE_ID = 1;

export type MapSessionState = {
  readonly map: GameMap;
  readonly runtime: GameRuntime;
  readonly player: Entity;
};

export function createMapSessionState(
  map: GameMap,
  checkpoint?: PlayerProgressionCheckpoint,
): MapSessionState {
  const runtime = createRuntime(map);
  const player = createPlayer(runtime, playerSpawnFor(map), PLAYER_STABLE_ID);
  if (checkpoint !== undefined) restorePlayerProgressionCheckpoint(runtime.game, player, checkpoint);
  spawnMapEntities(runtime, map);
  return { map, runtime, player };
}

function playerSpawnFor(map: GameMap): PlayerPrefab {
  const player = map.entities.find((entity): entity is Extract<EntityDef, { readonly prefab: "player" }> =>
    entity.prefab === "player"
  );
  if (player === undefined) throw new Error("Map is missing a player spawn.");
  return player;
}

function spawnMapEntities(runtime: GameRuntime, map: GameMap): void {
  for (const entity of map.entities) {
    if (entity.prefab !== "player") createMapEntity(runtime, entity);
  }
  assertUniqueTargets(runtime);
  runtime.crawler.assertInvariants();
}
