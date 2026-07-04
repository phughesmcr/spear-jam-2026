import { type Entity, System } from "@phughesmcr/miski";
import { DrawableKind } from "@/src/ecs/components.ts";
import { EnemyArchetype, enemyArchetypeForCode } from "@/src/ecs/enemy_catalog.ts";
import { drawableRenderQuery } from "@/src/ecs/queries.ts";
import { itemIconFor, itemKindForCode } from "@/src/game/items.ts";
import type { ItemIcon } from "@/src/game/items.ts";
import { DEFAULT_DOOR_OPEN_MS, doorSlideForCode, keyColorForCode } from "@/src/map/map.ts";
import type { DoorSlide, KeyColor } from "@/src/map/map.ts";

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
  readonly displayName?: number;
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
  /** Slide direction for open/close animation; undefined = renderer default. */
  readonly slide?: DoorSlide;
  /** Milliseconds for a full open/close slide. */
  readonly openMs: number;
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

type DrawableHealthScratch = {
  current: number;
  max: number;
};

type DrawableEntityScratch = {
  entity: Entity;
  x: number;
  y: number;
  kind: DrawableKind;
  dir: number;
  displayName: number | undefined;
  enemyArchetype: EnemyArchetype | undefined;
  health: DrawableHealthScratch | undefined;
  open: boolean;
  locked: boolean;
  color: KeyColor | undefined;
  slide: DoorSlide | undefined;
  openMs: number;
  icon: ItemIcon | undefined;
};

type DrawableRenderScratch = {
  orderedEntities: Uint32Array;
  readonly drawables: DrawableEntityScratch[];
  readonly health: DrawableHealthScratch[];
};

type EntityIndexLookup = {
  readonly [index: number]: Entity | undefined;
};

type NumericPartition = {
  readonly [index: number]: number | undefined;
};

type DrawableRenderContext = {
  readonly visit: DrawableEntityVisitor;
  readonly scratch: DrawableRenderScratch;
};
export type DrawableSystem = (context: DrawableRenderContext) => void;
type DrawableComponents = typeof drawableRenderQuery["$inferComponents"];

const INITIAL_DRAWABLE_CAPACITY = 64;

export function createDrawableRenderScratch(): DrawableRenderScratch {
  const scratch: DrawableRenderScratch = {
    orderedEntities: new Uint32Array(INITIAL_DRAWABLE_CAPACITY),
    drawables: [],
    health: [],
  };
  ensureDrawableScratchCapacity(scratch, INITIAL_DRAWABLE_CAPACITY);
  return scratch;
}

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
    const scratch = context.scratch;
    ensureDrawableScratchCapacity(scratch, count);

    writeOrderedEntities(scratch.orderedEntities, indices, count, layer);

    for (let i = 0; i < count; i++) {
      const entity = scratch.orderedEntities[i]! as Entity;
      const drawable = drawableEntityFor(
        components,
        entity,
        kind[entity]! as DrawableKind,
        positionX[entity]!,
        positionY[entity]!,
        scratch.drawables[i]!,
        scratch.health[i]!,
      );
      if (drawable !== undefined) context.visit(drawable);
    }
  },
});

function ensureDrawableScratchCapacity(scratch: DrawableRenderScratch, count: number): void {
  if (scratch.orderedEntities.length < count) {
    let capacity = scratch.orderedEntities.length;
    while (capacity < count) capacity *= 2;

    const orderedEntities = new Uint32Array(capacity);
    orderedEntities.set(scratch.orderedEntities);
    scratch.orderedEntities = orderedEntities;
  }

  for (let i = scratch.drawables.length; i < count; i++) {
    scratch.drawables[i] = createDrawableEntityScratch();
    scratch.health[i] = { current: 0, max: 0 };
  }
}

function createDrawableEntityScratch(): DrawableEntityScratch {
  return {
    entity: 0 as Entity,
    x: 0,
    y: 0,
    kind: DrawableKind.Item,
    dir: 0,
    displayName: undefined,
    enemyArchetype: undefined,
    health: undefined,
    open: false,
    locked: false,
    color: undefined,
    slide: undefined,
    openMs: DEFAULT_DOOR_OPEN_MS,
    icon: undefined,
  };
}

function writeOrderedEntities(
  ordered: Uint32Array,
  indices: EntityIndexLookup,
  count: number,
  layer: NumericPartition,
): void {
  // Sort back-to-front by layer; ties break on entity id for stable output.
  for (let i = 0; i < count; i++) {
    const entity = indices[i]!;
    let insertionIndex = i;
    while (insertionIndex > 0 && compareDrawableOrder(entity, ordered[insertionIndex - 1]! as Entity, layer) < 0) {
      ordered[insertionIndex] = ordered[insertionIndex - 1]!;
      insertionIndex--;
    }
    ordered[insertionIndex] = entity;
  }
}

