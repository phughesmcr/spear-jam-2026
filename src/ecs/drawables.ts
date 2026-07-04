import { type Entity, System } from "@phughesmcr/miski";
import { DrawableKind, SpriteId } from "@/src/ecs/components.ts";
import type { LightEmitterSchema, SpriteId as SpriteIdType } from "@/src/ecs/components.ts";
import { drawableRenderQuery, lightRenderQuery } from "@/src/ecs/queries.ts";
import { DEFAULT_DOOR_OPEN_MS, doorSlideForCode, keyColorForCode } from "@/src/map/map.ts";
import type { DoorSlide, KeyColor as KeyColorType } from "@/src/map/map.ts";

export { DrawableKind, SpriteId };

type TopDownShape =
  | "actor"
  | "badge"
  | "corpse"
  | "key"
  | "player"
  | "terminal"
  | "uplinkCode"
  | "weapon";

export type SpriteAppearance = {
  readonly firstPersonSlot?: number;
  readonly firstPersonScale: number;
  readonly enemySheet: boolean;
  readonly itemBob: boolean;
  readonly topDownShape: TopDownShape;
  readonly topDownColor: string;
  readonly topDownSymbol?: string;
};

const FIRST_PERSON_SCALE_ACTOR = 0.75;
const FIRST_PERSON_SCALE_CORPSE = 0.6;
const FIRST_PERSON_SCALE_ITEM = 0.4;
const FIRST_PERSON_SCALE_TERMINAL = 0.9;

const SPRITE_APPEARANCES: Readonly<Record<SpriteIdType, SpriteAppearance>> = {
  [SpriteId.Player]: appearance(undefined, FIRST_PERSON_SCALE_ACTOR, "player", "#f0c84b"),
  [SpriteId.Npc]: appearance(87, FIRST_PERSON_SCALE_ACTOR, "actor", "#59d39b"),
  [SpriteId.John]: appearance(88, FIRST_PERSON_SCALE_ACTOR, "actor", "#59d39b"),
  [SpriteId.DigitalDog]: enemyAppearance(0, "#ef4444", "D"),
  [SpriteId.GigabitGunslinger]: enemyAppearance(16, "#38bdf8", "G"),
  [SpriteId.NetworkNeophyte]: enemyAppearance(32, "#34d399", "N"),
  [SpriteId.SystemSentinel]: enemyAppearance(48, "#f59e0b", "S"),
  [SpriteId.AgenticAcolyte]: enemyAppearance(64, "#a78bfa", "A"),
  [SpriteId.UplinkTerminal]: appearance(80, FIRST_PERSON_SCALE_TERMINAL, "terminal", "#22c55e"),
  [SpriteId.HealthPatch]: itemAppearance(81, "badge", "#ef4444", "+"),
  [SpriteId.RedKey]: itemAppearance(82, "key", "#df4f45"),
  [SpriteId.BlueKey]: itemAppearance(83, "key", "#4f8df7"),
  [SpriteId.YellowKey]: itemAppearance(84, "key", "#f4d35e"),
  [SpriteId.Weapon2]: itemAppearance(85, "weapon", "#c084fc", "2"),
  [SpriteId.Weapon3]: itemAppearance(86, "weapon", "#c084fc", "3"),
  [SpriteId.UplinkCode]: itemAppearance(89, "uplinkCode", "#7dd3fc"),
  [SpriteId.Corpse]: appearance(90, FIRST_PERSON_SCALE_CORPSE, "corpse", "#4b5563"),
  [SpriteId.PistolAmmo]: itemAppearance(91, "badge", "#38bdf8", "P"),
  [SpriteId.CannonAmmo]: itemAppearance(92, "badge", "#f97316", "C"),
};

export function spriteAppearance(id: SpriteIdType): SpriteAppearance {
  return SPRITE_APPEARANCES[id];
}

function appearance(
  firstPersonSlot: number | undefined,
  firstPersonScale: number,
  topDownShape: TopDownShape,
  topDownColor: string,
  topDownSymbol?: string,
): SpriteAppearance {
  return {
    firstPersonSlot,
    firstPersonScale,
    enemySheet: false,
    itemBob: false,
    topDownShape,
    topDownColor,
    ...(topDownSymbol === undefined ? {} : { topDownSymbol }),
  };
}

function enemyAppearance(firstPersonSlot: number, topDownColor: string, topDownSymbol: string): SpriteAppearance {
  return {
    ...appearance(firstPersonSlot, FIRST_PERSON_SCALE_ACTOR, "actor", topDownColor, topDownSymbol),
    enemySheet: true,
  };
}

function itemAppearance(
  firstPersonSlot: number,
  topDownShape: TopDownShape,
  topDownColor: string,
  topDownSymbol?: string,
): SpriteAppearance {
  return {
    ...appearance(firstPersonSlot, FIRST_PERSON_SCALE_ITEM, topDownShape, topDownColor, topDownSymbol),
    itemBob: true,
  };
}

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
};

export type DrawableEntity =
  | ActorDrawableEntity
  | DoorDrawableEntity
  | PlayerDrawableEntity
  | SpriteDrawableEntity;

export type LightEntity = DrawableBase & LightEmitterSchema;
export type DrawableEntityVisitor = (drawable: DrawableEntity) => void;
export type LightEntityVisitor = (light: LightEntity) => void;

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
  spriteId: SpriteIdType;
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
  }
}

function createDrawableEntityScratch(): DrawableEntityScratch {
  return {
    entity: 0 as Entity,
    x: 0,
    y: 0,
    kind: DrawableKind.Sprite,
    dir: 0,
    spriteId: SpriteId.Npc,
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
): DrawableEntity | undefined {
  resetDrawableScratch(drawable, entity, kind, x, y);

  switch (kind) {
    case DrawableKind.Player:
      return playerDrawableEntityFor(components, entity, drawable);
    case DrawableKind.Actor:
      return actorDrawableEntityFor(components, entity, drawable, health);
    case DrawableKind.Door:
      return doorDrawableEntityFor(components, entity, drawable);
    case DrawableKind.Sprite:
      return spriteDrawableEntityFor(components, entity, drawable);
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
): ActorDrawableEntity | undefined {
  if (!components.facing.has(entity) || !components.sprite.has(entity)) return undefined;

  drawable.dir = components.facing.partitions.dir[entity]!;
  drawable.spriteId = components.sprite.partitions.id[entity]! as SpriteIdType;
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
): SpriteDrawableEntity | undefined {
  if (!components.sprite.has(entity)) return undefined;
  drawable.spriteId = components.sprite.partitions.id[entity]! as SpriteIdType;
  return drawable as SpriteDrawableEntity;
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
