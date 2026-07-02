import type { DynamicComponent, Entity, World } from "@phughesmcr/miski";
import { Blocking, GridPos, Item } from "@/src/ecs/components.ts";
import { positionedQuery } from "@/src/ecs/queries.ts";
import type { Player } from "@/src/ecs/player.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import { mapDimensions, terrainAt } from "@/src/map/map.ts";
import type { ExitDef, GameMap } from "@/src/map/map.ts";

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
 * Tile-indexed view of positioned entities.
 *
 * The index is the single writer for occupancy: all position changes and
 * entity removals must go through `moveEntity`/`removeEntity`. Writing
 * `GridPos` directly or destroying positioned entities elsewhere leaves
 * the index stale.
 *
 * Every tile holds a set of occupants, so overlapping entities (e.g. two
 * blockers placed on the same tile by a bad map) stay individually tracked
 * instead of shadowing each other. Blocking and key lookups derive from
 * the entity's components, never from a cached copy.
 */
export class SpatialIndex implements SpatialLookup, SpatialMutations {
  private readonly world: World;
  private readonly width: number;
  private readonly height: number;
  private readonly terrainBlocking: Uint8Array;
  private readonly occupants: Array<Set<Entity> | undefined>;
  private readonly exits: Array<ExitDef | undefined>;
  private readonly entityTiles = new Map<Entity, number>();

  constructor(world: World, map: GameMap) {
    this.world = world;

    const { width, height } = mapDimensions(map);
    this.width = width;
    this.height = height;

    const tileCount = width * height;
    this.terrainBlocking = new Uint8Array(tileCount);
    this.occupants = new Array<Set<Entity> | undefined>(tileCount);
    this.exits = new Array<ExitDef | undefined>(tileCount);

    this.indexTerrain(map);
    this.indexEntities(map);
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

  exitAt(x: number, y: number): ExitDef | undefined {
    const tile = this.tileIndex(x, y);
    return tile === undefined ? undefined : this.exits[tile];
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
    const tile = this.tileIndex(to.x, to.y);
    if (tile === undefined) {
      throw new Error(
        `Cannot move entity ${entity} to (${to.x}, ${to.y}): outside the ${this.width}x${this.height} map.`,
      );
    }
    if (!this.entityTiles.has(entity)) {
      throw new Error(`Cannot move entity ${entity}: it is not indexed. Did it skip GridPos or bypass the index?`);
    }

    this.removeFromTile(entity);
    this.world.components.setEntityData(GridPos, entity, to);
    this.addToTile(entity, tile);
  }

  removeEntity(entity: Entity): void {
    this.removeFromTile(entity);
    this.entityTiles.delete(entity);
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

  private indexEntities(map: GameMap): void {
    for (const entity of this.world.entities.query(positionedQuery)) {
      const { x, y } = this.world.components.getEntityData(GridPos, entity);
      const tile = this.tileIndex(x, y);
      if (tile === undefined) {
        throw new Error(`Entity ${entity} at (${x}, ${y}) is outside the ${this.width}x${this.height} map.`);
      }
      this.entityTiles.set(entity, tile);
      this.addToTile(entity, tile);
    }

    for (const entity of map.entities) {
      if (entity.prefab !== "exit") continue;
      const tile = this.tileIndex(entity.x, entity.y);
      if (tile !== undefined) this.exits[tile] = entity;
    }
  }

  private occupantWith(component: DynamicComponent, x: number, y: number): Entity | undefined {
    const tile = this.tileIndex(x, y);
    if (tile === undefined) return undefined;

    const entities = this.occupants[tile];
    if (entities === undefined) return undefined;

    for (const entity of entities) {
      if (this.world.components.entityHas(component, entity)) return entity;
    }
    return undefined;
  }

  private anyEntityAt(x: number, y: number): Entity | undefined {
    const tile = this.tileIndex(x, y);
    if (tile === undefined) return undefined;

    const entities = this.occupants[tile];
    if (entities === undefined) return undefined;
    for (const entity of entities) return entity;
    return undefined;
  }

  private addToTile(entity: Entity, tile: number): void {
    this.entityTiles.set(entity, tile);
    const entities = this.occupants[tile];
    if (entities !== undefined) {
      entities.add(entity);
      return;
    }
    this.occupants[tile] = new Set([entity]);
  }

  private removeFromTile(entity: Entity): void {
    const tile = this.entityTiles.get(entity);
    if (tile === undefined) return;

    const entities = this.occupants[tile];
    if (entities === undefined) return;
    entities.delete(entity);
    if (entities.size === 0) this.occupants[tile] = undefined;
  }

  private tileIndex(x: number, y: number): number | undefined {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return undefined;
    return y * this.width + x;
  }
}