function compareDrawableOrder(
  a: Entity,
  b: Entity,
  layer: NumericPartition,
): number {
  return layer[a]! - layer[b]! || a - b;
}

function resetDrawableScratch(
  drawable: DrawableEntityScratch,
  entity: Entity,
  kind: DrawableKind,
  x: number,
  y: number,
): void {
  drawable.entity = entity;
  drawable.kind = kind;
  drawable.x = x;
  drawable.y = y;
  drawable.dir = 0;
  drawable.displayName = undefined;
  drawable.enemyArchetype = undefined;
  drawable.health = undefined;
  drawable.open = false;
  drawable.locked = false;
  drawable.color = undefined;
  drawable.slide = undefined;
  drawable.openMs = DEFAULT_DOOR_OPEN_MS;
  drawable.icon = undefined;
}

function drawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  kind: DrawableKind,
  x: number,
  y: number,
  drawable: DrawableEntityScratch,
  health: DrawableHealthScratch,
): DrawableEntity | undefined {
  resetDrawableScratch(drawable, entity, kind, x, y);

  switch (kind) {
    case DrawableKind.Player:
    case DrawableKind.Npc:
    case DrawableKind.Enemy:
      return actorDrawableEntityFor(components, entity, kind, drawable, health);
    case DrawableKind.Door:
      return doorDrawableEntityFor(components, entity, drawable);
    case DrawableKind.UplinkTerminal:
      return uplinkTerminalDrawableEntityFor(components, entity, drawable);
    case DrawableKind.Item:
      return itemDrawableEntityFor(components, entity, drawable);
    default:
      return undefined;
  }
}

function actorDrawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  kind: ActorDrawableKind,
  drawable: DrawableEntityScratch,
  health: DrawableHealthScratch,
): ActorDrawableEntity | undefined {
  if (!components.facing.has(entity)) return undefined;

  drawable.dir = components.facing.partitions.dir[entity]!;
  drawable.displayName = components.displayName.has(entity) ?
    components.displayName.partitions.displayName[entity]! :
    undefined;
  drawable.enemyArchetype = kind === DrawableKind.Enemy ? enemyArchetypeForEntity(components, entity) : undefined;
  drawable.health = kind === DrawableKind.Enemy && writeHealthForEntity(components, entity, health) ?
    health :
    undefined;
  return drawable as ActorDrawableEntity;
}

function doorDrawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  drawable: DrawableEntityScratch,
): DoorDrawableEntity | undefined {
  if (!components.door.has(entity)) return undefined;

  const locked = components.locked.has(entity);
  const slide = doorSlideForCode(components.door.partitions.slide[entity]!);
  const openMs = components.door.partitions.openMs[entity]!;
  drawable.open = components.door.partitions.open[entity]! === 1;
  drawable.locked = locked;
  drawable.color = locked ? keyColorForCode(components.locked.partitions.color[entity]!) : undefined;
  drawable.slide = slide;
  drawable.openMs = openMs === 0 ? DEFAULT_DOOR_OPEN_MS : openMs;
  return drawable as DoorDrawableEntity;
}

function uplinkTerminalDrawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  drawable: DrawableEntityScratch,
): UplinkTerminalDrawableEntity | undefined {
  if (!components.uplinkTerminal.has(entity)) return undefined;
  return drawable as UplinkTerminalDrawableEntity;
}

function itemDrawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  drawable: DrawableEntityScratch,
): ItemDrawableEntity | undefined {
  if (!components.item.has(entity)) return undefined;

  const itemKind = itemKindForCode(components.item.partitions.kind[entity]!);
  drawable.icon = itemIconFor(itemKind, components.item.partitions.value[entity]!);
  return drawable as ItemDrawableEntity;
}

function enemyArchetypeForEntity(components: DrawableComponents, entity: Entity): EnemyArchetype | undefined {
  if (!components.enemyArchetype.has(entity)) return undefined;
  return enemyArchetypeForCode(components.enemyArchetype.partitions.archetype[entity]!);
}

function writeHealthForEntity(
  components: DrawableComponents,
  entity: Entity,
  health: DrawableHealthScratch,
): boolean {
  if (!components.health.has(entity)) return false;
  health.current = components.health.partitions.current[entity]!;
  health.max = components.health.partitions.max[entity]!;
  return true;
}
