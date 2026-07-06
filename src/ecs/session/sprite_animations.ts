import type { Entity, World } from "@phughesmcr/miski";
import {
  Drawable,
  GridPos,
  PENDING_SPRITE_ANIMATION_START_MS,
  SPRITE_ATTACK_MS,
  SPRITE_WALK_MS,
  SpriteAnimation,
  SpriteAnimationKind,
  type SpriteAnimationSchema,
} from "@/src/ecs/components.ts";
import { DrawableKind } from "@/src/ecs/drawables.ts";
import { createCorpse, createDeathEffect } from "@/src/ecs/prefabs.ts";
import { drawableRenderQuery, spriteAnimationQuery } from "@/src/ecs/queries.ts";
import type { DefeatEffect } from "@/src/ecs/combat.ts";
import type { GameEvent } from "@/src/game/events.ts";

export type ActorPositionSnapshot = Map<Entity, { readonly x: number; readonly y: number }>;

export function advanceAnimations(world: World, nowMs: number): boolean {
  let changed = false;
  let active = false;
  for (const entity of world.entities.query(spriteAnimationQuery)) {
    const animation = world.components.getEntityData(SpriteAnimation, entity);
    if (animation.startedAtMs === PENDING_SPRITE_ANIMATION_START_MS) {
      world.components.setEntityData(SpriteAnimation, entity, {
        kind: animation.kind as SpriteAnimationSchema["kind"],
        startedAtMs: nowMs,
        durationMs: animation.durationMs,
      });
      changed = true;
      active = true;
      continue;
    }
    if (nowMs < animation.startedAtMs + animation.durationMs) {
      active = true;
      continue;
    }

    if (animation.kind === SpriteAnimationKind.Death) {
      const position = world.components.readEntityData(GridPos, entity);
      world.entities.destroy(entity);
      if (position !== undefined) createCorpse(world, position);
    } else {
      world.components.removeFromEntity(SpriteAnimation, entity);
    }
    changed = true;
  }
  if (changed) world.refresh();
  return active;
}

export function applyEventAnimations(
  world: World,
  playerEntity: Entity,
  events: readonly GameEvent[],
  nowMs: number,
): void {
  for (const event of events) {
    if ((event.type === "damageDealt" || event.type === "attackMissed") && event.actor !== playerEntity) {
      setAnimation(world, event.actor, {
        kind: SpriteAnimationKind.Attack,
        startedAtMs: nowMs,
        durationMs: SPRITE_ATTACK_MS,
      });
    }
  }
}

export function writeDefeatEffect(world: World, effect: DefeatEffect): void {
  createDeathEffect(world, { x: effect.x, y: effect.y }, effect.sprite);
}

export function actorPositionSnapshot(world: World): ActorPositionSnapshot {
  const positions: ActorPositionSnapshot = new Map();
  for (const entity of world.entities.query(drawableRenderQuery)) {
    const drawable = world.components.readEntityData(Drawable, entity);
    if (drawable?.kind !== DrawableKind.Actor) continue;
    const position = world.components.readEntityData(GridPos, entity);
    if (position !== undefined) positions.set(entity, { x: position.x, y: position.y });
  }
  return positions;
}

export function applyWalkAnimations(world: World, positions: ActorPositionSnapshot, nowMs: number): void {
  for (const [entity, from] of positions) {
    if (!world.entities.isActive(entity)) continue;
    const to = world.components.readEntityData(GridPos, entity);
    if (to === undefined || (to.x === from.x && to.y === from.y)) continue;
    setAnimation(world, entity, {
      kind: SpriteAnimationKind.Walk,
      startedAtMs: nowMs,
      durationMs: SPRITE_WALK_MS,
    });
  }
}

export function setAnimation(world: World, entity: Entity, animation: SpriteAnimationSchema): void {
  if (!world.entities.isActive(entity)) return;
  if (world.components.entityHas(SpriteAnimation, entity)) {
    world.components.setEntityData(SpriteAnimation, entity, animation);
    return;
  }
  world.components.addToEntity(SpriteAnimation, entity, animation);
}
