import type { Entity, World } from "@phughesmcr/miski";
import { Blocking, GridPos, Item } from "@/src/ecs/components.ts";
import { positionedQuery } from "@/src/ecs/queries.ts";
import { CARDINAL_DELTAS, directionDelta } from "@/src/grid/direction.ts";
import type { GridPoint } from "@/src/grid/direction.ts";
import {
  mapDimensions,
  terrainAt,
  terrainBlocksAttacks,
  terrainBlocksMovement,
  terrainBlocksSight,
} from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

export interface SpatialLookup {
  tileBlocks(x: number, y: number): boolean;
  tileBlocksSight(x: number, y: number): boolean;
  tileBlocksAttacks(x: number, y: number): boolean;
  blockingEntityAt(x: number, y: number): Entity | undefined;
  positionBlocks(x: number, y: number): boolean;
}

export interface SpatialMutations {
  moveEntity(entity: Entity, to: { readonly x: number; readonly y: number }): void;
  removeEntity(entity: Entity): void;
  setBlocking(entity: Entity, blocking: boolean): void;
}

export type SpatialAccess = SpatialLookup & SpatialMutations;
const EMPTY_ENTITY = -1;
const NO_TILE = -1;

/**
 * Map-aware spatial owner for terrain and entity occupancy.
 */
export class SpatialIndex implements SpatialLookup, SpatialMutations {
  private readonly world: World;
  private readonly map: GameMap;
  private readonly width: number;
  private readonly height: number;
  private readonly blockingOccupancy: Int32Array;
  private readonly itemOccupancy: Int32Array;
  private readonly entityTiles = new Map<Entity, number>();
  private readonly blockingTiles = new Map<Entity, number>();
  private readonly itemTiles = new Map<Entity, number>();
  private pathMark = 0;
  private readonly pathMarks: Uint16Array;
  private readonly pathParents: Int32Array;
  private readonly pathQueue: Int32Array;

  constructor(world: World, map: GameMap) {
    this.world = world;
    this.map = map;

    const { width, height } = mapDimensions(map);
    this.width = width;
    this.height = height;

    const tileCount = width * height;
    this.blockingOccupancy = filledEntityArray(tileCount);
    this.itemOccupancy = filledEntityArray(tileCount);
    this.pathMarks = new Uint16Array(tileCount);
    this.pathParents = new Int32Array(tileCount);
    this.pathQueue = new Int32Array(tileCount);

    this.indexPositionedEntities();
  }

  tileBlocks(x: number, y: number): boolean {
    return terrainBlocksMovement(terrainAt(this.map, x, y));
  }

  tileBlocksSight(x: number, y: number): boolean {
    return terrainBlocksSight(terrainAt(this.map, x, y));
  }

  tileBlocksAttacks(x: number, y: number): boolean {
    return terrainBlocksAttacks(terrainAt(this.map, x, y));
  }

  blockingEntityAt(x: number, y: number): Entity | undefined {
    const tile = this.tileIndex(x, y);
    if (tile === undefined) return undefined;
    return entityFromOccupancy(this.blockingOccupancy[tile]!);
  }

  positionBlocks(x: number, y: number): boolean {
    return this.tileBlocks(x, y) || this.blockingEntityAt(x, y) !== undefined;
  }

  itemAt(x: number, y: number): Entity | undefined {
    const tile = this.tileIndex(x, y);
    if (tile === undefined) return undefined;
    return entityFromOccupancy(this.itemOccupancy[tile]!);
  }

  facedEntity(current: GridPoint, dir: number): Entity | undefined {
    const delta = directionDelta(dir);
    const x = current.x + delta.dx;
    const y = current.y + delta.dy;
    return this.blockingEntityAt(x, y) ?? this.itemAt(x, y);
  }

  nextStepToward(start: GridPoint, target: GridPoint): GridPoint | undefined {
    const startTile = this.tileIndex(start.x, start.y);
    const targetTile = this.tileIndex(target.x, target.y);
    if (startTile === undefined || targetTile === undefined) return undefined;

    const targetBlocks = this.positionBlocks(target.x, target.y);
    this.pathMark++;
    if (this.pathMark >= 0xffff) {
      this.pathMarks.fill(0);
      this.pathMark = 1;
    }
    const mark = this.pathMark;
    let head = 0;
    let tail = 0;

    this.pathMarks[startTile] = mark;
    this.pathParents[startTile] = NO_TILE;
    this.pathQueue[tail++] = startTile;

    while (head < tail) {
      const tile = this.pathQueue[head++]!;
      const x = tile % this.width;
      const y = Math.trunc(tile / this.width);
      if (
        tile !== startTile &&
        (targetBlocks ? Math.abs(x - target.x) + Math.abs(y - target.y) === 1 : tile === targetTile)
      ) {
        const step = this.firstPathStep(startTile, tile);
        return { x: step % this.width, y: Math.trunc(step / this.width) };
      }

      for (const delta of CARDINAL_DELTAS) {
        const nextX = x + delta.dx;
        const nextY = y + delta.dy;
        const nextTile = this.tileIndex(nextX, nextY);
        if (nextTile === undefined || this.pathMarks[nextTile] === mark) continue;
        if (targetBlocks && nextTile === targetTile) continue;
        if (this.positionBlocks(nextX, nextY)) continue;

        this.pathMarks[nextTile] = mark;
        this.pathParents[nextTile] = tile;
        this.pathQueue[tail++] = nextTile;
      }
    }

    return undefined;
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

    const fromTile = this.indexedTileFor(entity);
    const toTile = this.tileIndex(to.x, to.y)!;
    if (fromTile !== toTile) this.moveOccupancy(entity, toTile);
    this.entityTiles.set(entity, toTile);
    this.world.components.setEntityData(GridPos, entity, to);
  }

