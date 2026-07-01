import type { Entity, World } from "@phughesmcr/miski";
import { Facing, GridPos } from "@/src/ecs/components.ts";
import type { FacingSchema, GridPosSchema } from "@/src/ecs/components.ts";
import { normalizeDirection } from "@/src/grid/direction.ts";
import type { CardinalDirection } from "@/src/grid/direction.ts";

export class Player {
  private readonly world: World;
  private readonly entity: Entity;

  constructor(world: World, entity: Entity) {
    this.world = world;
    this.entity = entity;
  }

  getEntity(): Entity {
    return this.entity;
  }

  getPosition(): GridPosSchema {
    return this.world.components.getEntityData(GridPos, this.entity);
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
