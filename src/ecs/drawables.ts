import { type Entity, System } from "@phughesmcr/miski";
import {
  DecorationKind,
  type DecorationKind as DecorationKindType,
  DrawableKind,
  ItemKind,
  type ItemKind as ItemKindType,
  type LightEmitterSchema,
  type SpriteAnimationSchema,
  SpriteId,
  type SpriteId as SpriteIdType,
} from "@/src/ecs/components.ts";
import { EnemyArchetype, type EnemyArchetype as EnemyArchetypeType } from "@/src/ecs/enemy_catalog.ts";
import { drawableRenderQuery, lightRenderQuery } from "@/src/ecs/queries.ts";
import { DisplayName } from "@/src/game/names.ts";
import {
  DEFAULT_DOOR_OPEN_MS,
  type DoorSlide,
  doorSlideForCode,
  KeyColor,
  type KeyColor as KeyColorType,
  keyColorForCode,
} from "@/src/map/map.ts";

export { DrawableKind, SpriteId };

type TopDownShape = "actor" | "badge" | "corpse" | "key" | "player" | "terminal" | "uplinkCode" | "weapon";
type SpriteSourceFrame = readonly [number, number, number, number];
type SpriteAsset = {
  readonly src: string;
  readonly frame?: SpriteSourceFrame;
  readonly lightmapSrc?: string;
  readonly cropFrame?: SpriteSourceFrame;
};

export type SpriteAppearance = {
  readonly firstPersonSlot?: number;
  readonly firstPersonScale: number;
  readonly firstPersonElevation: number;
  readonly fallbackColor?: string;
  readonly asset?: SpriteAsset;
  readonly enemySheet: boolean;
  readonly itemBob: boolean;
  readonly topDownShape: TopDownShape;
  readonly topDownColor: string;
  readonly topDownSymbol?: string;
};

const SCALE_ACTOR = 0.75;
const SCALE_CORPSE = 0.6;
const SCALE_ITEM = 0.4;
const SCALE_TERMINAL = 0.9;
const SCALE_DECOR_LARGE = 0.85;
const SCALE_DECOR_TALL = 0.95;
const SCALE_DECOR_CEILING_LIGHT = 0.45;
const SCALE_DECOR_CEILING_LONG = 0.75;
const ELEVATION_CEILING_LIGHT = 1 - SCALE_DECOR_CEILING_LIGHT;
const ELEVATION_CEILING_LONG = 1 - SCALE_DECOR_CEILING_LONG;
const ENEMY_CROP: SpriteSourceFrame = [0, 0, 1 / 4, 1 / 4];

