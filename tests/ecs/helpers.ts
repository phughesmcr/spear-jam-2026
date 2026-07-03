import type { Entity, World } from "@phughesmcr/miski";
import type { EntityDef, GameMap } from "@/src/map/map.ts";

export function createEntity(world: World): Entity {
  return world.entities.createOrThrow();
}

export function flatTestMap(
  width = 3,
  height = 1,
  entities: readonly EntityDef[] = [],
): GameMap {
  const row = Array.from({ length: width }, () => 0);
  return {
    name: "Test Map",
    terrain: {
      palette: [
        {
          id: 0,
          color: "#000",
          floor_texture: "floor",
          ceiling_texture: "ceiling",
        },
      ],
      tiles: Array.from({ length: height }, () => [...row]),
    },
    entities,
  };
}
