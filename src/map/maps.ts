import type { GameMap } from "@/src/map/map.ts";
import {
  GAME_MAPS as GENERATED_GAME_MAPS,
  START_MAP_NAME as GENERATED_START_MAP_NAME,
} from "@/src/map/generated_maps.ts";

export const START_MAP_NAME = GENERATED_START_MAP_NAME;
export const GAME_MAPS = GENERATED_GAME_MAPS satisfies readonly GameMap[];

const MAPS: ReadonlyMap<string, GameMap> = new Map(GAME_MAPS.map((map) => [map.name, map]));

export function getMap(name: string): GameMap {
  const map = MAPS.get(name);
  if (!map) throw new Error(`Unknown map: ${name}`);
  return map;
}
