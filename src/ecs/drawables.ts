import { type Entity, System } from "@phughesmcr/miski";
import { DrawableKind, EnemyArchetype, enemyArchetypeForCode } from "@/src/ecs/components.ts";
import { drawableRenderQuery } from "@/src/ecs/queries.ts";
import { itemIconFor, itemKindForCode } from "@/src/game/items.ts";
import type { ItemIcon } from "@/src/game/items.ts";
import { keyColorForCode } from "@/src/map/map.ts";
import type { KeyColor } from "@/src/map/map.ts";

export { DrawableKind };

type DrawableBase = {
  /** Stable ECS entity id, e.g. for animating an entity across turns. */
  readonly entity: Entity;
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
  readonly visit: DrawableEntityVisitor;
};
export type DrawableSystem = (context: DrawableRenderContext) => void;
type DrawableComponents = typeof drawableRenderQuery["$inferComponents"];

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
      const drawable = drawableEntityFor(components, entity, kind[entity]!, {
        entity,
        x: positionX[entity]!,
        y: positionY[entity]!,
      });
      if (drawable !== undefined) context.visit(drawable);
    }
  },
});

function drawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  kind: number,
  position: DrawableBase,
): DrawableEntity | undefined {
  switch (kind) {
    case DrawableKind.Player:
    case DrawableKind.Npc:
    case DrawableKind.Enemy:
      return actorDrawableEntityFor(components, entity, kind, position);
    case DrawableKind.Door:
      return doorDrawableEntityFor(components, entity, position);
    case DrawableKind.UplinkTerminal:
      return uplinkTerminalDrawableEntityFor(components, entity, position);
    case DrawableKind.Item:
      return itemDrawableEntityFor(components, entity, position);
    default:
      return undefined;
  }
}

function actorDrawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  kind: ActorDrawableKind,
  position: DrawableBase,
): ActorDrawableEntity | undefined {
  if (!components.facing.has(entity)) return undefined;

  const dir = components.facing.partitions.dir[entity]!;
  const enemyArchetype = kind === DrawableKind.Enemy ? enemyArchetypeForEntity(components, entity) : undefined;
  const health = kind === DrawableKind.Enemy ? healthForEntity(components, entity) : undefined;
  return {
    ...position,
    kind,
    dir,
    enemyArchetype,
    ...(health === undefined ? {} : { health }),
  };
}

function doorDrawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  position: DrawableBase,
): DoorDrawableEntity | undefined {
  if (!components.door.has(entity)) return undefined;

  const locked = components.locked.has(entity);
  return {
    ...position,
    kind: DrawableKind.Door,
    open: components.door.partitions.open[entity]! === 1,
    locked,
    color: locked ? keyColorForCode(components.locked.partitions.color[entity]!) : undefined,
  };
}

function uplinkTerminalDrawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  position: DrawableBase,
): UplinkTerminalDrawableEntity | undefined {
  if (!components.uplinkTerminal.has(entity)) return undefined;
  return {
    ...position,
    kind: DrawableKind.UplinkTerminal,
  };
}

function itemDrawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  position: DrawableBase,
): ItemDrawableEntity | undefined {
  if (!components.item.has(entity)) return undefined;

  const itemKind = itemKindForCode(components.item.partitions.kind[entity]!);
  return {
    ...position,
    kind: DrawableKind.Item,
    icon: itemIconFor(itemKind, components.item.partitions.value[entity]!),
  };
}

function enemyArchetypeForEntity(components: DrawableComponents, entity: Entity): EnemyArchetype | undefined {
  if (!components.enemyArchetype.has(entity)) return undefined;
  return enemyArchetypeForCode(components.enemyArchetype.partitions.archetype[entity]!);
}

function healthForEntity(
  components: DrawableComponents,
  entity: Entity,
): ActorDrawableEntity["health"] | undefined {
  if (!components.health.has(entity)) return undefined;
  return {
    current: components.health.partitions.current[entity]!,
    max: components.health.partitions.max[entity]!,
  };
}