// Sprite asset URLs must be static `new URL` literals so Vite can resolve them.
const JOHN = new URL("../../assets/game/sprites/john.png", import.meta.url).href;
const DIGITAL_DOG = new URL("../../assets/game/sprites/digital_dog.png", import.meta.url).href;
const DIGITAL_DOG_LIGHT = new URL("../../assets/game/sprites/digital_dog_lightmap.png", import.meta.url).href;
const GUNSLINGER = new URL("../../assets/game/sprites/gigabit_gun_slinger.png", import.meta.url).href;
const GUNSLINGER_LIGHT = new URL("../../assets/game/sprites/gigabit_gun_slinger_lightmap.png", import.meta.url).href;
const NEOPHYTE = new URL("../../assets/game/sprites/network_neophyte.png", import.meta.url).href;
const NEOPHYTE_LIGHT = new URL("../../assets/game/sprites/network_neophyte_lightmap.png", import.meta.url).href;
const SENTINEL = new URL("../../assets/game/sprites/system_sentinel.png", import.meta.url).href;
const SENTINEL_LIGHT = new URL("../../assets/game/sprites/system_sentinel_lightmap.png", import.meta.url).href;
const ACOLYTE = new URL("../../assets/game/sprites/agentic_acolyte.png", import.meta.url).href;
const ACOLYTE_LIGHT = new URL("../../assets/game/sprites/agentic_acolyte_lightmap.png", import.meta.url).href;
const TERMINAL = new URL("../../assets/game/sprites/uplink_terminal.png", import.meta.url).href;
const HEALTH = new URL("../../assets/game/sprites/health.png", import.meta.url).href;
const RED_KEY = new URL("../../assets/game/sprites/red_key.png", import.meta.url).href;
const BLUE_KEY = new URL("../../assets/game/sprites/blue_key.png", import.meta.url).href;
const YELLOW_KEY = new URL("../../assets/game/sprites/yellow_key.png", import.meta.url).href;
const WEAPON_2 = new URL("../../assets/game/sprites/weapon_2.png", import.meta.url).href;
const WEAPON_3 = new URL("../../assets/game/sprites/weapon_3.png", import.meta.url).href;
const UPLINK_CODE = new URL("../../assets/game/sprites/uplink_code.png", import.meta.url).href;
const CORPSE = new URL("../../assets/game/sprites/corpse.png", import.meta.url).href;
const PISTOL_AMMO = new URL("../../assets/game/sprites/pistol_ammo.png", import.meta.url).href;
const CANNON_AMMO = new URL("../../assets/game/sprites/cannon_ammo.png", import.meta.url).href;
const DECOR_SERVER_PILE = new URL("../../assets/game/sprites/decor_server_pile.png", import.meta.url).href;
const DECOR_CYBORG = new URL("../../assets/game/sprites/decor_cyborg.png", import.meta.url).href;
const DECOR_CEILING_HOOK = new URL("../../assets/game/sprites/decor_ceiling_hook.png", import.meta.url).href;
const DECOR_CEILING_LIGHT = new URL("../../assets/game/sprites/decor_ceiling_light.png", import.meta.url).href;
const DECOR_CEILING_WIRES = new URL("../../assets/game/sprites/decor_ceiling_wires.png", import.meta.url).href;

