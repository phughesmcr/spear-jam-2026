import { Blocking, Door, Glass, GridPos, Interactable, Item } from "@/src/ecs/components.ts";
import { positionedQuery } from "@/src/ecs/queries.ts";
import { CARDINAL_DELTAS, directionDelta, type GridPoint } from "@/src/grid/direction.ts";
import { authoredEnemyCount, type GameMap } from "@/src/map/map.ts";
import { copyBaseFlags, dimensions } from "@/src/map/static_grid.ts";
import { flagsBlockAttack, flagsBlockMovement, flagsBlockSight, TileFlag } from "@/src/map/tile_flags.ts";
import type { Entity, World } from "@phughesmcr/miski";

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

export type SpatialAccess = SpatialLookup & SpatialMutations;
const EMPTY_ENTITY = -1;
const UNREACHABLE = -1;
const DOOR_BLOCKING_FLAGS = TileFlag.BlocksMove | TileFlag.BlocksSight | TileFlag.BlocksAttack;
/** Glass doors block passage and attacks but remain see-through, like barrier glass. */
const GLASS_DOOR_BLOCKING_FLAGS = TileFlag.BlocksMove | TileFlag.BlocksAttack;
const SCRATCH_PATH_SLOT = 0;

/**
 * Map-aware spatial owner for terrain and entity occupancy.
 */
export class SpatialIndex implements SpatialLookup, SpatialMutations {
  private readonly world: World;
  private readonly width: number;
  private readonly height: number;
  private readonly tileCount: number;
  private readonly baseFlags: Uint32Array;
  private readonly runtimeFlags: Uint32Array;
  private readonly blockingOccupancy: Int32Array;
  private readonly interactableOccupancy: Int32Array;
  private readonly itemOccupancy: Int32Array;
  private readonly pathQueue: Int32Array;
  private readonly pathPoolSize: number;
  private readonly pathDistances: Int32Array;
  private readonly pathTargetX: Int32Array;
  private readonly pathTargetY: Int32Array;
  private readonly pathSlotBuilt: Uint8Array;
  private pathSlotsUsed = 0;
  private enemyPathingPhase = false;
  /** When true, nested occupancy queries reuse the snapshot from {@link withFreshOccupancy}. */
  private occupancyHeld = false;

  constructor(world: World, map: GameMap) {
    this.world = world;

    const { width, height } = dimensions(map);
    this.width = width;
    this.height = height;

    const tileCount = width * height;
    this.tileCount = tileCount;
    this.baseFlags = copyBaseFlags(map);
    this.runtimeFlags = new Uint32Array(this.baseFlags);
    this.blockingOccupancy = filledEntityArray(tileCount);
    this.interactableOccupancy = filledEntityArray(tileCount);
    this.itemOccupancy = filledEntityArray(tileCount);
    this.pathQueue = new Int32Array(tileCount);

    const pathPoolSize = Math.max(1, authoredEnemyCount(map));
    this.pathPoolSize = pathPoolSize;
    this.pathDistances = new Int32Array(pathPoolSize * tileCount);
    this.pathTargetX = new Int32Array(pathPoolSize);
    this.pathTargetY = new Int32Array(pathPoolSize);
    this.pathSlotBuilt = new Uint8Array(pathPoolSize);

    this.refreshOccupancy();
  }

  beginEnemyPathingPhase(): void {
    this.enemyPathingPhase = true;
    this.pathSlotsUsed = 0;
    this.pathSlotBuilt.fill(0);
  }

