export type WallTile = {
  id: number;
  color: string;
  wall_texture?: string;
  blocking: boolean;
};

export type FloorTile = {
  id: number;
  color: string;
  floor_texture: string;
  ceiling_texture: string;
  blocking?: boolean;
};

export type TerrainTile = WallTile | FloorTile;

export type EntityTile = {
  prefab: "player";
  x: number;
  y: number;
  dir: number;
};

export type GameMap = {
  name: string;
  terrain: {
    palette: TerrainTile[];
    tiles: number[][];
  };
  entities: EntityTile[];
};

export type MapDimensions = {
  readonly width: number;
  readonly height: number;
};

export function mapDimensions(map: GameMap): MapDimensions {
  return {
    width: Math.max(...map.terrain.tiles.map((row) => row.length)),
    height: map.terrain.tiles.length,
  };
}

export function terrainAt(map: GameMap, x: number, y: number): TerrainTile | undefined {
  const tile = map.terrain.tiles[y]?.[x];
  if (tile === undefined) return undefined;
  return map.terrain.palette.find((entry) => entry.id === tile);
}

export const MAP_1: GameMap = {
  name: "Map 1",
  terrain: {
    palette: [
      { id: 0, color: "#000000", ceiling_texture: "ceiling", floor_texture: "floor" },
      { id: 1, color: "#FFFFFF", wall_texture: "wall", blocking: true },
    ],
    tiles: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
  },
  entities: [
    { prefab: "player", x: 5, y: 5, dir: 1 },
  ],
};
