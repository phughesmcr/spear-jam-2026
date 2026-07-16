import type { DoorDef, SpearTurretDef, UplinkTerminalDef } from "@/src/game/content/map_entities.ts";
import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { DrawableKind } from "@/src/game/model/render_snapshot.ts";
import { DrawableLayer, type GameComponentMap } from "@/src/game/simulation/components.ts";
import type { GameSessionContent } from "@/src/game/simulation/content.ts";
import { doorSlideCode, keyColorCode } from "@/src/game/world/map.ts";
import { type CrawlerSpawnSpec, TerrainBlock } from "turn-based-engine/crawler";

export function doorSpec(prefab: DoorDef, content: GameSessionContent): CrawlerSpawnSpec<GameComponentMap> {
  if (prefab.locked === true && prefab.color === undefined) {
    throw new Error("Locked door prefab is missing a key color");
  }
  const mask = TerrainBlock.Movement | TerrainBlock.EffectLine | (prefab.glass === true ? 0 : TerrainBlock.Sight);
  return {
    x: prefab.x,
    y: prefab.y,
    blockMask: mask,
    components: {
      Drawable: { kind: DrawableKind.Door, layer: DrawableLayer.Structure },
      Door: { open: 0, slide: doorSlideCode(prefab.slide), openMs: prefab.openMs ?? 0 },
      Interactable: {},
      ...(prefab.examineTextId === undefined ? {} : {
        ExamineTextRef: { examineTextId: content.simulation.examineTextCode(prefab.examineTextId) },
      }),
      ...(prefab.locked === true && prefab.color !== undefined ?
        { Locked: { color: keyColorCode(prefab.color) } } :
        {}),
      ...(prefab.secret === true ? { Secret: {} } : {}),
      ...(prefab.glass === true ? { Glass: {} } : {}),
    },
  };
}

export function uplinkTerminalSpec(
  prefab: UplinkTerminalDef,
  content: GameSessionContent,
): CrawlerSpawnSpec<GameComponentMap> {
  return {
    x: prefab.x,
    y: prefab.y,
    blockMask: TerrainBlock.Movement,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure },
      Sprite: { id: SpriteId.UplinkTerminal },
      UplinkTerminal: { requiresSpear: prefab.requiresSpear === true ? 1 : 0 },
      Interactable: {},
      TerminalDestination: { destination: content.levels.codeForDestination(prefab.goto) },
      ...(prefab.examineTextId === undefined ? {} : {
        ExamineTextRef: { examineTextId: content.simulation.examineTextCode(prefab.examineTextId) },
      }),
    },
  };
}

export function spearTurretSpec(prefab: SpearTurretDef): CrawlerSpawnSpec<GameComponentMap> {
  return {
    x: prefab.x,
    y: prefab.y,
    blockMask: TerrainBlock.Movement,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure },
      Sprite: { id: SpriteId.SpearTurret },
      SpearTurret: {},
      Interactable: {},
    },
  };
}