const SPRITE_APPEARANCES: Readonly<Record<SpriteIdType, SpriteAppearance>> = {
  [SpriteId.Player]: appearance(undefined, SCALE_ACTOR, "player", "#f0c84b"),
  [SpriteId.Npc]: appearance(87, SCALE_ACTOR, "actor", "#59d39b"),
  [SpriteId.John]: appearance(88, SCALE_ACTOR, "actor", "#59d39b", {
    asset: spriteAsset(JOHN),
  }),
  [SpriteId.DigitalDog]: enemyAppearance(0, "#ef4444", "D", DIGITAL_DOG, DIGITAL_DOG_LIGHT),
  [SpriteId.GigabitGunslinger]: enemyAppearance(16, "#38bdf8", "G", GUNSLINGER, GUNSLINGER_LIGHT),
  [SpriteId.NetworkNeophyte]: enemyAppearance(32, "#34d399", "N", NEOPHYTE, NEOPHYTE_LIGHT),
  [SpriteId.SystemSentinel]: enemyAppearance(48, "#f59e0b", "S", SENTINEL, SENTINEL_LIGHT),
  [SpriteId.AgenticAcolyte]: enemyAppearance(64, "#a78bfa", "A", ACOLYTE, ACOLYTE_LIGHT),
  [SpriteId.UplinkTerminal]: appearance(80, SCALE_TERMINAL, "terminal", "#22c55e", {
    asset: spriteAsset(TERMINAL, [0.5, 0, 0.5, 1]),
  }),
  [SpriteId.HealthPatch]: itemAppearance(81, "badge", "#ef4444", HEALTH, "+", "#59d39b"),
  [SpriteId.RedKey]: itemAppearance(82, "key", "#df4f45", RED_KEY),
  [SpriteId.BlueKey]: itemAppearance(83, "key", "#4f8df7", BLUE_KEY),
  [SpriteId.YellowKey]: itemAppearance(84, "key", "#f4d35e", YELLOW_KEY),
  [SpriteId.Weapon2]: itemAppearance(85, "weapon", "#c084fc", WEAPON_2, "2"),
  [SpriteId.Weapon3]: itemAppearance(86, "weapon", "#c084fc", WEAPON_3, "3"),
  [SpriteId.UplinkCode]: itemAppearance(89, "uplinkCode", "#7dd3fc", UPLINK_CODE),
  [SpriteId.Corpse]: appearance(90, SCALE_CORPSE, "corpse", "#4b5563", {
    asset: spriteAsset(CORPSE),
  }),
  [SpriteId.PistolAmmo]: itemAppearance(91, "badge", "#38bdf8", PISTOL_AMMO, "P"),
  [SpriteId.CannonAmmo]: itemAppearance(92, "badge", "#f97316", CANNON_AMMO, "C"),
  [SpriteId.DecorServerPile]: decorationAppearance(93, SCALE_DECOR_LARGE, 0, "#64748b", "S", DECOR_SERVER_PILE),
  [SpriteId.DecorCyborg]: decorationAppearance(94, SCALE_DECOR_TALL, 0, "#94a3b8", "C", DECOR_CYBORG),
  [SpriteId.DecorCeilingHook]: decorationAppearance(
    95,
    SCALE_DECOR_CEILING_LONG,
    ELEVATION_CEILING_LONG,
    "#9f7a5d",
    "H",
    DECOR_CEILING_HOOK,
  ),
  [SpriteId.DecorCeilingLight]: decorationAppearance(
    96,
    SCALE_DECOR_CEILING_LIGHT,
    ELEVATION_CEILING_LIGHT,
    "#facc15",
    "L",
    DECOR_CEILING_LIGHT,
  ),
  [SpriteId.DecorCeilingWires]: decorationAppearance(
    97,
    SCALE_DECOR_CEILING_LONG,
    ELEVATION_CEILING_LONG,
    "#64748b",
    "W",
    DECOR_CEILING_WIRES,
  ),
};

const SPRITE_APPEARANCE_LIST = Object.values(SPRITE_APPEARANCES);

const ENEMY_SPRITE_IDS: Readonly<Record<EnemyArchetypeType, SpriteIdType>> = {
  [EnemyArchetype.MeleeDog]: SpriteId.DigitalDog,
  [EnemyArchetype.Gunslinger]: SpriteId.GigabitGunslinger,
  [EnemyArchetype.NetworkNeophyte]: SpriteId.NetworkNeophyte,
  [EnemyArchetype.SystemSentinel]: SpriteId.SystemSentinel,
  [EnemyArchetype.AgenticAcolyte]: SpriteId.AgenticAcolyte,
};

const ITEM_SPRITE_IDS: Readonly<
  Record<Exclude<ItemKindType, typeof ItemKind.Key | typeof ItemKind.Weapon>, SpriteIdType>
> = {
  [ItemKind.HealthPatch]: SpriteId.HealthPatch,
  [ItemKind.PistolAmmo]: SpriteId.PistolAmmo,
  [ItemKind.CannonAmmo]: SpriteId.CannonAmmo,
  [ItemKind.UplinkCode]: SpriteId.UplinkCode,
};

const KEY_SPRITE_IDS: Readonly<Record<KeyColorType, SpriteIdType>> = {
  [KeyColor.Red]: SpriteId.RedKey,
  [KeyColor.Blue]: SpriteId.BlueKey,
  [KeyColor.Yellow]: SpriteId.YellowKey,
};

const DECORATION_SPRITE_IDS: Readonly<Record<DecorationKindType, SpriteIdType>> = {
  [DecorationKind.ServerPile]: SpriteId.DecorServerPile,
  [DecorationKind.Cyborg]: SpriteId.DecorCyborg,
  [DecorationKind.CeilingHook]: SpriteId.DecorCeilingHook,
  [DecorationKind.CeilingLight]: SpriteId.DecorCeilingLight,
  [DecorationKind.CeilingWires]: SpriteId.DecorCeilingWires,
};

