import type { EntityDef } from "@/src/game/content/map_entities.ts";
import type { GameComponentMap } from "@/src/game/simulation/components.ts";
import type { GameSessionContent } from "@/src/game/simulation/content.ts";
import { createCrawlerMap } from "@/src/game/simulation/crawler_map.ts";
import { decorationSpec, lightSpec, soundSpec } from "@/src/game/simulation/materialization/ambient.ts";
import { enemySpec, npcSpec, playerSpec } from "@/src/game/simulation/materialization/actors.ts";
import {
  itemSpec,
  keySpec,
  spearPickupSpec,
  uplinkCodeSpec,
  weaponPickupSpec,
} from "@/src/game/simulation/materialization/pickups.ts";
import { doorSpec, spearTurretSpec, uplinkTerminalSpec } from "@/src/game/simulation/materialization/structures.ts";
import type { GameMap } from "@/src/game/world/map.ts";
import type { CrawlerSpawnSpec, GridMap } from "turn-based-engine/crawler";

const PLAYER_STABLE_ID = 1;

export type MapMaterialization = {
  readonly mapId: string;
  readonly map: GridMap;
  readonly entities: readonly CrawlerSpawnSpec<GameComponentMap>[];
  readonly playerStableId: number;
};

export function materializeMap(map: GameMap, content: GameSessionContent): MapMaterialization {
  const players = map.entities.filter((entity) => entity.prefab === "player");
  if (players.length !== 1) {
    throw new Error(`Map "${map.name}" must contain exactly one player; found ${players.length}.`);
  }
  const crawlerMap = createCrawlerMap(map);
  assertDoorsOccupyOpenTerrain(map, crawlerMap);

  const player = players[0]!;
  const entities: CrawlerSpawnSpec<GameComponentMap>[] = [entitySpec(player, content, PLAYER_STABLE_ID)];
  for (const entity of map.entities) {
    if (entity === player) continue;
    entities.push(entitySpec(entity, content));
  }

  return {
    mapId: map.name,
    map: crawlerMap,
    entities,
    playerStableId: PLAYER_STABLE_ID,
  };
}

function assertDoorsOccupyOpenTerrain(map: GameMap, crawlerMap: GridMap): void {
  for (const entity of map.entities) {
    if (entity.prefab !== "door") continue;
    const index = entity.y * crawlerMap.width + entity.x;
    if (crawlerMap.terrain[index] !== 0) {
      throw new Error(`Door at (${entity.x},${entity.y}) in map "${map.name}" must be authored on open terrain.`);
    }
  }
}

function entitySpec(
  prefab: EntityDef,
  content: GameSessionContent,
  stableId?: number,
): CrawlerSpawnSpec<GameComponentMap> {
  switch (prefab.prefab) {
    case "player":
      return playerSpec(prefab, stableId ?? PLAYER_STABLE_ID);
    case "npc":
      return npcSpec(prefab, content);
    case "enemy":
      return enemySpec(prefab, content);
    case "door":
      return doorSpec(prefab, content);
    case "key":
      return keySpec(prefab, content);
    case "uplinkCode":
      return uplinkCodeSpec(prefab, content);
    case "uplinkTerminal":
      return uplinkTerminalSpec(prefab, content);
    case "weaponPickup":
      return weaponPickupSpec(prefab, content);
    case "item":
      return itemSpec(prefab, content);
    case "decoration":
      return decorationSpec(prefab, content);
    case "light":
      return lightSpec(prefab);
    case "sound":
      return soundSpec(prefab, content);
    case "spearPickup":
      return spearPickupSpec(prefab, content);
    case "spearTurret":
      return spearTurretSpec(prefab);
    default: {
      const _exhaustive: never = prefab;
      throw new Error(`Unsupported map entity: ${String(_exhaustive)}`);
    }
  }
}
