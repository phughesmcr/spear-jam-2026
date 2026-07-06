import type { Entity, World } from "@phughesmcr/miski";
import { Facing, GridPos } from "@/src/ecs/components.ts";
import { createMapEntity, type PlayerPrefab } from "@/src/ecs/prefabs.ts";
import { mapScopedQuery } from "@/src/ecs/queries.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { assertUniqueTargets } from "@/src/ecs/session/story_actions.ts";
import { normalizeDirection } from "@/src/grid/direction.ts";
import { VisibilityMap } from "@/src/game/visibility.ts";
import { type EntityDef, type GameMap, mapDimensions } from "@/src/map/map.ts";

const PLAYER_VISIBILITY_RADIUS = 6;

export type MapRuntimeState = {
  readonly spatial: SpatialIndex;
  readonly visibility: VisibilityMap;
};

export function replaceMapContent(world: World, playerEntity: Entity, map: GameMap): MapRuntimeState {
  const spawn = playerSpawnFor(map);
  clearMapScopedEntities(world);
  world.components.setEntityData(GridPos, playerEntity, { x: spawn.x, y: spawn.y });
  world.components.setEntityData(Facing, playerEntity, { dir: normalizeDirection(spawn.dir) });
  spawnMapScopedEntities(world, map);
  world.refresh();
  assertUniqueTargets(world);
  return rebuildRuntimeState(world, playerEntity, map);
}

export function rebuildRuntimeState(world: World, playerEntity: Entity, map: GameMap): MapRuntimeState {
  const spatial = new SpatialIndex(world, map);
  const visibility = new VisibilityMap(mapDimensions(map));
  refreshVisibility(world, playerEntity, spatial, visibility);
  return { spatial, visibility };
}

export function refreshVisibility(
  world: World,
  playerEntity: Entity,
  spatial: SpatialIndex,
  visibility: VisibilityMap,
): void {
  const position = world.components.getEntityData(GridPos, playerEntity);
  const facing = world.components.getEntityData(Facing, playerEntity);
  visibility.revealFrom(position, {
    radius: PLAYER_VISIBILITY_RADIUS,
    facing: normalizeDirection(facing.dir),
    blocksSight: (x, y) => spatial.tileBlocksSight(x, y),
  });
}

export function playerSpawnFor(map: GameMap): PlayerPrefab {
  const player = map.entities.find((entity): entity is Extract<EntityDef, { readonly prefab: "player" }> =>
    entity.prefab === "player"
  );
  if (player === undefined) throw new Error("Map is missing a player spawn.");
  return player;
}

export function spawnMapScopedEntities(world: World, map: GameMap): void {
  for (const entityDef of map.entities) {
    if (entityDef.prefab !== "player") createMapEntity(world, entityDef);
  }
}

function clearMapScopedEntities(world: World): void {
  const entities = Array.from(world.entities.query(mapScopedQuery));
  for (const entity of entities) {
    world.entities.destroy(entity);
  }
}
