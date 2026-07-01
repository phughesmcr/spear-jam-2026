import type { Entity, Query, World } from "@phughesmcr/miski";
import { GridPos } from "@/src/ecs/components.ts";
import { blockingQuery, keyQuery, positionedQuery } from "@/src/ecs/queries.ts";
import type { Player } from "@/src/ecs/player.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import { terrainAt } from "@/src/map/map.ts";
import type { ExitDef, GameMap } from "@/src/map/map.ts";

export interface SpatialLookup {
  tileBlocks(x: number, y: number): boolean;
  blockingEntityAt(x: number, y: number): Entity | undefined;
  positionBlocks(x: number, y: number): boolean;
}

export class SpatialQueries implements SpatialLookup {
  private readonly world: World;
  private readonly map: GameMap;

  constructor(world: World, map: GameMap) {
    this.world = world;
    this.map = map;
  }

  tileBlocks(x: number, y: number): boolean {
    const terrain = terrainAt(this.map, x, y);
    return terrain ? terrain.blocking === true : true;
  }

  blockingEntityAt(x: number, y: number): Entity | undefined {
    return this.entityAt(blockingQuery, x, y);
  }

  positionBlocks(x: number, y: number): boolean {
    return this.tileBlocks(x, y) || this.blockingEntityAt(x, y) !== undefined;
  }

  keyAt(x: number, y: number): Entity | undefined {
    return this.entityAt(keyQuery, x, y);
  }

  exitAt(x: number, y: number): ExitDef | undefined {
    for (const entity of this.map.entities) {
      if (entity.prefab === "exit" && entity.x === x && entity.y === y) return entity;
    }
    return undefined;
  }

  facedEntity(player: Player): Entity | undefined {
    const current = player.getPosition();
    const { dir } = player.getFacing();
    const delta = directionDelta(dir);
    return this.entityAt(positionedQuery, current.x + delta.dx, current.y + delta.dy);
  }

  entityAt(query: Query, x: number, y: number): Entity | undefined {
    for (const entity of this.world.entities.query(query)) {
      if (!this.world.entities.isActive(entity)) continue;
      const position = this.world.components.getEntityData(GridPos, entity);
      if (position.x === x && position.y === y) return entity;
    }
    return undefined;
  }
}
