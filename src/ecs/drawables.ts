import { type Entity, System, type World } from "@phughesmcr/miski";
import {
  Door,
  DrawableKind,
  EnemyArchetype,
  enemyArchetypeFor,
  Facing,
  healthFor,
  Item,
  Locked,
  UplinkTerminal,
} from "@/src/ecs/components.ts";
import { drawableRenderQuery } from "@/src/ecs/queries.ts";
import { itemIconFor, itemKindForCode } from "@/src/game/items.ts";
import type { ItemIcon } from "@/src/game/items.ts";
import { keyColorForCode } from "@/src/map/map.ts";
import type { KeyColor } from "@/src/map/map.ts";

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
  readonly enemyArchetype: EnemyArchetype | undefined;
  readonly health?: {
    readonly current: number;
    readonly max: number;
  };
};

export type DoorDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Door;
  readonly open: boolean;
  readonly locked: boolean;
  readonly color?: KeyColor;
};

export type UplinkTerminalDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.UplinkTerminal;
};

export type ItemDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Item;
  readonly icon: ItemIcon;
};

export type DrawableEntity =
  | ActorDrawableEntity
  | DoorDrawableEntity
  | UplinkTerminalDrawableEntity
  | ItemDrawableEntity;

export type DrawableEntityVisitor = (drawable: DrawableEntity) => void;

type DrawableRenderContext = {
  readonly world: World;
  readonly visit: DrawableEntityVisitor;
};
export type DrawableSystem = (context: DrawableRenderContext) => void;

export const drawableSystem = new System({
  name: "drawableSystem",
  query: drawableRenderQuery,
  callback: (components, entities, context: DrawableRenderContext): void => {
    const positionX = components.gridPos.partitions.x;
    const positionY = components.gridPos.partitions.y;
    const kind = components.drawable.partitions.kind;
    const layer = components.drawable.partitions.layer;
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
    case DrawableKind.UplinkTerminal:
      return uplinkTerminalDrawableEntityFor(world, entity, position);
    case DrawableKind.Item:
      return itemDrawableEntityFor(world, entity, position);
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
  const enemyArchetype = kind === DrawableKind.Enemy ? enemyArchetypeFor(world, entity) : undefined;
  const health = kind === DrawableKind.Enemy ? healthFor(world, entity) : undefined;
  return {
    ...position,
    kind,
    dir,
    enemyArchetype,
    ...(health === undefined ? {} : { health }),
  };
}

function doorDrawableEntityFor(
  world: World,
  entity: Entity,
  position: DrawableBase,
): DoorDrawableEntity | undefined {
  const door = world.components.readEntityData(Door, entity);
  if (door === undefined) return undefined;

  const lock = world.components.readEntityData(Locked, entity);
  return {
    ...position,
    kind: DrawableKind.Door,
    open: door.open === 1,
    locked: lock !== undefined,
    color: lock === undefined ? undefined : keyColorForCode(lock.color),
  };
}

function uplinkTerminalDrawableEntityFor(
  world: World,
  entity: Entity,
  position: DrawableBase,
): UplinkTerminalDrawableEntity | undefined {
  if (!world.components.entityHas(UplinkTerminal, entity)) return undefined;
  return {
    ...position,
    kind: DrawableKind.UplinkTerminal,
  };
}

function itemDrawableEntityFor(
  world: World,
  entity: Entity,
  position: DrawableBase,
): ItemDrawableEntity | undefined {
  const item = world.components.readEntityData(Item, entity);
  if (item === undefined) return undefined;

  const itemKind = itemKindForCode(item.kind);
  return {
    ...position,
    kind: DrawableKind.Item,
    icon: itemIconFor(itemKind, item.value),
  };
}
