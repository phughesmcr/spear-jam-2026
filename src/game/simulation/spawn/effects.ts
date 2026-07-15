import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { DrawableKind, SpriteAnimationKind } from "@/src/game/model/render_snapshot.ts";
import { DrawableLayer, PENDING_SPRITE_ANIMATION_START_MS, SPRITE_DEATH_MS } from "@/src/game/simulation/components.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import type { Entity } from "turn-based-engine/ecs";

type PositionedSpawn = { readonly x: number; readonly y: number };

export function createCorpse(runtime: GameRuntime, position: PositionedSpawn): Entity {
  return runtime.crawler.spawnCrawler({
    ...position,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Item },
      Sprite: { id: SpriteId.Corpse },
    },
  });
}

export function createDeathEffect(runtime: GameRuntime, position: PositionedSpawn, sprite: SpriteId): Entity {
  return runtime.crawler.spawnCrawler({
    ...position,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Item },
      Sprite: { id: sprite },
      SpriteAnimation: {
        kind: SpriteAnimationKind.Death,
        startedAtMs: PENDING_SPRITE_ANIMATION_START_MS,
        durationMs: SPRITE_DEATH_MS,
      },
    },
  });
}
