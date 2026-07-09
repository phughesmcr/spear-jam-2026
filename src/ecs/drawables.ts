import { type Entity, System } from "@phughesmcr/miski";
import { type SpriteId as SpriteIdType, SpriteId as SpriteIdValues } from "@/src/content/sprite_ids.ts";
import {
  type LightEmitterSchema,
  SPRITE_ATTACK_MS,
  SPRITE_DEATH_MS,
  SPRITE_WALK_MS,
  SpriteAnimationKind,
  type SpriteAnimationSchema,
} from "@/src/ecs/components.ts";
import { DrawableKind } from "@/src/ecs/drawable_kind.ts";
import { drawableRenderQuery, lightRenderQuery } from "@/src/ecs/queries.ts";
import {
  DEFAULT_DOOR_OPEN_MS,
  type DoorSlide,
  doorSlideForCode,
  type KeyColor as KeyColorType,
  keyColorForCode,
} from "@/src/map/map.ts";

export { DrawableKind, SPRITE_ATTACK_MS, SPRITE_DEATH_MS, SPRITE_WALK_MS, SpriteAnimationKind };
export const SpriteId = SpriteIdValues;
export type SpriteId = SpriteIdType;
export type { SpriteAnimationSchema };

type DrawableBase = {
  readonly entity: Entity;
  readonly x: number;
  readonly y: number;
};

export type PlayerDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Player;
  readonly dir: number;
  readonly spriteId: SpriteIdType;
};

export type ActorDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Actor;
  readonly dir: number;
  readonly spriteId: SpriteIdType;
  readonly animation?: SpriteAnimationSchema;
  readonly health?: {
    readonly current: number;
    readonly max: number;
  };
};

export type DoorDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Door;
  readonly open: boolean;
  readonly locked: boolean;
  /** Disguised as a wall until the player reveals it; hides door styling and prompts. */
  readonly secret: boolean;
  readonly color?: KeyColorType;
  /** Slide direction for open/close animation; undefined = renderer default. */
  readonly slide?: DoorSlide;
  /** Milliseconds for a full open/close slide. */
  readonly openMs: number;
};

export type SpriteDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Sprite;
  readonly spriteId: SpriteIdType;
  readonly animation?: SpriteAnimationSchema;
};

export type DrawableEntity =
  | ActorDrawableEntity
  | DoorDrawableEntity
  | PlayerDrawableEntity
  | SpriteDrawableEntity;

export type LightEntity = DrawableBase & LightEmitterSchema;

/** Receives a reused scratch object; copy fields before storing it past the callback. */
export type DrawableEntityVisitor = (drawable: DrawableEntity) => void;

/** Receives a reused scratch object; copy fields before storing it past the callback. */
export type LightEntityVisitor = (light: LightEntity) => void;

type DrawableHealthScratch = {
  current: number;
  max: number;
};

type DrawableAnimationScratch = SpriteAnimationSchema;

type DrawableEntityScratch = {
  entity: Entity;
  x: number;
  y: number;
  kind: DrawableKind;
  dir: number;
  spriteId: SpriteIdType;
  animation: DrawableAnimationScratch | undefined;
  health: DrawableHealthScratch | undefined;
  open: boolean;
  locked: boolean;
  secret: boolean;
  color: KeyColorType | undefined;
  slide: DoorSlide | undefined;
  openMs: number;
};

type DrawableRenderScratch = {
  orderedEntities: Uint32Array;
  readonly drawables: DrawableEntityScratch[];
  readonly health: DrawableHealthScratch[];
  readonly animations: DrawableAnimationScratch[];
};

type LightEntityScratch = {
  entity: Entity;
  x: number;
  y: number;
  red: number;
  green: number;
  blue: number;
  radius: number;
  flickerAmount: number;
  flickerSpeed: number;
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
type LightRenderContext = {
  readonly visit: LightEntityVisitor;
  readonly scratch: LightEntityScratch;
};
export type DrawableSystem = (context: DrawableRenderContext) => void;
export type LightSystem = (context: LightRenderContext) => void;
type DrawableComponents = typeof drawableRenderQuery["$inferComponents"];

const INITIAL_DRAWABLE_CAPACITY = 64;

export function createDrawableRenderScratch(): DrawableRenderScratch {
  const scratch: DrawableRenderScratch = {
    orderedEntities: new Uint32Array(INITIAL_DRAWABLE_CAPACITY),
    drawables: [],
    health: [],
    animations: [],
  };
  ensureDrawableScratchCapacity(scratch, INITIAL_DRAWABLE_CAPACITY);
  return scratch;
}

export function createLightEntityScratch(): LightEntityScratch {
  return {
    entity: 0 as Entity,
    x: 0,
    y: 0,
    red: 255,
    green: 255,
    blue: 255,
    radius: 0,
    flickerAmount: 0,
    flickerSpeed: 0,
  };
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
        scratch.animations[i]!,
      );
      if (drawable !== undefined) context.visit(drawable);
    }
  },
});

