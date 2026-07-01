import type { Entity, Query, World } from "@phughesmcr/miski";
import { Blocking, GridPos, Key } from "@/src/ecs/components.ts";
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

export interface SpatialMutations {
  moveEntity(entity: Entity, to: { readonly x: number; readonly y: number }): void;
  removeEntity(entity: Entity): void;
  setBlocking(entity: Entity, blocking: boolean): void;
}

export type SpatialAccess = SpatialLookup & SpatialMutations;

export class SpatialIndex implements SpatialLookup, SpatialMutations {
  private readonly world: World;
  private readonly map: GameMap;
  private readonly positioned = new Map<string, Set<Entity>>();
  private readonly blocking = new Map<string, Entity>();
  private readonly keys = new Map<string, Entity>();
  private readonly exits = new Map<string, ExitDef>();

  constructor(world: World, map: GameMap) {
    this.world = world;
    this.map = map;
    this.rebuild();
  }

  tileBlocks(x: number, y: number): boolean {
    const terrain = terrainAt(this.map, x, y);
    return terrain ? terrain.blocking === true : true;
  }

  blockingEntityAt(x: number, y: number): Entity | undefined {
    return this.activeEntity(this.blocking.get(coordKey(x, y)));
  }

  positionBlocks(x: number, y: number): boolean {
    return this.tileBlocks(x, y) || this.blockingEntityAt(x, y) !== undefined;
  }

  keyAt(x: number, y: number): Entity | undefined {
    return this.activeEntity(this.keys.get(coordKey(x, y)));
  }

  exitAt(x: number, y: number): ExitDef | undefined {
    return this.exits.get(coordKey(x, y));
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

    const from = this.world.components.getEntityData(GridPos, entity);
    this.removeIndexedEntity(entity, from.x, from.y);
    this.world.components.setEntityData(GridPos, entity, to);
    this.addIndexedEntity(entity, to.x, to.y);
  }

  removeEntity(entity: Entity): void {
    if (!this.world.entities.isActive(entity)) return;

    if (this.world.components.entityHas(GridPos, entity)) {
      const position = this.world.components.getEntityData(GridPos, entity);
      this.removeIndexedEntity(entity, position.x, position.y);
    }
    this.world.entities.destroy(entity);
  }

  setBlocking(entity: Entity, blocking: boolean): void {
    if (!this.world.entities.isActive(entity)) return;
    if (!this.world.components.entityHas(GridPos, entity)) return;

    const position = this.world.components.getEntityData(GridPos, entity);
    const key = coordKey(position.x, position.y);
    if (blocking) {
      this.blocking.set(key, entity);
      if (!this.world.components.entityHas(Blocking, entity)) {
        this.world.components.addToEntity(Blocking, entity);
      }
      return;
    }

    deleteIfMatching(this.blocking, key, entity);
    if (this.world.components.entityHas(Blocking, entity)) {
      this.world.components.removeFromEntity(Blocking, entity);
    }
  }

  private rebuild(): void {
    this.positioned.clear();
    this.blocking.clear();
    this.keys.clear();
    this.exits.clear();

    for (const entity of this.world.entities.query(positionedQuery)) {
      if (!this.world.entities.isActive(entity)) continue;
      const { x, y } = this.world.components.getEntityData(GridPos, entity);
      this.addPositioned(entity, x, y);
    }

    this.indexQuery(blockingQuery, this.blocking);
    this.indexQuery(keyQuery, this.keys);

    for (const entity of this.map.entities) {
      if (entity.prefab === "exit") this.exits.set(coordKey(entity.x, entity.y), entity);
    }
  }

  private indexQuery(query: Query, index: Map<string, Entity>): void {
    for (const entity of this.world.entities.query(query)) {
      if (!this.world.entities.isActive(entity)) continue;
      const { x, y } = this.world.components.getEntityData(GridPos, entity);
      index.set(coordKey(x, y), entity);
    }
  }

  private addIndexedEntity(entity: Entity, x: number, y: number): void {
    this.addPositioned(entity, x, y);
    const key = coordKey(x, y);
    if (this.world.components.entityHas(Blocking, entity)) this.blocking.set(key, entity);
    if (this.world.components.entityHas(Key, entity)) this.keys.set(key, entity);
  }

  private removeIndexedEntity(entity: Entity, x: number, y: number): void {
    const key = coordKey(x, y);
    const positioned = this.positioned.get(key);
    if (positioned !== undefined) {
      positioned.delete(entity);
      if (positioned.size === 0) this.positioned.delete(key);
    }
    deleteIfMatching(this.blocking, key, entity);
    deleteIfMatching(this.keys, key, entity);
  }

  private addPositioned(entity: Entity, x: number, y: number): void {
    const key = coordKey(x, y);
    const entities = this.positioned.get(key);
    if (entities !== undefined) {
      entities.add(entity);
      return;
    }
    this.positioned.set(key, new Set([entity]));
  }

  private positionedEntityAt(x: number, y: number): Entity | undefined {
    const entities = this.positioned.get(coordKey(x, y));
    if (entities === undefined) return undefined;

    for (const entity of entities) {
      const active = this.activeEntity(entity);
      if (active !== undefined) return active;
    }
    return undefined;
  }

  private activeEntity(entity: Entity | undefined): Entity | undefined {
    if (entity === undefined) return undefined;
    return this.world.entities.isActive(entity) ? entity : undefined;
  }
}

function coordKey(x: number, y: number): string {
  return `${x},${y}`;
}

function deleteIfMatching(index: Map<string, Entity>, key: string, entity: Entity): void {
  if (index.get(key) === entity) index.delete(key);
}
