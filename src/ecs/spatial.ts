import type { Entity, World } from "@phughesmcr/miski";
import { Blocking, GridPos, Key } from "@/src/ecs/components.ts";
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

const EMPTY_ENTITY = -1;
const NO_TILE = -1;

export class SpatialIndex implements SpatialLookup, SpatialMutations {
  private readonly world: World;
  private readonly map: GameMap;
  private readonly width: number;
  private readonly height: number;
  private readonly terrainBlocking: Uint8Array;
  private readonly positioned: Array<Set<Entity> | undefined>;
  private readonly blocking: Int32Array;
  private readonly keys: Int32Array;
  private readonly exits: Array<ExitDef | undefined>;
  private entityTiles = new Int32Array(0);

  constructor(world: World, map: GameMap) {
    this.world = world;
    this.map = map;

    const { width, height } = mapDimensions(map);
    this.width = width;
    this.height = height;

    const tileCount = width * height;
    this.terrainBlocking = new Uint8Array(tileCount);
    this.positioned = new Array<Set<Entity> | undefined>(tileCount);
    this.blocking = emptyEntityArray(tileCount);
    this.keys = emptyEntityArray(tileCount);
    this.exits = new Array<ExitDef | undefined>(tileCount);

    this.indexTerrain();
    this.rebuild();
  }

  tileBlocks(x: number, y: number): boolean {
    const tile = this.tileIndex(x, y);
    return tile === undefined || this.terrainBlocking[tile] === 1;
  }

  blockingEntityAt(x: number, y: number): Entity | undefined {
    const tile = this.tileIndex(x, y);
    if (tile === undefined) return undefined;
    return this.activeEntityAt(this.blocking[tile], tile);
  }

  positionBlocks(x: number, y: number): boolean {
    return this.tileBlocks(x, y) || this.blockingEntityAt(x, y) !== undefined;
  }

  keyAt(x: number, y: number): Entity | undefined {
    const tile = this.tileIndex(x, y);
    if (tile === undefined) return undefined;
    return this.activeEntityAt(this.keys[tile], tile);
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
    return this.blockingEntityAt(x, y) ?? this.positionedEntityAt(x, y);
  }

  moveEntity(entity: Entity, to: { readonly x: number; readonly y: number }): void {
    if (!this.world.entities.isActive(entity)) return;
    if (!this.world.components.entityHas(GridPos, entity)) return;

    const fromTile = this.entityTile(entity);
    if (fromTile !== undefined) this.removeIndexedEntityAtTile(entity, fromTile);
    this.world.components.setEntityData(GridPos, entity, to);
    this.addIndexedEntity(entity, to.x, to.y);
  }

  removeEntity(entity: Entity): void {
    if (!this.world.entities.isActive(entity)) return;

    const tile = this.entityTile(entity);
    if (tile !== undefined) this.removeIndexedEntityAtTile(entity, tile);
    this.world.entities.destroy(entity);
  }

  setBlocking(entity: Entity, blocking: boolean): void {
    if (!this.world.entities.isActive(entity)) return;
    if (!this.world.components.entityHas(GridPos, entity)) return;

    const tile = this.ensureCurrentIndexedTile(entity);
    const index = entityIndex(entity);
    if (blocking) {
      if (tile !== undefined) this.blocking[tile] = index;
      if (!this.world.components.entityHas(Blocking, entity)) {
        this.world.components.addToEntity(Blocking, entity);
      }
      return;
    }

    if (tile !== undefined && this.blocking[tile] === index) {
      this.blocking[tile] = EMPTY_ENTITY;
    }
    if (this.world.components.entityHas(Blocking, entity)) {
      this.world.components.removeFromEntity(Blocking, entity);
    }
  }

