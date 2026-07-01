import { type Entity, System, type World } from "@phughesmcr/miski";
import { Door, DrawableKind, Facing, Locked } from "@/src/ecs/components.ts";
import type { DrawablePartitions, GridPosPartitions } from "@/src/ecs/components.ts";
import { drawableRenderQuery } from "@/src/ecs/queries.ts";

export { DrawableKind };

type DrawableBase = {
  readonly x: number;
  readonly y: number;
};

export type ActorDrawableKind =
  | typeof DrawableKind.Player
  | typeof DrawableKind.Npc
  | typeof DrawableKind.Enemy;

export type ActorDrawableEntity = DrawableBase & {
  readonly kind: ActorDrawableKind;
  readonly dir: number;
};

export type DoorDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Door;
  readonly open: boolean;
  readonly locked: boolean;
};

export type KeyDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Key;
};

export type DrawableEntity = ActorDrawableEntity | DoorDrawableEntity | KeyDrawableEntity;

export type DrawableEntityVisitor = (drawable: DrawableEntity) => void;

type DrawableRenderContext = {
  readonly world: World;
  readonly visit: DrawableEntityVisitor;
};
type DrawableSystem = (context: DrawableRenderContext) => void;
type DrawableComponents = {
  readonly gridPos: { readonly partitions: GridPosPartitions };
  readonly drawable: { readonly partitions: DrawablePartitions };
};

const drawableSystems = new WeakMap<World, DrawableSystem>();

const drawableSystem = new System({
  name: "drawableSystem",
  query: drawableRenderQuery,
  callback: (components, entities, context: DrawableRenderContext): void => {
    const drawableComponents = components as unknown as DrawableComponents;
    const positionX = drawableComponents.gridPos.partitions.x;
    const positionY = drawableComponents.gridPos.partitions.y;
    const kind = drawableComponents.drawable.partitions.kind;
    const layer = drawableComponents.drawable.partitions.layer;
    const indices = entities.indices;
    const count = entities.count;

    // Sort back-to-front by layer; ties break on entity id for stable output.
    const ordered: Entity[] = [];
    for (let i = 0; i < count; i++) ordered.push(indices[i]!);
    ordered.sort((a, b) => layer[a]! - layer[b]! || a - b);

    for (const entity of ordered) {
      const drawable = drawableEntityFor(context.world, entity, kind[entity]!, {
        x: positionX[entity]!,
        y: positionY[entity]!,
      });
      if (drawable !== undefined) context.visit(drawable);
    }
  },
});

export function forEachDrawableEntity(world: World, visit: DrawableEntityVisitor): void {
  drawableSystemFor(world)({ world, visit });
}

function drawableSystemFor(world: World): DrawableSystem {
  const existing = drawableSystems.get(world);
  if (existing !== undefined) return existing;
  const created = world.systems.create(drawableSystem);
  drawableSystems.set(world, created);
  return created;
}

function drawableEntityFor(
  world: World,
  entity: Entity,
  kind: number,
  position: DrawableBase,
): DrawableEntity | undefined {
  switch (kind) {
    case DrawableKind.Player:
    case DrawableKind.Npc:
    case DrawableKind.Enemy:
      return actorDrawableEntityFor(world, entity, kind, position);
    case DrawableKind.Door:
      return doorDrawableEntityFor(world, entity, position);
    case DrawableKind.Key:
      return {
        ...position,
        kind: DrawableKind.Key,
      };
    default:
      return undefined;
  }
}

function actorDrawableEntityFor(
  world: World,
  entity: Entity,
  kind: ActorDrawableKind,
  position: DrawableBase,
): ActorDrawableEntity | undefined {
  if (!world.components.entityHas(Facing, entity)) return undefined;

  const { dir } = world.components.getEntityData(Facing, entity);
  return {
    ...position,
    kind,
    dir,
  };
}

function doorDrawableEntityFor(
  world: World,
  entity: Entity,
  position: DrawableBase,
): DoorDrawableEntity | undefined {
  if (!world.components.entityHas(Door, entity)) return undefined;

  const door = world.components.getEntityData(Door, entity);
  return {
    ...position,
    kind: DrawableKind.Door,
    open: door.open === 1,
    locked: world.components.entityHas(Locked, entity),
  };
}