  endEnemyPathingPhase(): void {
    this.enemyPathingPhase = false;
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

  /**
   * Refresh occupancy once, then run `fn` without rebuilding on nested queries.
   * Use for multi-tile scans (weapon range, pathing) that would otherwise
   * re-walk every positioned entity per cell.
   */
  withFreshOccupancy<T>(fn: () => T): T {
    if (this.occupancyHeld) return fn();
    this.refreshOccupancy();
    this.occupancyHeld = true;
    try {
      return fn();
    } finally {
      this.occupancyHeld = false;
    }
  }

  nextStepToward(start: GridPoint, target: GridPoint): GridPoint | undefined {
    const slot = this.resolvePathSlot(target);
    if (!this.enemyPathingPhase || this.pathSlotBuilt[slot] === 0) {
      this.fillDistanceField(slot, target);
      if (this.enemyPathingPhase) this.pathSlotBuilt[slot] = 1;
    }
    return this.nextStepFromSlot(start, slot);
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
    this.setDoorFlags(tile, open, this.world.components.entityHas(Glass, entity));
  }

  private resolvePathSlot(target: GridPoint): number {
    if (!this.enemyPathingPhase) return SCRATCH_PATH_SLOT;

    const targetX = target.x;
    const targetY = target.y;
    for (let slot = 0; slot < this.pathSlotsUsed; slot++) {
      if (this.pathTargetX[slot] === targetX && this.pathTargetY[slot] === targetY) return slot;
    }

    if (this.pathSlotsUsed >= this.pathPoolSize) {
      throw new Error(
        `Enemy pathing cache exhausted: ${this.pathSlotsUsed} unique targets exceed the authored enemy pool size of ${this.pathPoolSize}.`,
      );
    }

    const slot = this.pathSlotsUsed;
    this.pathSlotsUsed++;
    this.pathTargetX[slot] = targetX;
    this.pathTargetY[slot] = targetY;
    return slot;
  }

  private fillDistanceField(slot: number, target: GridPoint): void {
    this.refreshOccupancy();

    const base = slot * this.tileCount;
    const distances = this.pathDistances;
    distances.fill(UNREACHABLE, base, base + this.tileCount);

    const targetTile = this.tileIndex(target.x, target.y);
    if (targetTile === undefined) return;

    const targetBlocks = this.positionBlocksNoRefresh(target.x, target.y);
    let head = 0;
    let tail = 0;

    if (targetBlocks) {
      for (let index = 0; index < CARDINAL_DELTAS.length; index++) {
        const delta = CARDINAL_DELTAS[index]!;
        const x = target.x + delta.dx;
        const y = target.y + delta.dy;
        const tile = this.tileIndex(x, y);
        if (tile === undefined || this.positionBlocksNoRefresh(x, y)) continue;
        distances[base + tile] = 0;
        this.pathQueue[tail++] = tile;
      }
    } else {
      distances[base + targetTile] = 0;
      this.pathQueue[tail++] = targetTile;
    }

    while (head < tail) {
      const tile = this.pathQueue[head++]!;
      const x = tile % this.width;
      const y = Math.trunc(tile / this.width);
      const distance = distances[base + tile]!;

      for (let index = 0; index < CARDINAL_DELTAS.length; index++) {
        const delta = CARDINAL_DELTAS[index]!;
        const nextX = x + delta.dx;
        const nextY = y + delta.dy;
        const nextTile = this.tileIndex(nextX, nextY);
        if (nextTile === undefined || distances[base + nextTile] !== UNREACHABLE) continue;
        if (this.positionBlocksNoRefresh(nextX, nextY)) continue;

        distances[base + nextTile] = distance + 1;
        this.pathQueue[tail++] = nextTile;
      }
    }
  }

  private refreshOccupancy(): void {
    if (this.occupancyHeld) return;

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
      if (door !== undefined) {
        this.setDoorFlags(tile, door.open === 1, this.world.components.entityHas(Glass, entity));
      }
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

  private setDoorFlags(tile: number, open: boolean, glass: boolean): void {
    this.runtimeFlags[tile] = this.runtimeFlags[tile]! & ~DOOR_BLOCKING_FLAGS;
    if (!open) {
      const flags = glass ? GLASS_DOOR_BLOCKING_FLAGS : DOOR_BLOCKING_FLAGS;
      this.runtimeFlags[tile] = this.runtimeFlags[tile]! | flags;
    }
  }

  private nextStepFromSlot(start: GridPoint, slot: number): GridPoint | undefined {
    const startTile = this.tileIndex(start.x, start.y);
    if (startTile === undefined) return undefined;

    const base = slot * this.tileCount;
    const distances = this.pathDistances;
    const startDistance = distances[base + startTile]!;
    let bestTile = UNREACHABLE;
    let bestDistance = startDistance === UNREACHABLE ? Number.MAX_SAFE_INTEGER : startDistance;

    for (let index = 0; index < CARDINAL_DELTAS.length; index++) {
      const delta = CARDINAL_DELTAS[index]!;
      const x = start.x + delta.dx;
      const y = start.y + delta.dy;
      const tile = this.tileIndex(x, y);
      if (tile === undefined || this.positionBlocksNoRefresh(x, y)) continue;

      const distance = distances[base + tile]!;
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