  private indexTerrain(): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const terrain = terrainAt(this.map, x, y);
        this.terrainBlocking[this.tileOffset(x, y)] = terrain === undefined || terrain.blocking === true ? 1 : 0;
      }
    }
  }

  private rebuild(): void {
    this.positioned.fill(undefined);
    this.blocking.fill(EMPTY_ENTITY);
    this.keys.fill(EMPTY_ENTITY);
    this.exits.fill(undefined);
    this.entityTiles = new Int32Array(0);

    for (const entity of this.world.entities.query(positionedQuery)) {
      if (!this.world.entities.isActive(entity)) continue;
      const { x, y } = this.world.components.getEntityData(GridPos, entity);
      this.addIndexedEntity(entity, x, y);
    }

    for (const entity of this.map.entities) {
      if (entity.prefab !== "exit") continue;
      const tile = this.tileIndex(entity.x, entity.y);
      if (tile !== undefined) this.exits[tile] = entity;
    }
  }

  private addIndexedEntity(entity: Entity, x: number, y: number): void {
    const previousTile = this.entityTile(entity);
    const tile = this.tileIndex(x, y);
    if (previousTile !== undefined && previousTile !== tile) {
      this.removeIndexedEntityAtTile(entity, previousTile);
    }

    this.setEntityTile(entity, tile ?? NO_TILE);
    if (tile === undefined) return;

    this.addPositioned(entity, tile);
    if (this.world.components.entityHas(Blocking, entity)) this.blocking[tile] = entityIndex(entity);
    if (this.world.components.entityHas(Key, entity)) this.keys[tile] = entityIndex(entity);
  }

  private removeIndexedEntityAtTile(entity: Entity, tile: number): void {
    const positioned = this.positioned[tile];
    if (positioned !== undefined) {
      positioned.delete(entity);
      if (positioned.size === 0) this.positioned[tile] = undefined;
    }

    const index = entityIndex(entity);
    if (this.blocking[tile] === index) this.blocking[tile] = EMPTY_ENTITY;
    if (this.keys[tile] === index) this.keys[tile] = EMPTY_ENTITY;
    if (this.entityTile(entity) === tile) this.setEntityTile(entity, NO_TILE);
  }

  private addPositioned(entity: Entity, tile: number): void {
    const entities = this.positioned[tile];
    if (entities !== undefined) {
      entities.add(entity);
      return;
    }
    this.positioned[tile] = new Set([entity]);
  }

  private positionedEntityAt(x: number, y: number): Entity | undefined {
    const tile = this.tileIndex(x, y);
    if (tile === undefined) return undefined;

    const entities = this.positioned[tile];
    if (entities === undefined) return undefined;

    for (const entity of entities) {
      if (this.entityOccupiesTile(entity, tile)) return entity;
      this.removeIndexedEntityAtTile(entity, tile);
    }
    return undefined;
  }

  private activeEntityAt(value: number | undefined, tile: number): Entity | undefined {
    if (value === undefined || value === EMPTY_ENTITY) return undefined;

    const entity = value as Entity;
    if (this.entityOccupiesTile(entity, tile)) return entity;
    this.removeIndexedEntityAtTile(entity, tile);
    return undefined;
  }

  private entityOccupiesTile(entity: Entity, tile: number): boolean {
    if (!this.world.entities.isActive(entity)) return false;
    if (!this.world.components.entityHas(GridPos, entity)) return false;
    return this.entityTile(entity) === tile && this.gridPosTile(entity) === tile;
  }

  private ensureCurrentIndexedTile(entity: Entity): number | undefined {
    const tile = this.entityTile(entity);
    const gridTile = this.gridPosTile(entity);
    if (tile !== undefined && tile !== gridTile) {
      this.removeIndexedEntityAtTile(entity, tile);
    }
    if (gridTile !== undefined && this.entityTile(entity) === undefined) {
      const position = this.world.components.getEntityData(GridPos, entity);
      this.addIndexedEntity(entity, position.x, position.y);
    }
    return this.entityTile(entity);
  }

  private gridPosTile(entity: Entity): number | undefined {
    const { x, y } = this.world.components.getEntityData(GridPos, entity);
    return this.tileIndex(x, y);
  }

  private entityTile(entity: Entity): number | undefined {
    const index = entityIndex(entity);
    if (index >= this.entityTiles.length) return undefined;
    const tile = this.entityTiles[index];
    return tile === NO_TILE ? undefined : tile;
  }

  private setEntityTile(entity: Entity, tile: number): void {
    this.ensureEntityCapacity(entity);
    this.entityTiles[entityIndex(entity)] = tile;
  }

  private ensureEntityCapacity(entity: Entity): void {
    const index = entityIndex(entity);
    if (index < this.entityTiles.length) return;

    let nextLength = Math.max(8, this.entityTiles.length);
    while (nextLength <= index) nextLength *= 2;

    const nextTiles = new Int32Array(nextLength);
    nextTiles.fill(NO_TILE);
    nextTiles.set(this.entityTiles);
    this.entityTiles = nextTiles;
  }

  private tileIndex(x: number, y: number): number | undefined {
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return undefined;
    return this.tileOffset(x, y);
  }

  private tileOffset(x: number, y: number): number {
    return y * this.width + x;
  }
}

function emptyEntityArray(length: number): Int32Array {
  const array = new Int32Array(length);
  array.fill(EMPTY_ENTITY);
  return array;
}

function entityIndex(entity: Entity): number {
  return entity as number;
}
