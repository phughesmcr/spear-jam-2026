import type { GameMap } from "@/src/map/map.ts";
import { MAP_1 } from "@/src/map/map_1.ts";
import { MAP_2 } from "@/src/map/map_2.ts";
import { MAP_3 } from "@/src/map/map_3.ts";
import { MAP_4 } from "@/src/map/map_4.ts";
import { MAP_5 } from "@/src/map/map_5.ts";

export const START_MAP_NAME = MAP_1.name;
export const GAME_MAPS = [MAP_1, MAP_2, MAP_3, MAP_4, MAP_5] as const satisfies readonly GameMap[];

const MAPS: ReadonlyMap<string, GameMap> = new Map(GAME_MAPS.map((map) => [map.name, map]));

export function getMap(name: string): GameMap {
  const map = MAPS.get(name);
  if (!map) throw new Error(`Unknown map: ${name}`);
  return map;
}
