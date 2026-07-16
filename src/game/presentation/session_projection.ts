import { SpriteId, type SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import type { GameEvent } from "@/src/game/model/events.ts";
import {
  type DrawableEntity,
  DrawableKind,
  SpriteAnimationKind,
  type SpriteAnimationSnapshot,
} from "@/src/game/model/render_snapshot.ts";
import { SPRITE_ATTACK_MS, SPRITE_DEATH_MS, SPRITE_WALK_MS } from "@/src/game/simulation/components.ts";
import type { CrawlerCoreEvent } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";

type ProjectedOverlay = {
  readonly entity: Entity;
  readonly x: number;
  readonly y: number;
  readonly spriteId: SpriteIdType;
  readonly animation?: SpriteAnimationSnapshot;
};

export type SessionProjection = {
  readonly advance: (nowMs: number) => boolean;
  readonly consume: (
    player: Entity,
    coreEvents: readonly CrawlerCoreEvent[],
    events: readonly GameEvent[],
    nowMs: number,
  ) => void;
  readonly animationFor: (entity: Entity) => SpriteAnimationSnapshot | undefined;
  readonly overlays: () => readonly DrawableEntity[];
};

export function createSessionProjection(): SessionProjection {
  const animations = new Map<Entity, SpriteAnimationSnapshot>();
  const overlays = new Map<Entity, ProjectedOverlay>();

  function set(entity: Entity, kind: SpriteAnimationSnapshot["kind"], nowMs: number, durationMs: number): void {
    animations.set(entity, { kind, startedAtMs: nowMs, durationMs });
  }

  function consume(
    player: Entity,
    coreEvents: readonly CrawlerCoreEvent[],
    events: readonly GameEvent[],
    nowMs: number,
  ): void {
    for (const event of coreEvents) {
      if ((event.type === "moved" || event.type === "teleported") && event.entity.entity !== player) {
        set(event.entity.entity, SpriteAnimationKind.Walk, nowMs, SPRITE_WALK_MS);
      } else if (event.type === "despawned") {
        animations.delete(event.entity.entity);
      }
    }
    for (const event of events) {
      if ((event.type === "damageDealt" || event.type === "attackMissed") && event.actor !== player) {
        set(event.actor, SpriteAnimationKind.Attack, nowMs, SPRITE_ATTACK_MS);
      }
      if (event.type === "entityDefeated" && event.entity !== player && event.sprite !== undefined) {
        animations.delete(event.entity);
        overlays.set(event.entity, {
          entity: event.entity,
          x: event.position.x,
          y: event.position.y,
          spriteId: event.sprite,
          animation: {
            kind: SpriteAnimationKind.Death,
            startedAtMs: nowMs,
            durationMs: SPRITE_DEATH_MS,
          },
        });
      }
    }
  }

  function advance(nowMs: number): boolean {
    let active = false;
    for (const [entity, animation] of animations) {
      if (nowMs < animation.startedAtMs + animation.durationMs) active = true;
      else animations.delete(entity);
    }
    for (const [entity, overlay] of overlays) {
      const animation = overlay.animation;
      if (animation === undefined) continue;
      if (nowMs < animation.startedAtMs + animation.durationMs) {
        active = true;
      } else {
        overlays.set(entity, { ...overlay, spriteId: SpriteId.Corpse, animation: undefined });
      }
    }
    return active;
  }

  function projectedDrawables(): readonly DrawableEntity[] {
    return [...overlays.values()]
      .sort((left, right) => left.entity - right.entity)
      .map((overlay) => ({
        entity: overlay.entity,
        x: overlay.x,
        y: overlay.y,
        kind: DrawableKind.Sprite,
        spriteId: overlay.spriteId,
        ...(overlay.animation === undefined ? {} : { animation: overlay.animation }),
      }));
  }

  return {
    advance,
    consume,
    animationFor: (entity) => animations.get(entity),
    overlays: projectedDrawables,
  };
}
