import type { Entity, World } from "@phughesmcr/miski";
import { Facing, GridPos } from "@/src/ecs/components.ts";
import type { FacingSchema, GridPosSchema } from "@/src/ecs/components.ts";
import { normalizeDirection } from "@/src/map/direction.ts";
import type { CardinalDirection, GridDelta } from "@/src/map/direction.ts";

export type PlayerState = {
  readonly heldKeys: readonly number[];
};

export class Player {
  private readonly world: World;
  private entity: Entity;

  constructor(world: World, entity: Entity) {
    this.world = world;
    this.entity = entity;
  }

  getEntity(): Entity {
    return this.entity;
  }

  setEntity(entity: Entity): void {
    this.entity = entity;
  }

  getPosition(): GridPosSchema {
    return this.world.components.getEntityData(GridPos, this.entity);
  }

  setPosition({ x, y }: GridPosSchema): void {
    this.world.components.setEntityData(GridPos, this.entity, { x, y });
  }

  moveBy(delta: GridDelta): void {
    const current = this.getPosition();
    this.setPosition({ x: current.x + delta.dx, y: current.y + delta.dy });
  }

  getFacing(): FacingSchema {
    const facing = this.world.components.getEntityData(Facing, this.entity);
    return { dir: normalizeDirection(facing.dir) };
  }

  setFacing(dir: CardinalDirection): void {
    this.world.components.setEntityData(Facing, this.entity, { dir });
  }

  turnBy(delta: number): void {
    const current = this.getFacing();
    this.setFacing(normalizeDirection(current.dir + delta));
  }
}
