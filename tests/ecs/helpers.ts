import type { Entity, World } from "@phughesmcr/miski";
import type { EntityDef, GameMap } from "@/src/map/map.ts";

export function createEntity(world: World): Entity {
  const entity = world.entities.create();
  if (entity === undefined) throw new Error("Failed to create test entity");
  return entity;
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
          floor_texture: "",
          ceiling_texture: "",
        },
      ],
      tiles: Array.from({ length: height }, () => [...row]),
    },
    entities,
  };
}