export const lightSystem = new System({
  name: "lightSystem",
  query: lightRenderQuery,
  callback: (components, entities, context: LightRenderContext): void => {
    const positionX = components.gridPos.partitions.x;
    const positionY = components.gridPos.partitions.y;
    const light = components.lightEmitter.partitions;
    for (let i = 0; i < entities.count; i++) {
      const entity = entities.indices[i]! as Entity;
      const scratch = context.scratch;
      scratch.entity = entity;
      scratch.x = positionX[entity]!;
      scratch.y = positionY[entity]!;
      scratch.red = light.red[entity]!;
      scratch.green = light.green[entity]!;
      scratch.blue = light.blue[entity]!;
      scratch.radius = light.radius[entity]!;
      scratch.flickerAmount = light.flickerAmount[entity]!;
      scratch.flickerSpeed = light.flickerSpeed[entity]!;
      context.visit(scratch);
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
    scratch.animations[i] = createDrawableAnimationScratch();
  }
}

function createDrawableAnimationScratch(): DrawableAnimationScratch {
  return { kind: 0 as SpriteAnimationSchema["kind"], startedAtMs: 0, durationMs: 0 };
}

function createDrawableEntityScratch(): DrawableEntityScratch {
  return {
    entity: 0 as Entity,
    x: 0,
    y: 0,
    kind: DrawableKind.Sprite,
    dir: 0,
    spriteId: SpriteId.Npc,
    animation: undefined,
    health: undefined,
    open: false,
    locked: false,
    secret: false,
    color: undefined,
    slide: undefined,
    openMs: DEFAULT_DOOR_OPEN_MS,
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

function compareDrawableOrder(a: Entity, b: Entity, layer: NumericPartition): number {
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
  drawable.spriteId = SpriteId.Npc;
  drawable.animation = undefined;
  drawable.health = undefined;
  drawable.open = false;
  drawable.locked = false;
  drawable.secret = false;
  drawable.color = undefined;
  drawable.slide = undefined;
  drawable.openMs = DEFAULT_DOOR_OPEN_MS;
}

function drawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  kind: DrawableKind,
  x: number,
  y: number,
  drawable: DrawableEntityScratch,
  health: DrawableHealthScratch,
  animation: DrawableAnimationScratch,
): DrawableEntity | undefined {
  resetDrawableScratch(drawable, entity, kind, x, y);

  switch (kind) {
    case DrawableKind.Player:
      return playerDrawableEntityFor(components, entity, drawable);
    case DrawableKind.Actor:
      return actorDrawableEntityFor(components, entity, drawable, health, animation);
    case DrawableKind.Door:
      return doorDrawableEntityFor(components, entity, drawable);
    case DrawableKind.Sprite:
      return spriteDrawableEntityFor(components, entity, drawable, animation);
    default:
      return undefined;
  }
}

function playerDrawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  drawable: DrawableEntityScratch,
): PlayerDrawableEntity | undefined {
  if (!components.facing.has(entity) || !components.sprite.has(entity)) return undefined;
  drawable.dir = components.facing.partitions.dir[entity]!;
  drawable.spriteId = components.sprite.partitions.id[entity]! as SpriteIdType;
  return drawable as PlayerDrawableEntity;
}

function actorDrawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  drawable: DrawableEntityScratch,
  health: DrawableHealthScratch,
  animation: DrawableAnimationScratch,
): ActorDrawableEntity | undefined {
  if (!components.facing.has(entity) || !components.sprite.has(entity)) return undefined;

  drawable.dir = components.facing.partitions.dir[entity]!;
  drawable.spriteId = components.sprite.partitions.id[entity]! as SpriteIdType;
  drawable.animation = writeAnimationForEntity(components, entity, animation) ? animation : undefined;
  drawable.health = writeHealthForEntity(components, entity, health) ? health : undefined;
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
  drawable.secret = components.secret.has(entity);
  drawable.color = locked ? keyColorForCode(components.locked.partitions.color[entity]!) : undefined;
  drawable.slide = slide;
  drawable.openMs = openMs === 0 ? DEFAULT_DOOR_OPEN_MS : openMs;
  return drawable as DoorDrawableEntity;
}

function spriteDrawableEntityFor(
  components: DrawableComponents,
  entity: Entity,
  drawable: DrawableEntityScratch,
  animation: DrawableAnimationScratch,
): SpriteDrawableEntity | undefined {
  if (!components.sprite.has(entity)) return undefined;
  drawable.spriteId = components.sprite.partitions.id[entity]! as SpriteIdType;
  drawable.animation = writeAnimationForEntity(components, entity, animation) ? animation : undefined;
  return drawable as SpriteDrawableEntity;
}

function writeAnimationForEntity(
  components: DrawableComponents,
  entity: Entity,
  animation: DrawableAnimationScratch,
): boolean {
  if (!components.spriteAnimation.has(entity)) return false;
  animation.kind = components.spriteAnimation.partitions.kind[entity]! as SpriteAnimationSchema["kind"];
  animation.startedAtMs = components.spriteAnimation.partitions.startedAtMs[entity]!;
  animation.durationMs = components.spriteAnimation.partitions.durationMs[entity]!;
  return true;
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
