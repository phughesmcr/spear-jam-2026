import type { DecorationDef, LightDef, SoundDef } from "@/src/game/content/map_entities.ts";
import { spriteIdForDecoration } from "@/src/game/content/sprites.ts";
import { DrawableKind } from "@/src/game/model/render_snapshot.ts";
import { soundIdCode } from "@/src/game/model/sound.ts";
import { DrawableLayer } from "@/src/game/simulation/components.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import type { Entity } from "turn-based-engine/ecs";

export function createDecoration(runtime: GameRuntime, prefab: Omit<DecorationDef, "prefab">): Entity {
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure },
      Sprite: { id: spriteIdForDecoration(prefab.decoration) },
    },
  });
}

export function createLight(runtime: GameRuntime, prefab: Omit<LightDef, "prefab">): Entity {
  const [red, green, blue] = colorChannels(prefab.color);
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    components: {
      LightEmitter: {
        red,
        green,
        blue,
        radius: prefab.radius,
        flickerAmount: prefab.flickerAmount ?? 0,
        flickerSpeed: prefab.flickerSpeed ?? 0,
      },
    },
  });
}

export function createSound(runtime: GameRuntime, prefab: Omit<SoundDef, "prefab">): Entity {
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    components: {
      SoundEmitter: {
        soundId: soundIdCode(prefab.soundId),
        radius: prefab.radius,
        volume: prefab.volume ?? 1,
      },
    },
  });
}

function colorChannels(color: string): readonly [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}
