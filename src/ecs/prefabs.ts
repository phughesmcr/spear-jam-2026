import type { Entity, World } from "@phughesmcr/miski";
import { Blocking, Facing, GridPos, Player } from "@/src/ecs/components.ts";
import { normalizeDirection } from "@/src/map/direction.ts";

export type PlayerPrefab = {
  x: number;
  y: number;
  dir: number;
};

export function createPlayer(world: World, prefab: PlayerPrefab): Entity {
  const entity = world.entities.create();
  if (entity === undefined) throw new Error("Failed to create player entity");
  world.components.addToEntity(GridPos, entity, { x: prefab.x, y: prefab.y });
  world.components.addToEntity(Facing, entity, { dir: normalizeDirection(prefab.dir) });
  world.components.addToEntity(Player, entity);
  world.components.addToEntity(Blocking, entity);
  return entity;
}
