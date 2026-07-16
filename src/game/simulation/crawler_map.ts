import { createGridMap, type GridMap, TerrainBlock } from "turn-based-engine/crawler";
import type { GameMap } from "@/src/game/world/map.ts";
import { copyBaseFlags, dimensions } from "@/src/game/world/grid.ts";
import { TileFlag } from "@/src/game/world/terrain_flags.ts";

export function createCrawlerMap(map: GameMap): GridMap {
  const { width, height } = dimensions(map);
  const source = copyBaseFlags(map);
  const terrain = new Uint8Array(source.length);

  for (let index = 0; index < source.length; index++) {
    const flags = source[index]!;
    let mask = 0;
    if ((flags & TileFlag.BlocksMove) !== 0) mask |= TerrainBlock.Movement;
    if ((flags & TileFlag.BlocksSight) !== 0) mask |= TerrainBlock.Sight;
    if ((flags & TileFlag.BlocksAttack) !== 0) mask |= TerrainBlock.EffectLine;
    terrain[index] = mask;
  }

  return createGridMap({ width, height, terrain });
}
