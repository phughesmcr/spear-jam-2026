import type { DefeatEffect } from "@/src/game/simulation/combat.ts";
import {
  hasComponent,
  PENDING_SPRITE_ANIMATION_START_MS,
  SPRITE_ATTACK_MS,
  SPRITE_WALK_MS,
  type SpriteAnimationSchema,
  writeComponent,
} from "@/src/game/simulation/components.ts";
import { DrawableKind, SpriteAnimationKind } from "@/src/game/model/render_snapshot.ts";
import { createCorpse, createDeathEffect } from "@/src/game/simulation/prefabs.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import type { GameEvent } from "@/src/game/model/events.ts";
import { type Entity, QuerySnapshot, type SlotIndex } from "turn-based-engine/ecs";

export type ActorPositionSnapshot = Map<Entity, { readonly x: number; readonly y: number }>;
export type AnimationController = {
  readonly advance: (nowMs: number) => boolean;
  readonly actorPositions: () => ActorPositionSnapshot;
  readonly applyWalks: (positions: ActorPositionSnapshot, nowMs: number) => void;
  readonly applyEvents: (player: Entity, events: readonly GameEvent[], nowMs: number) => void;
  readonly writeDefeatEffect: (effect: DefeatEffect) => void;
};

export function createAnimationController(runtime: GameRuntime): AnimationController {
  const animationQuery = runtime.game.query(runtime.game.components.SpriteAnimation);
  const animationSnapshot = new QuerySnapshot();
  const actorQuery = runtime.game.query(runtime.game.components.Drawable, runtime.crawler.components.GridPosition);
  let animationNowMs = 0;
  let animationActive = false;

  function set(entity: Entity, animation: SpriteAnimationSchema): void {
    if (!runtime.game.isEntityAlive(entity)) return;
    if (hasComponent(runtime.game, entity, "SpriteAnimation")) {
      writeComponent(runtime.game, entity, "SpriteAnimation", animation);
    } else {
      runtime.game.addComponentToEntity(entity, runtime.game.components.SpriteAnimation, animation);
    }
  }

  function advanceEntity(entity: Entity, slot: SlotIndex): void {
    const startedAtMs = runtime.game.storage.SpriteAnimation.getAt(slot, "startedAtMs");
    const durationMs = runtime.game.storage.SpriteAnimation.getAt(slot, "durationMs");
    const kind = runtime.game.storage.SpriteAnimation.getAt(slot, "kind") as SpriteAnimationSchema["kind"];
    if (startedAtMs === PENDING_SPRITE_ANIMATION_START_MS) {
      runtime.game.storage.SpriteAnimation.setAt(slot, "startedAtMs", animationNowMs);
      animationActive = true;
    } else if (animationNowMs < startedAtMs + durationMs) {
      animationActive = true;
    } else if (kind === SpriteAnimationKind.Death) {
      const position = runtime.crawler.entityPosition(entity);
      runtime.crawler.despawnCrawler(entity);
      createCorpse(runtime, position);
    } else {
      runtime.game.removeComponentFromEntity(entity, runtime.game.components.SpriteAnimation);
    }
  }

  function advance(nowMs: number): boolean {
    animationNowMs = nowMs;
    animationActive = false;
    animationQuery.snapshotInto(animationSnapshot);
    animationSnapshot.forEach((entity, slot) => {
      if (
        !runtime.game.isEntityAlive(entity) ||
        !runtime.game.entityHasComponent(entity, runtime.game.components.SpriteAnimation)
      ) return;
      advanceEntity(entity, slot);
    });
    return animationActive;
  }

  function actorPositions(): ActorPositionSnapshot {
    const positions: ActorPositionSnapshot = new Map();
    actorQuery.forEach((entity, slot) => {
      if (runtime.game.storage.Drawable.getAt(slot, "kind") !== DrawableKind.Actor) return;
      positions.set(entity, {
        x: runtime.crawler.storage.GridPosition.getAt(slot, "x"),
        y: runtime.crawler.storage.GridPosition.getAt(slot, "y"),
      });
    });
    return positions;
  }

  function applyWalks(positions: ActorPositionSnapshot, nowMs: number): void {
    for (const [entity, from] of positions) {
      if (!runtime.game.isEntityAlive(entity)) continue;
      const to = runtime.crawler.entityPosition(entity);
      if (to.x === from.x && to.y === from.y) continue;
      set(entity, { kind: SpriteAnimationKind.Walk, startedAtMs: nowMs, durationMs: SPRITE_WALK_MS });
    }
  }

  function applyEvents(player: Entity, events: readonly GameEvent[], nowMs: number): void {
    for (const event of events) {
      if ((event.type === "damageDealt" || event.type === "attackMissed") && event.actor !== player) {
        set(event.actor, { kind: SpriteAnimationKind.Attack, startedAtMs: nowMs, durationMs: SPRITE_ATTACK_MS });
      }
    }
  }

  function writeDefeatEffect(effect: DefeatEffect): void {
    createDeathEffect(runtime, effect, effect.sprite);
  }

  return { advance, actorPositions, applyWalks, applyEvents, writeDefeatEffect };
}
