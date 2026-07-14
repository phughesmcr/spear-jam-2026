import { SpriteId, type SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import { type LightEmitterSchema, type SpriteAnimationSchema } from "@/src/game/simulation/components.ts";
import { DrawableKind } from "@/src/game/simulation/drawable_kind.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import { Direction } from "@/src/game/world/direction.ts";
import {
  DEFAULT_DOOR_OPEN_MS,
  type DoorSlide,
  doorSlideForCode,
  type KeyColor as KeyColorType,
  keyColorForCode,
} from "@/src/game/world/map.ts";
import type { Entity, SlotIndex } from "turn-based-engine/ecs";

type DrawableBase = { readonly entity: Entity; readonly x: number; readonly y: number };
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
  readonly health?: { readonly current: number; readonly max: number };
};
export type DoorDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Door;
  readonly open: boolean;
  readonly locked: boolean;
  readonly secret: boolean;
  readonly glass: boolean;
  readonly color?: KeyColorType;
  readonly slide?: DoorSlide;
  readonly openMs: number;
};
export type SpriteDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Sprite;
  readonly spriteId: SpriteIdType;
  readonly animation?: SpriteAnimationSchema;
};
export type DrawableEntity = ActorDrawableEntity | DoorDrawableEntity | PlayerDrawableEntity | SpriteDrawableEntity;
export type LightEntity = DrawableBase & LightEmitterSchema;
export type DrawableEntityVisitor = (drawable: DrawableEntity) => void;
export type LightEntityVisitor = (light: LightEntity) => void;