  removeEntity(entity: Entity): void {
    this.clearEntityOccupancy(entity);
    this.world.entities.destroy(entity);
  }

  setBlocking(entity: Entity, blocking: boolean): void {
    const has = this.world.components.entityHas(Blocking, entity);
    if (blocking && !has) {
      const tile = this.indexedTileFor(entity);
      this.occupy(this.blockingOccupancy, this.blockingTiles, tile, entity, "blocking");
      this.world.components.addToEntity(Blocking, entity);
    } else if (!blocking && has) {
      this.clearOccupancy(this.blockingOccupancy, this.blockingTiles, entity);
      this.world.components.removeFromEntity(Blocking, entity);
    }
  }

  private indexPositionedEntities(): void {
    for (const entity of this.world.entities.query(positionedQuery)) {
      const { x, y } = this.world.components.getEntityData(GridPos, entity);
      const tile = this.tileIndex(x, y);
      if (tile === undefined) {
        throw new Error(`Entity ${entity} at (${x}, ${y}) is outside the ${this.width}x${this.height} map.`);
      }
      this.entityTiles.set(entity, tile);
      if (this.world.components.entityHas(Blocking, entity)) {
        this.occupy(this.blockingOccupancy, this.blockingTiles, tile, entity, "blocking");
      }
      if (this.world.components.entityHas(Item, entity)) {
        this.occupy(this.itemOccupancy, this.itemTiles, tile, entity, "item");
      }
    }
  }

  private tileIndex(x: number, y: number): number | undefined {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return undefined;
    return y * this.width + x;
  }

  private indexedTileFor(entity: Entity): number {
    const tile = this.entityTiles.get(entity);
    if (tile === undefined) throw new Error(`Cannot move entity ${entity}: it is not indexed. Did it skip GridPos?`);
    return tile;
  }

  private moveOccupancy(entity: Entity, toTile: number): void {
    if (this.blockingTiles.has(entity)) {
      this.clearOccupancy(this.blockingOccupancy, this.blockingTiles, entity);
      this.occupy(this.blockingOccupancy, this.blockingTiles, toTile, entity, "blocking");
    }
    if (this.itemTiles.has(entity)) {
      this.clearOccupancy(this.itemOccupancy, this.itemTiles, entity);
      this.occupy(this.itemOccupancy, this.itemTiles, toTile, entity, "item");
    }
  }

  private clearEntityOccupancy(entity: Entity): void {
    this.entityTiles.delete(entity);
    this.clearOccupancy(this.blockingOccupancy, this.blockingTiles, entity);
    this.clearOccupancy(this.itemOccupancy, this.itemTiles, entity);
  }

  private occupy(
    occupancy: Int32Array,
    entityTiles: Map<Entity, number>,
    tile: number,
    entity: Entity,
    kind: string,
  ): void {
    const occupant = occupancy[tile]!;
    if (occupant !== EMPTY_ENTITY && occupant !== entity) {
      throw new Error(`Duplicate ${kind} occupancy at (${tile % this.width}, ${Math.floor(tile / this.width)}).`);
    }
    occupancy[tile] = entity;
    entityTiles.set(entity, tile);
  }

  private clearOccupancy(occupancy: Int32Array, entityTiles: Map<Entity, number>, entity: Entity): void {
    const tile = entityTiles.get(entity);
    if (tile !== undefined && occupancy[tile] === entity) occupancy[tile] = EMPTY_ENTITY;
    entityTiles.delete(entity);
  }

  private firstPathStep(startTile: number, goalTile: number): number {
    let step = goalTile;
    let parent = this.pathParents[step]!;
    while (parent !== startTile && parent !== NO_TILE) {
      step = parent;
      parent = this.pathParents[step]!;
    }
    return step;
  }
}

function filledEntityArray(length: number): Int32Array {
  const array = new Int32Array(length);
  array.fill(EMPTY_ENTITY);
  return array;
}

function entityFromOccupancy(entity: number): Entity | undefined {
  return entity === EMPTY_ENTITY ? undefined : entity;
}
