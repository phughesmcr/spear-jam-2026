import type { Entity, World } from "@phughesmcr/miski";
import { Blocking, Door, GridPos, Interactable, Item } from "@/src/ecs/components.ts";
import { positionedQuery } from "@/src/ecs/queries.ts";
import { CARDINAL_DELTAS, directionDelta, type GridPoint } from "@/src/grid/direction.ts";
import type { GameMap } from "@/src/map/map.ts";
import { copyBaseFlags, dimensions } from "@/src/map/static_grid.ts";
import { flagsBlockAttack, flagsBlockMovement, flagsBlockSight, TileFlag } from "@/src/map/tile_flags.ts";

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
  setDoorOpen(entity: Entity, open: boolean): void;
}

export interface SpatialDistanceField {
  nextStepFrom(start: GridPoint): GridPoint | undefined;
}

export type SpatialAccess = SpatialLookup & SpatialMutations;
const EMPTY_ENTITY = -1;
const UNREACHABLE = -1;
const DOOR_BLOCKING_FLAGS = TileFlag.BlocksMove | TileFlag.BlocksSight | TileFlag.BlocksAttack;

/**
 * Map-aware spatial owner for terrain and entity occupancy.
 */
export class SpatialIndex implements SpatialLookup, SpatialMutations {
  private readonly world: World;
  private readonly width: number;
  private readonly height: number;
  private readonly baseFlags: Uint32Array;
  private readonly runtimeFlags: Uint32Array;
  private readonly blockingOccupancy: Int32Array;
  private readonly interactableOccupancy: Int32Array;
  private readonly itemOccupancy: Int32Array;
  private readonly pathQueue: Int32Array;

  constructor(world: World, map: GameMap) {
    this.world = world;

    const { width, height } = dimensions(map);
    this.width = width;
    this.height = height;

    const tileCount = width * height;
    this.baseFlags = copyBaseFlags(map);
    this.runtimeFlags = new Uint32Array(this.baseFlags);
    this.blockingOccupancy = filledEntityArray(tileCount);
    this.interactableOccupancy = filledEntityArray(tileCount);
    this.itemOccupancy = filledEntityArray(tileCount);
    this.pathQueue = new Int32Array(tileCount);

    this.refreshOccupancy();
  }

  tileBlocks(x: number, y: number): boolean {
    const tile = this.tileIndex(x, y);
    return tile === undefined || flagsBlockMovement(this.runtimeFlags[tile]!);
  }

  tileBlocksSight(x: number, y: number): boolean {
    const tile = this.tileIndex(x, y);
    return tile === undefined || flagsBlockSight(this.runtimeFlags[tile]!);
  }

  tileBlocksAttacks(x: number, y: number): boolean {
    const tile = this.tileIndex(x, y);
    return tile === undefined || flagsBlockAttack(this.runtimeFlags[tile]!);
  }

  blockingEntityAt(x: number, y: number): Entity | undefined {
    this.refreshOccupancy();
    return this.blockingEntityAtNoRefresh(x, y);
  }

  positionBlocks(x: number, y: number): boolean {
    this.refreshOccupancy();
    return this.positionBlocksNoRefresh(x, y);
  }

  itemAt(x: number, y: number): Entity | undefined {
    this.refreshOccupancy();
    return this.itemAtNoRefresh(x, y);
  }

  facedEntity(current: GridPoint, dir: number): Entity | undefined {
    this.refreshOccupancy();
    const delta = directionDelta(dir);
    const x = current.x + delta.dx;
    const y = current.y + delta.dy;
    return this.blockingEntityAtNoRefresh(x, y) ?? this.interactableAtNoRefresh(x, y) ?? this.itemAtNoRefresh(x, y);
  }

  nextStepToward(start: GridPoint, target: GridPoint): GridPoint | undefined {
    return this.distanceFieldTo(target).nextStepFrom(start);
  }

