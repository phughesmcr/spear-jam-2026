import type { GameMap, MapDimensions, TerrainTile } from "@/src/map/map.ts";
import { terrainFlags, type TileFlags } from "@/src/map/tile_flags.ts";

type StaticGrid = {
  readonly terrain: readonly TerrainTile[];
  readonly baseFlags: Uint32Array;
};

const GRIDS = new WeakMap<GameMap, StaticGrid>();

export function dimensions(map: GameMap): MapDimensions {
  return {
    width: map.terrain.tiles[0]?.length ?? 0,
    height: map.terrain.tiles.length,
  };
}

export function tileIndex(map: GameMap, x: number, y: number): number | undefined {
  const { width, height } = dimensions(map);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  if (x < 0 || y < 0 || x >= width || y >= height) return undefined;
  return y * width + x;
}

export function terrainAt(map: GameMap, x: number, y: number): TerrainTile | undefined {
  const index = tileIndex(map, x, y);
  if (index === undefined) return undefined;
  return gridFor(map).terrain[index];
}

export function baseFlagsAt(map: GameMap, x: number, y: number): TileFlags | undefined {
  const index = tileIndex(map, x, y);
  if (index === undefined) return undefined;
  return gridFor(map).baseFlags[index];
}

export function copyBaseFlags(map: GameMap): Uint32Array {
  return new Uint32Array(gridFor(map).baseFlags);
}

function gridFor(map: GameMap): StaticGrid {
  const existing = GRIDS.get(map);
  if (existing !== undefined) return existing;

  const { width } = dimensions(map);
  const paletteById = terrainPaletteById(map);
  const terrain: TerrainTile[] = [];
  const baseFlags: TileFlags[] = [];

  for (let y = 0; y < map.terrain.tiles.length; y++) {
    const row = map.terrain.tiles[y]!;
    if (row.length !== width) {
      throw new Error(
        `Map "${map.name}" terrain must be rectangular: row ${y} has ${row.length} tiles, expected ${width}.`,
      );
    }

    for (let x = 0; x < row.length; x++) {
      const tileId = row[x]!;
      const tile = paletteById.get(tileId);
      if (tile === undefined) {
        throw new Error(`Map "${map.name}" terrain tile ${tileId} at (${x},${y}) is missing from its palette.`);
      }
      terrain.push(tile);
      baseFlags.push(terrainFlags(tile));
    }
  }

  const grid = { terrain, baseFlags: Uint32Array.from(baseFlags) };
  GRIDS.set(map, grid);
  return grid;
}

function terrainPaletteById(map: GameMap): ReadonlyMap<number, TerrainTile> {
  const paletteById = new Map<number, TerrainTile>();
  for (const entry of map.terrain.palette) {
    if (paletteById.has(entry.id)) {
      throw new Error(`Map "${map.name}" terrain palette has duplicate tile id ${entry.id}.`);
    }
    paletteById.set(entry.id, entry);
  }
  return paletteById;
}
