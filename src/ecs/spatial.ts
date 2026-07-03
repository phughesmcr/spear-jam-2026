import type { DynamicComponent, Entity, World } from "@phughesmcr/miski";
import { Blocking, GridPos, Item } from "@/src/ecs/components.ts";
import { positionedQuery } from "@/src/ecs/queries.ts";
import type { Player } from "@/src/ecs/player.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import { mapDimensions, terrainAt } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

export interface SpatialLookup {
  tileBlocks(x: number, y: number): boolean;
  blockingEntityAt(x: number, y: number): Entity | undefined;
  positionBlocks(x: number, y: number): boolean;
}

export interface SpatialMutations {
  moveEntity(entity: Entity, to: { readonly x: number; readonly y: number }): void;
  removeEntity(entity: Entity): void;
  setBlocking(entity: Entity, blocking: boolean): void;
}

export type SpatialAccess = SpatialLookup & SpatialMutations;

/**
 * Map-aware spatial view over positioned entities.
 *
 * Terrain blocking is cached because maps are static. Entity lookups scan
 * the current ECS `GridPos` state so direct ECS writes cannot leave stale
 * occupancy behind. Blocking and item lookups derive from the entity's
 * current components, never from a cached copy.
 */
export class SpatialIndex implements SpatialLookup, SpatialMutations {
  private readonly world: World;
  private readonly width: number;
  private readonly height: number;
  private readonly terrainBlocking: Uint8Array;
  private readonly positionScratch = { x: 0, y: 0 };

  constructor(world: World, map: GameMap) {
    this.world = world;

    const { width, height } = mapDimensions(map);
    this.width = width;
    this.height = height;

    const tileCount = width * height;
    this.terrainBlocking = new Uint8Array(tileCount);

    this.indexTerrain(map);
    this.validatePositionedEntities();
  }

  tileBlocks(x: number, y: number): boolean {
    const tile = this.tileIndex(x, y);
    return tile === undefined || this.terrainBlocking[tile] === 1;
  }

  blockingEntityAt(x: number, y: number): Entity | undefined {
    return this.occupantWith(Blocking, x, y);
  }

  positionBlocks(x: number, y: number): boolean {
    return this.tileBlocks(x, y) || this.blockingEntityAt(x, y) !== undefined;
  }

  itemAt(x: number, y: number): Entity | undefined {
    return this.occupantWith(Item, x, y);
  }

  facedEntity(player: Player): Entity | undefined {
    const current = player.getPosition();
    const { dir } = player.getFacing();
    const delta = directionDelta(dir);
    const x = current.x + delta.dx;
    const y = current.y + delta.dy;
    return this.blockingEntityAt(x, y) ?? this.anyEntityAt(x, y);
  }

  moveEntity(entity: Entity, to: { readonly x: number; readonly y: number }): void {
    if (this.tileIndex(to.x, to.y) === undefined) {
      throw new Error(
        `Cannot move entity ${entity} to (${to.x}, ${to.y}): outside the ${this.width}x${this.height} map.`,
      );
    }
    if (this.world.components.readEntityData(GridPos, entity) === undefined) {
      throw new Error(`Cannot move entity ${entity}: it is not indexed. Did it skip GridPos?`);
    }

    this.world.components.setEntityData(GridPos, entity, to);
  }

  removeEntity(entity: Entity): void {
    this.world.entities.destroy(entity);
  }

  setBlocking(entity: Entity, blocking: boolean): void {
    const has = this.world.components.entityHas(Blocking, entity);
    if (blocking && !has) {
      this.world.components.addToEntity(Blocking, entity);
    } else if (!blocking && has) {
      this.world.components.removeFromEntity(Blocking, entity);
    }
  }

  private indexTerrain(map: GameMap): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const terrain = terrainAt(map, x, y);
        this.terrainBlocking[y * this.width + x] = terrain === undefined || terrain.blocking === true ? 1 : 0;
      }
    }
  }

  private validatePositionedEntities(): void {
    for (const entity of this.world.entities.query(positionedQuery)) {
      const { x, y } = this.world.components.getEntityData(GridPos, entity);
      if (this.tileIndex(x, y) === undefined) {
        throw new Error(`Entity ${entity} at (${x}, ${y}) is outside the ${this.width}x${this.height} map.`);
      }
    }
  }

  private occupantWith(component: DynamicComponent, x: number, y: number): Entity | undefined {
    return this.entityAt(x, y, component);
  }

  private anyEntityAt(x: number, y: number): Entity | undefined {
    return this.entityAt(x, y);
  }

  private entityAt(x: number, y: number, component?: DynamicComponent): Entity | undefined {
    if (this.tileIndex(x, y) === undefined) return undefined;

    for (const entity of this.world.entities.query(positionedQuery)) {
      const position = this.positionScratch;
      if (!this.world.components.readEntityDataInto(GridPos, entity, position)) continue;
      if (position.x !== x || position.y !== y) continue;
      if (component === undefined || this.world.components.entityHas(component, entity)) return entity;
    }
    return undefined;
  }

  private tileIndex(x: number, y: number): number | undefined {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return undefined;
    return y * this.width + x;
  }
}