  distanceFieldTo(target: GridPoint): SpatialDistanceField {
    this.refreshOccupancy();
    const targetTile = this.tileIndex(target.x, target.y);
    const distances = new Int32Array(this.width * this.height);
    distances.fill(UNREACHABLE);
    if (targetTile === undefined) return { nextStepFrom: () => undefined };

    const targetBlocks = this.positionBlocksNoRefresh(target.x, target.y);
    let head = 0;
    let tail = 0;

    if (targetBlocks) {
      for (const delta of CARDINAL_DELTAS) {
        const x = target.x + delta.dx;
        const y = target.y + delta.dy;
        const tile = this.tileIndex(x, y);
        if (tile === undefined || this.positionBlocksNoRefresh(x, y)) continue;
        distances[tile] = 0;
        this.pathQueue[tail++] = tile;
      }
    } else {
      distances[targetTile] = 0;
      this.pathQueue[tail++] = targetTile;
    }

    while (head < tail) {
      const tile = this.pathQueue[head++]!;
      const x = tile % this.width;
      const y = Math.trunc(tile / this.width);
      const distance = distances[tile]!;

      for (const delta of CARDINAL_DELTAS) {
        const nextX = x + delta.dx;
        const nextY = y + delta.dy;
        const nextTile = this.tileIndex(nextX, nextY);
        if (nextTile === undefined || distances[nextTile] !== UNREACHABLE) continue;
        if (this.positionBlocksNoRefresh(nextX, nextY)) continue;

        distances[nextTile] = distance + 1;
        this.pathQueue[tail++] = nextTile;
      }
    }

    return { nextStepFrom: (start) => this.nextStepFromDistances(start, distances) };
  }

  moveEntity(entity: Entity, to: { readonly x: number; readonly y: number }): void {
    const toTile = this.tileIndex(to.x, to.y);
    if (toTile === undefined) {
      throw new Error(
        `Cannot move entity ${entity} to (${to.x}, ${to.y}): outside the ${this.width}x${this.height} map.`,
      );
    }
    if (this.world.components.readEntityData(GridPos, entity) === undefined) {
      throw new Error(`Cannot move entity ${entity}: it is not indexed. Did it skip GridPos?`);
    }

    this.refreshOccupancy();
    if (flagsBlockMovement(this.runtimeFlags[toTile]!)) {
      throw new Error(`Cannot move entity ${entity} to (${to.x}, ${to.y}): blocked tile.`);
    }
    if (this.world.components.entityHas(Blocking, entity)) {
      this.assertCanOccupy(this.blockingOccupancy, toTile, entity, "blocking");
    }
    if (this.world.components.entityHas(Item, entity)) {
      this.assertCanOccupy(this.itemOccupancy, toTile, entity, "item");
    }
    this.world.components.setEntityData(GridPos, entity, to);
    this.refreshOccupancy();
  }

  removeEntity(entity: Entity): void {
    this.world.entities.destroy(entity);
    this.refreshOccupancy();
  }

  setBlocking(entity: Entity, blocking: boolean): void {
    const has = this.world.components.entityHas(Blocking, entity);
    if (blocking && !has) {
      const tile = this.positionedTileFor(entity);
      this.refreshOccupancy();
      this.assertCanOccupy(this.blockingOccupancy, tile, entity, "blocking");
      this.world.components.addToEntity(Blocking, entity);
      this.refreshOccupancy();
    } else if (!blocking && has) {
      this.world.components.removeFromEntity(Blocking, entity);
      this.refreshOccupancy();
    }
  }

  setDoorOpen(entity: Entity, open: boolean): void {
    const state = this.world.components.getEntityData(Door, entity);
    const tile = this.positionedTileFor(entity);
    this.world.components.setEntityData(Door, entity, { ...state, open: open ? 1 : 0 });
    this.setDoorFlags(tile, open);
  }

