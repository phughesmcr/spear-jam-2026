import { type MapContent, parseCampaignContent } from "@/src/game/content/map_schema.ts";
import { CAMPAIGN_CONTENT } from "@/src/game/content/maps/mod.ts";
import { VICTORY_GOTO } from "@/src/game/world/destinations.ts";
import { createGameMap, type GameMap } from "@/src/game/world/map.ts";
import { validateGameMaps } from "@/src/game/world/validation.ts";
import { createCodeRegistry } from "@/src/game/content/code_registry.ts";

export type LoadedGameMaps = {
  readonly startMapName: string;
  readonly gameMaps: readonly GameMap[];
};

const LOADED_GAME_MAPS = loadCampaignContent(CAMPAIGN_CONTENT);

export const START_MAP_NAME = LOADED_GAME_MAPS.startMapName;
export const GAME_MAPS = LOADED_GAME_MAPS.gameMaps;

const MAPS: ReadonlyMap<string, GameMap> = new Map(GAME_MAPS.map((map) => [map.name, map]));

/** Victory first, then campaign maps in load order — codes are 1-based and append-only. */
const TERMINAL_DESTINATION_REGISTRY = createCodeRegistry("terminal destination", [
  VICTORY_GOTO,
  ...GAME_MAPS.map((map) => map.name),
]);

export function terminalDestinationCode(goto: string): number {
  if (!TERMINAL_DESTINATION_REGISTRY.has(goto)) {
    throw new Error(`Unknown terminal destination "${goto}".`);
  }
  return TERMINAL_DESTINATION_REGISTRY.encode(goto);
}

export function terminalDestinationForCode(code: number): string {
  return TERMINAL_DESTINATION_REGISTRY.decode(code);
}

export function getMap(name: string): GameMap {
  const map = MAPS.get(name);
  if (!map) throw new Error(`Unknown map: ${name}`);
  return map;
}

export function loadCampaignContent(data: unknown): LoadedGameMaps {
  const content = parseCampaignContent(data);
  const gameMaps = content.maps.map(gameMapFromContent);
  const validationIssues = validateGameMaps(gameMaps);
  if (validationIssues.length > 0) {
    throw new Error(`Invalid campaign maps:\n${validationIssues.join("\n")}`);
  }

  return {
    startMapName: content.startMapName,
    gameMaps,
  };
}

function gameMapFromContent(map: MapContent): GameMap {
  return createGameMap(map.name, map.tiles, map.entities);
}
