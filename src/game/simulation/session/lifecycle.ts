import { createMapEntity, type PlayerPrefab } from "@/src/game/simulation/prefabs.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import { assertUniqueTargets } from "@/src/game/simulation/session/story_actions.ts";
import type { EntityDef, GameMap } from "@/src/game/world/map.ts";

export function playerSpawnFor(map: GameMap): PlayerPrefab {
  const player = map.entities.find((entity): entity is Extract<EntityDef, { readonly prefab: "player" }> =>
    entity.prefab === "player"
  );
  if (player === undefined) throw new Error("Map is missing a player spawn.");
  return player;
}

export function spawnMapEntities(runtime: GameRuntime, map: GameMap): void {
  for (const entity of map.entities) {
    if (entity.prefab !== "player") createMapEntity(runtime, entity);
  }
  assertUniqueTargets(runtime);
  runtime.crawler.assertInvariants();
}