  private refreshOccupancy(): void {
    this.runtimeFlags.set(this.baseFlags);
    this.blockingOccupancy.fill(EMPTY_ENTITY);
    this.interactableOccupancy.fill(EMPTY_ENTITY);
    this.itemOccupancy.fill(EMPTY_ENTITY);

    for (const entity of this.world.entities.query(positionedQuery)) {
      if (!this.world.entities.isActive(entity)) continue;
      const position = this.world.components.readEntityData(GridPos, entity);
      if (position === undefined) continue;
      const { x, y } = position;
      const tile = this.tileIndex(x, y);
      if (tile === undefined) {
        throw new Error(`Entity ${entity} at (${x}, ${y}) is outside the ${this.width}x${this.height} map.`);
      }
      if (this.world.components.entityHas(Blocking, entity)) {
        this.occupy(this.blockingOccupancy, tile, entity, "blocking");
      }
      if (this.world.components.entityHas(Interactable, entity)) {
        this.occupy(this.interactableOccupancy, tile, entity, "interactable");
      }
      if (this.world.components.entityHas(Item, entity)) {
        this.occupy(this.itemOccupancy, tile, entity, "item");
      }
      const door = this.world.components.readEntityData(Door, entity);
      if (door !== undefined) this.setDoorFlags(tile, door.open === 1);
    }
  }

  private tileIndex(x: number, y: number): number | undefined {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return undefined;
    return y * this.width + x;
  }

  private blockingEntityAtNoRefresh(x: number, y: number): Entity | undefined {
    const tile = this.tileIndex(x, y);
    if (tile === undefined) return undefined;
    return entityFromOccupancy(this.blockingOccupancy[tile]!);
  }

  private itemAtNoRefresh(x: number, y: number): Entity | undefined {
    const tile = this.tileIndex(x, y);
    if (tile === undefined) return undefined;
    return entityFromOccupancy(this.itemOccupancy[tile]!);
  }

  private interactableAtNoRefresh(x: number, y: number): Entity | undefined {
    const tile = this.tileIndex(x, y);
    if (tile === undefined) return undefined;
    return entityFromOccupancy(this.interactableOccupancy[tile]!);
  }

  private positionBlocksNoRefresh(x: number, y: number): boolean {
    return this.tileBlocks(x, y) || this.blockingEntityAtNoRefresh(x, y) !== undefined;
  }

  private positionedTileFor(entity: Entity): number {
    const position = this.world.components.readEntityData(GridPos, entity);
    if (position === undefined) {
      throw new Error(`Cannot move entity ${entity}: it is not indexed. Did it skip GridPos?`);
    }
    const tile = this.tileIndex(position.x, position.y);
    if (tile === undefined) {
      throw new Error(
        `Entity ${entity} at (${position.x}, ${position.y}) is outside the ${this.width}x${this.height} map.`,
      );
    }
    return tile;
  }

  private occupy(
    occupancy: Int32Array,
    tile: number,
    entity: Entity,
    kind: string,
  ): void {
    this.assertCanOccupy(occupancy, tile, entity, kind);
    occupancy[tile] = entity;
  }

  private assertCanOccupy(occupancy: Int32Array, tile: number, entity: Entity, kind: string): void {
    const occupant = occupancy[tile]!;
    if (occupant !== EMPTY_ENTITY && occupant !== entity) {
      throw new Error(`Duplicate ${kind} occupancy at (${tile % this.width}, ${Math.floor(tile / this.width)}).`);
    }
  }

  private setDoorFlags(tile: number, open: boolean): void {
    if (open) {
      this.runtimeFlags[tile] = this.runtimeFlags[tile]! & ~DOOR_BLOCKING_FLAGS;
    } else {
      this.runtimeFlags[tile] = this.runtimeFlags[tile]! | DOOR_BLOCKING_FLAGS;
    }
  }

  private nextStepFromDistances(start: GridPoint, distances: Int32Array): GridPoint | undefined {
    const startTile = this.tileIndex(start.x, start.y);
    if (startTile === undefined) return undefined;

    const startDistance = distances[startTile]!;
    let bestTile = UNREACHABLE;
    let bestDistance = startDistance === UNREACHABLE ? Number.MAX_SAFE_INTEGER : startDistance;

    for (const delta of CARDINAL_DELTAS) {
      const x = start.x + delta.dx;
      const y = start.y + delta.dy;
      const tile = this.tileIndex(x, y);
      if (tile === undefined || this.positionBlocksNoRefresh(x, y)) continue;

      const distance = distances[tile]!;
      if (distance === UNREACHABLE || distance >= bestDistance) continue;
      bestTile = tile;
      bestDistance = distance;
    }

    return bestTile === UNREACHABLE ? undefined : { x: bestTile % this.width, y: Math.trunc(bestTile / this.width) };
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
