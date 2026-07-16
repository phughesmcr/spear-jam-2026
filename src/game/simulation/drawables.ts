import { SpriteId, type SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import {
  type DrawableEntity,
  type DrawableEntityVisitor,
  DrawableKind,
  type LightEntityVisitor,
  type SpriteAnimationSnapshot,
} from "@/src/game/model/render_snapshot.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import type { SessionProjection } from "@/src/game/presentation/session_projection.ts";
import { DrawableLayer } from "@/src/game/simulation/components.ts";
import { Direction } from "turn-based-engine/crawler";
import type { DoorSlide, KeyColor as KeyColorType } from "@/src/game/content/map_entities.ts";
import { DEFAULT_DOOR_OPEN_MS, doorSlideForCode, keyColorForCode } from "@/src/game/world/map.ts";
import type { Entity, SlotIndex } from "turn-based-engine/ecs";

type DrawableScratch = {
  entity: Entity;
  x: number;
  y: number;
  kind: DrawableKind;
  dir: number;
  spriteId: SpriteIdType;
  animation: SpriteAnimationSnapshot | undefined;
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

export function createDrawableReaders(runtime: GameRuntime, projection: SessionProjection): RuntimeReaders {
  const drawableQuery = runtime.simulation.ecs.query(
    runtime.simulation.crawler.components.GridPosition,
    runtime.simulation.ecs.components.Drawable,
  );
  const lightQuery = runtime.simulation.ecs.query(
    runtime.simulation.crawler.components.GridPosition,
    runtime.simulation.ecs.components.LightEmitter,
  );
  let entities = new Uint32Array(64);
  let slots = new Array<SlotIndex>(64);
  const drawable = createDrawableScratch();
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
    const layer = runtime.simulation.ecs.storage.Drawable.getAt(slot, "layer");
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
    light.x = runtime.simulation.crawler.storage.GridPosition.getAt(slot, "x");
    light.y = runtime.simulation.crawler.storage.GridPosition.getAt(slot, "y");
    light.red = runtime.simulation.ecs.storage.LightEmitter.getAt(slot, "red");
    light.green = runtime.simulation.ecs.storage.LightEmitter.getAt(slot, "green");
    light.blue = runtime.simulation.ecs.storage.LightEmitter.getAt(slot, "blue");
    light.radius = runtime.simulation.ecs.storage.LightEmitter.getAt(slot, "radius");
    light.flickerAmount = runtime.simulation.ecs.storage.LightEmitter.getAt(slot, "flickerAmount");
    light.flickerSpeed = runtime.simulation.ecs.storage.LightEmitter.getAt(slot, "flickerSpeed");
    lightVisitor(light);
  }

  function refreshDrawableOrder(): void {
    const revision = runtime.simulation.ecs.storage.Drawable.revision;
    if (revision === drawableRevision) return;
    drawableCount = 0;
    drawableQuery.forEach(collectDrawable);
    drawableRevision = revision;
  }

  function forEachDrawable(visit: DrawableEntityVisitor): void {
    refreshDrawableOrder();
    const overlays = projection.overlays();
    let overlayIndex = 0;
    for (let index = 0; index < drawableCount; index++) {
      const entity = entities[index]! as Entity;
      const slot = slots[index]!;
      const layer = runtime.simulation.ecs.storage.Drawable.getAt(slot, "layer");
      while (
        overlayIndex < overlays.length &&
        (DrawableLayer.Item < layer ||
          (DrawableLayer.Item === layer && overlays[overlayIndex]!.entity < entity))
      ) {
        visit(overlays[overlayIndex++]!);
      }
      if (writeDrawable(runtime, projection, entity, slot, drawable, health)) visit(drawable as DrawableEntity);
    }
    while (overlayIndex < overlays.length) visit(overlays[overlayIndex++]!);
  }

  function forEachLight(visit: LightEntityVisitor): void {
    lightVisitor = visit;
    lightQuery.forEach(visitLight);
  }

  return { forEachDrawable, forEachLight };
}

function compareOrder(a: Entity, aLayer: number, b: Entity, bSlot: SlotIndex, runtime: GameRuntime): number {
  return aLayer - runtime.simulation.ecs.storage.Drawable.getAt(bSlot, "layer") || a - b;
}

function writeDrawable(
  runtime: GameRuntime,
  projection: SessionProjection,
  entity: Entity,
  slot: SlotIndex,
  drawable: DrawableScratch,
  health: NonNullable<DrawableScratch["health"]>,
): boolean {
  const kind = runtime.simulation.ecs.storage.Drawable.getAt(slot, "kind") as DrawableKind;
  drawable.entity = entity;
  drawable.x = runtime.simulation.crawler.storage.GridPosition.getAt(slot, "x");
  drawable.y = runtime.simulation.crawler.storage.GridPosition.getAt(slot, "y");
  drawable.kind = kind;
  drawable.animation = undefined;
  drawable.health = undefined;
  drawable.color = undefined;
  drawable.slide = undefined;
  drawable.openMs = DEFAULT_DOOR_OPEN_MS;
  if (kind === DrawableKind.Player || kind === DrawableKind.Actor) {
    if (!has(runtime, entity, "Sprite") || runtime.simulation.crawler.entityFacing(entity) === undefined) return false;
    drawable.dir = runtime.simulation.crawler.storage.Facing.getAt(slot, "dir");
    drawable.spriteId = runtime.simulation.ecs.storage.Sprite.getAt(slot, "id") as SpriteIdType;
    if (kind === DrawableKind.Actor) {
      drawable.animation = projection.animationFor(entity);
      if (has(runtime, entity, "Health")) {
        health.current = runtime.simulation.ecs.storage.Health.getAt(slot, "current");
        health.max = runtime.simulation.ecs.storage.Health.getAt(slot, "max");
        drawable.health = health;
      }
    }
    return true;
  }
  if (kind === DrawableKind.Door) {
    if (!has(runtime, entity, "Door")) return false;
    const locked = has(runtime, entity, "Locked");
    const openMs = runtime.simulation.ecs.storage.Door.getAt(slot, "openMs");
    drawable.open = runtime.simulation.ecs.storage.Door.getAt(slot, "open") === 1;
    drawable.locked = locked;
    drawable.secret = has(runtime, entity, "Secret");
    drawable.glass = has(runtime, entity, "Glass");
    drawable.color = locked ? keyColorForCode(runtime.simulation.ecs.storage.Locked.getAt(slot, "color")) : undefined;
    drawable.slide = doorSlideForCode(runtime.simulation.ecs.storage.Door.getAt(slot, "slide"));
    drawable.openMs = openMs === 0 ? DEFAULT_DOOR_OPEN_MS : openMs;
    return true;
  }
  if (kind === DrawableKind.Sprite && has(runtime, entity, "Sprite")) {
    drawable.spriteId = runtime.simulation.ecs.storage.Sprite.getAt(slot, "id") as SpriteIdType;
    return true;
  }
  return false;
}

function has(runtime: GameRuntime, entity: Entity, name: keyof typeof runtime.simulation.ecs.components): boolean {
  return runtime.simulation.ecs.entityHasComponent(entity, runtime.simulation.ecs.components[name]);
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
