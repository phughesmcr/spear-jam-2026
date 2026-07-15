import { examineTextCode } from "@/src/game/content/examine_text.ts";
import type { DoorDef, SpearTurretDef, UplinkTerminalDef } from "@/src/game/content/map_entities.ts";
import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { DrawableKind } from "@/src/game/model/render_snapshot.ts";
import { DrawableLayer } from "@/src/game/simulation/components.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import { terminalDestinationCode } from "@/src/game/world/campaign.ts";
import { doorSlideCode, keyColorCode } from "@/src/game/world/map.ts";
import { TerrainBlock } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";

type DoorPrefab = Omit<DoorDef, "prefab">;

export function createDoor(runtime: GameRuntime, prefab: DoorPrefab): Entity {
  if (prefab.locked === true && prefab.color === undefined) {
    throw new Error("Locked door prefab is missing a key color");
  }
  const mask = TerrainBlock.Movement | TerrainBlock.EffectLine | (prefab.glass === true ? 0 : TerrainBlock.Sight);
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    blockMask: mask,
    components: {
      Drawable: { kind: DrawableKind.Door, layer: DrawableLayer.Structure },
      Door: { open: 0, slide: doorSlideCode(prefab.slide), openMs: prefab.openMs ?? 0 },
      Interactable: {},
      ...(prefab.examineTextId === undefined ? {} : {
        ExamineTextRef: { examineTextId: examineTextCode(prefab.examineTextId) },
      }),
      ...(prefab.locked === true && prefab.color !== undefined ?
        { Locked: { color: keyColorCode(prefab.color) } } :
        {}),
      ...(prefab.secret === true ? { Secret: {} } : {}),
      ...(prefab.glass === true ? { Glass: {} } : {}),
    },
  });
}

export function createUplinkTerminal(runtime: GameRuntime, prefab: Omit<UplinkTerminalDef, "prefab">): Entity {
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    blockMask: TerrainBlock.Movement,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure },
      Sprite: { id: SpriteId.UplinkTerminal },
      UplinkTerminal: { requiresSpear: prefab.requiresSpear === true ? 1 : 0 },
      Interactable: {},
      TerminalDestination: { destination: terminalDestinationCode(prefab.goto) },
      ...(prefab.examineTextId === undefined ? {} : {
        ExamineTextRef: { examineTextId: examineTextCode(prefab.examineTextId) },
      }),
    },
  });
}

export function createSpearTurret(runtime: GameRuntime, prefab: Omit<SpearTurretDef, "prefab">): Entity {
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    blockMask: TerrainBlock.Movement,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Structure },
      Sprite: { id: SpriteId.SpearTurret },
      SpearTurret: {},
      Interactable: {},
    },
  });
}
