import type { GameMap } from "@/src/map/map.ts";
import { MAP_1 } from "@/src/map/map_1.ts";
import { MAP_2 } from "@/src/map/map_2.ts";

export const START_MAP_NAME = MAP_1.name;

const MAPS: ReadonlyMap<string, GameMap> = new Map([
  [MAP_1.name, MAP_1],
  [MAP_2.name, MAP_2],
]);

export function getMap(name: string): GameMap {
  const map = MAPS.get(name);
  if (!map) throw new Error(`Unknown map: ${name}`);
  return map;
}
