import { createMapEntity, type PlayerPrefab } from "@/src/ecs/prefabs.ts";
import type { GameRuntime } from "@/src/ecs/runtime.ts";
import { assertUniqueTargets } from "@/src/ecs/session/story_actions.ts";
import type { EntityDef, GameMap } from "@/src/map/map.ts";

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
