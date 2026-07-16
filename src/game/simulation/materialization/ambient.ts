import type { DecorationDef, LightDef, SoundDef } from "@/src/game/content/map_entities.ts";
import { DrawableKind } from "@/src/game/model/render_snapshot.ts";
import { DrawableLayer, type GameComponentMap } from "@/src/game/simulation/components.ts";
import type { GameSessionContent } from "@/src/game/simulation/content.ts";
import type { CrawlerSpawnSpec } from "turn-based-engine/crawler";

export function decorationSpec(
  prefab: DecorationDef,
  content: GameSessionContent,
): CrawlerSpawnSpec<GameComponentMap> {
  return {
    x: prefab.x,
    y: prefab.y,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure },
      Sprite: { id: content.presentation.spriteForDecoration(prefab.decoration) },
    },
  };
}

export function lightSpec(prefab: LightDef): CrawlerSpawnSpec<GameComponentMap> {
  const [red, green, blue] = colorChannels(prefab.color);
  return {
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
  };
}

export function soundSpec(prefab: SoundDef, content: GameSessionContent): CrawlerSpawnSpec<GameComponentMap> {
  return {
    x: prefab.x,
    y: prefab.y,
    components: {
      SoundEmitter: {
        soundId: content.audio.soundCode(prefab.soundId),
        radius: prefab.radius,
        volume: prefab.volume ?? 1,
      },
    },
  };
}

function colorChannels(color: string): readonly [number, number, number] {
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ];
}