export function spriteAppearance(id: SpriteIdType): SpriteAppearance {
  return SPRITE_APPEARANCES[id];
}

export function spriteAppearances(): readonly SpriteAppearance[] {
  return SPRITE_APPEARANCE_LIST;
}

export function spriteIdForDisplayName(displayName: DisplayName): SpriteIdType {
  return displayName === DisplayName.John ? SpriteId.John : SpriteId.Npc;
}

export function spriteIdForEnemyArchetype(archetype: EnemyArchetypeType): SpriteIdType {
  return ENEMY_SPRITE_IDS[archetype];
}

export function spriteIdForItem(item: ItemKindType, value: number): SpriteIdType {
  switch (item) {
    case ItemKind.Key:
      return KEY_SPRITE_IDS[keyColorForCode(value)];
    case ItemKind.Weapon:
      return value === 2 ? SpriteId.Weapon2 : SpriteId.Weapon3;
    default:
      return ITEM_SPRITE_IDS[item];
  }
}

export function spriteIdForDecoration(decoration: DecorationKindType): SpriteIdType {
  return DECORATION_SPRITE_IDS[decoration];
}

function spriteAsset(
  src: string,
  frame?: SpriteSourceFrame,
  lightmapSrc?: string,
  cropFrame?: SpriteSourceFrame,
): SpriteAsset {
  return {
    src,
    ...(frame === undefined ? {} : { frame }),
    ...(lightmapSrc === undefined ? {} : { lightmapSrc }),
    ...(cropFrame === undefined ? {} : { cropFrame }),
  };
}

function appearance(
  firstPersonSlot: number | undefined,
  firstPersonScale: number,
  topDownShape: TopDownShape,
  topDownColor: string,
  options: Partial<SpriteAppearance> = {},
): SpriteAppearance {
  return {
    firstPersonSlot,
    firstPersonScale,
    firstPersonElevation: options.firstPersonElevation ?? 0,
    ...(firstPersonSlot === undefined ? {} : { fallbackColor: options.fallbackColor ?? topDownColor }),
    ...(options.asset === undefined ? {} : { asset: options.asset }),
    enemySheet: options.enemySheet ?? false,
    itemBob: options.itemBob ?? false,
    topDownShape,
    topDownColor,
    ...(options.topDownSymbol === undefined ? {} : { topDownSymbol: options.topDownSymbol }),
  };
}

function enemyAppearance(
  firstPersonSlot: number,
  topDownColor: string,
  topDownSymbol: string,
  src: string,
  lightmapSrc: string,
): SpriteAppearance {
  return appearance(firstPersonSlot, SCALE_ACTOR, "actor", topDownColor, {
    enemySheet: true,
    asset: spriteAsset(src, undefined, lightmapSrc, ENEMY_CROP),
    topDownSymbol,
  });
}

function itemAppearance(
  firstPersonSlot: number,
  topDownShape: TopDownShape,
  topDownColor: string,
  src: string,
  topDownSymbol?: string,
  fallbackColor = topDownColor,
): SpriteAppearance {
  return appearance(firstPersonSlot, SCALE_ITEM, topDownShape, topDownColor, {
    asset: spriteAsset(src),
    fallbackColor,
    itemBob: true,
    ...(topDownSymbol === undefined ? {} : { topDownSymbol }),
  });
}

function decorationAppearance(
  firstPersonSlot: number,
  firstPersonScale: number,
  firstPersonElevation: number,
  topDownColor: string,
  topDownSymbol: string,
  src: string,
): SpriteAppearance {
  return appearance(firstPersonSlot, firstPersonScale, "badge", topDownColor, {
    asset: spriteAsset(src),
    firstPersonElevation,
    topDownSymbol,
  });
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
export type DrawableEntityVisitor = (drawable: DrawableEntity) => void;
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