type DrawableScratch = {
  entity: Entity;
  x: number;
  y: number;
  kind: DrawableKind;
  dir: number;
  spriteId: SpriteIdType;
  animation: { kind: SpriteAnimationSchema["kind"]; startedAtMs: number; durationMs: number } | undefined;
  health: { current: number; max: number } | undefined;
  open: boolean;
  locked: boolean;
  secret: boolean;
  glass: boolean;
  color: KeyColorType | undefined;
  slide: DoorSlide | undefined;
  openMs: number;
};
type LightScratch = {
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
export type RuntimeReaders = {
  readonly forEachDrawable: (visit: DrawableEntityVisitor) => void;
  readonly forEachLight: (visit: LightEntityVisitor) => void;
};

export function createDrawableReaders(runtime: GameRuntime): RuntimeReaders {
  const drawableQuery = runtime.game.query(runtime.crawler.components.GridPosition, runtime.game.components.Drawable);
  const lightQuery = runtime.game.query(runtime.crawler.components.GridPosition, runtime.game.components.LightEmitter);
  let entities = new Uint32Array(64);
  let slots = new Array<SlotIndex>(64);
  const drawable = createDrawableScratch();
  const animation = { kind: 0 as SpriteAnimationSchema["kind"], startedAtMs: 0, durationMs: 0 };
  const health = { current: 0, max: 0 };
  const light = createLightScratch();
  let drawableCount = 0;
  let drawableRevision = -1;
  let lightVisitor: LightEntityVisitor;

  function ensureCapacity(count: number): void {
    if (entities.length >= count) return;
    let capacity = entities.length;
    while (capacity < count) capacity *= 2;
    entities = new Uint32Array(capacity);
    slots = new Array<SlotIndex>(capacity);
  }

  function collectDrawable(entity: Entity, slot: SlotIndex): void {
    ensureCapacity(drawableCount + 1);
    const layer = runtime.game.storage.Drawable.getAt(slot, "layer");
    let insertion = drawableCount;
    while (
      insertion > 0 &&
      compareOrder(entity, layer, entities[insertion - 1]! as Entity, slots[insertion - 1]!, runtime) < 0
    ) {
      entities[insertion] = entities[insertion - 1]!;
      slots[insertion] = slots[insertion - 1]!;
      insertion--;
    }
    entities[insertion] = entity;
    slots[insertion] = slot;
    drawableCount++;
  }

  function visitLight(entity: Entity, slot: SlotIndex): void {
    light.entity = entity;
    light.x = runtime.crawler.storage.GridPosition.getAt(slot, "x");
    light.y = runtime.crawler.storage.GridPosition.getAt(slot, "y");
    light.red = runtime.game.storage.LightEmitter.getAt(slot, "red");
    light.green = runtime.game.storage.LightEmitter.getAt(slot, "green");
    light.blue = runtime.game.storage.LightEmitter.getAt(slot, "blue");
    light.radius = runtime.game.storage.LightEmitter.getAt(slot, "radius");
    light.flickerAmount = runtime.game.storage.LightEmitter.getAt(slot, "flickerAmount");
    light.flickerSpeed = runtime.game.storage.LightEmitter.getAt(slot, "flickerSpeed");
    lightVisitor(light);
  }

  function refreshDrawableOrder(): void {
    const revision = runtime.game.storage.Drawable.revision;
    if (revision === drawableRevision) return;
    drawableCount = 0;
    drawableQuery.forEach(collectDrawable);
    drawableRevision = revision;
  }

  function forEachDrawable(visit: DrawableEntityVisitor): void {
    refreshDrawableOrder();
    for (let index = 0; index < drawableCount; index++) {
      const entity = entities[index]! as Entity;
      if (writeDrawable(runtime, entity, slots[index]!, drawable, animation, health)) visit(drawable as DrawableEntity);
    }
  }

  function forEachLight(visit: LightEntityVisitor): void {
    lightVisitor = visit;
    lightQuery.forEach(visitLight);
  }

  return { forEachDrawable, forEachLight };
}

function compareOrder(a: Entity, aLayer: number, b: Entity, bSlot: SlotIndex, runtime: GameRuntime): number {
  return aLayer - runtime.game.storage.Drawable.getAt(bSlot, "layer") || a - b;
}

function writeDrawable(
  runtime: GameRuntime,
  entity: Entity,
  slot: SlotIndex,
  drawable: DrawableScratch,
  animation: NonNullable<DrawableScratch["animation"]>,
  health: NonNullable<DrawableScratch["health"]>,
): boolean {
  const kind = runtime.game.storage.Drawable.getAt(slot, "kind") as DrawableKind;
  drawable.entity = entity;
  drawable.x = runtime.crawler.storage.GridPosition.getAt(slot, "x");
  drawable.y = runtime.crawler.storage.GridPosition.getAt(slot, "y");
  drawable.kind = kind;
  drawable.animation = undefined;
  drawable.health = undefined;
  drawable.color = undefined;
  drawable.slide = undefined;
  drawable.openMs = DEFAULT_DOOR_OPEN_MS;
  if (kind === DrawableKind.Player || kind === DrawableKind.Actor) {
    if (!has(runtime, entity, "Sprite") || runtime.crawler.entityFacing(entity) === undefined) return false;
    drawable.dir = runtime.crawler.storage.Facing.getAt(slot, "dir");
    drawable.spriteId = runtime.game.storage.Sprite.getAt(slot, "id") as SpriteIdType;
    if (kind === DrawableKind.Actor) {
      if (has(runtime, entity, "SpriteAnimation")) {
        animation.kind = runtime.game.storage.SpriteAnimation.getAt(slot, "kind") as SpriteAnimationSchema["kind"];
        animation.startedAtMs = runtime.game.storage.SpriteAnimation.getAt(slot, "startedAtMs");
        animation.durationMs = runtime.game.storage.SpriteAnimation.getAt(slot, "durationMs");
        drawable.animation = animation;
      }
      if (has(runtime, entity, "Health")) {
        health.current = runtime.game.storage.Health.getAt(slot, "current");
        health.max = runtime.game.storage.Health.getAt(slot, "max");
        drawable.health = health;
      }
    }
    return true;
  }
  if (kind === DrawableKind.Door) {
    if (!has(runtime, entity, "Door")) return false;
    const locked = has(runtime, entity, "Locked");
    const openMs = runtime.game.storage.Door.getAt(slot, "openMs");
    drawable.open = runtime.game.storage.Door.getAt(slot, "open") === 1;
    drawable.locked = locked;
    drawable.secret = has(runtime, entity, "Secret");
    drawable.glass = has(runtime, entity, "Glass");
    drawable.color = locked ? keyColorForCode(runtime.game.storage.Locked.getAt(slot, "color")) : undefined;
    drawable.slide = doorSlideForCode(runtime.game.storage.Door.getAt(slot, "slide"));
    drawable.openMs = openMs === 0 ? DEFAULT_DOOR_OPEN_MS : openMs;
    return true;
  }
  if (kind === DrawableKind.Sprite && has(runtime, entity, "Sprite")) {
    drawable.spriteId = runtime.game.storage.Sprite.getAt(slot, "id") as SpriteIdType;
    if (has(runtime, entity, "SpriteAnimation")) {
      animation.kind = runtime.game.storage.SpriteAnimation.getAt(slot, "kind") as SpriteAnimationSchema["kind"];
      animation.startedAtMs = runtime.game.storage.SpriteAnimation.getAt(slot, "startedAtMs");
      animation.durationMs = runtime.game.storage.SpriteAnimation.getAt(slot, "durationMs");
      drawable.animation = animation;
    }
    return true;
  }
  return false;
}

function has(runtime: GameRuntime, entity: Entity, name: keyof typeof runtime.game.components): boolean {
  return runtime.game.entityHasComponent(entity, runtime.game.components[name]);
}

function createDrawableScratch(): DrawableScratch {
  return {
    entity: 0 as Entity,
    x: 0,
    y: 0,
    kind: DrawableKind.Sprite,
    dir: Direction.North,
    spriteId: SpriteId.Npc,
    animation: undefined,
    health: undefined,
    open: false,
    locked: false,
    secret: false,
    glass: false,
    color: undefined,
    slide: undefined,
    openMs: DEFAULT_DOOR_OPEN_MS,
  };
}

function createLightScratch(): LightScratch {
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
