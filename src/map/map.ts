import type { DisplayName } from "@/src/game/names.ts";
import type { AttackDef } from "@/src/game/attack.ts";
import type { DialogueTreeId } from "@/src/dialogue/dialogue.ts";

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

export const DEFAULT_TERRAIN_PALETTE: readonly TerrainTile[] = [
  { id: 0, color: "#000000", ceiling_texture: "ceiling", floor_texture: "floor" },
  { id: 1, color: "#FFFFFF", wall_texture: "wall", blocking: true },
];

export const LockId = {
  Door1: 1,
} as const;

export type LockId = (typeof LockId)[keyof typeof LockId];

/**
 * Lock ids are small integers scoped to a single map. Held keys are stored
 * under a map-qualified id so a key from one map cannot open another map's
 * locks even when both maps reuse the same numeric lock id.
 */
export function scopedLockId(mapName: string, lockId: number): string {
  return `${mapName}#${lockId}`;
}

/** Sentinel `goto` for exits that end the game in victory instead of loading a map. */
export const VICTORY_GOTO = "victory";

export type PlayerDef = {
  prefab: "player";
  x: number;
  y: number;
  dir: number;
};

export type NpcDef = {
  prefab: "npc";
  x: number;
  y: number;
  dir: number;
  displayName: DisplayName;
  dialogueTreeId?: DialogueTreeId;
};

export type EnemyDef = {
  prefab: "enemy";
  x: number;
  y: number;
  dir: number;
  displayName: DisplayName;
  health?: number;
  damage?: number;
  attack?: Partial<AttackDef>;
};

export type DoorDef = {
  prefab: "door";
  x: number;
  y: number;
  locked?: boolean;
  lockId?: LockId;
};

export type KeyDef = {
  prefab: "key";
  x: number;
  y: number;
  lockId: LockId;
};

export type ExitDef = {
  prefab: "exit";
  x: number;
  y: number;
  goto: string;
};

export type MapEntityDef = PlayerDef | NpcDef | EnemyDef | DoorDef | KeyDef;

export type EntityDef = MapEntityDef | ExitDef;

export type GameMap = {
  readonly name: string;
  readonly terrain: {
    readonly palette: readonly TerrainTile[];
    readonly tiles: readonly (readonly number[])[];
  };
  readonly entities: readonly EntityDef[];
};

export type MapDimensions = {
  readonly width: number;
  readonly height: number;
};

export function mapDimensions(map: GameMap): MapDimensions {
  return {
    width: map.terrain.tiles[0]?.length ?? 0,
    height: map.terrain.tiles.length,
  };
}

/** Decoded palette lookup per map, so terrain reads avoid a linear palette scan. */
const TERRAIN_GRIDS = new WeakMap<GameMap, ReadonlyArray<TerrainTile | undefined>>();

function terrainGrid(map: GameMap): ReadonlyArray<TerrainTile | undefined> {
  const existing = TERRAIN_GRIDS.get(map);
  if (existing !== undefined) return existing;

  const paletteById = new Map(map.terrain.palette.map((entry) => [entry.id, entry]));
  const grid = map.terrain.tiles.flatMap((row) => row.map((tile) => paletteById.get(tile)));
  TERRAIN_GRIDS.set(map, grid);
  return grid;
}

export function terrainAt(map: GameMap, x: number, y: number): TerrainTile | undefined {
  const { width, height } = mapDimensions(map);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  if (x < 0 || y < 0 || x >= width || y >= height) return undefined;
  return terrainGrid(map)[y * width + x];
}

export function createGameMap(
  name: string,
  tiles: readonly (readonly number[])[],
  entities: readonly EntityDef[],
): GameMap {
  const width = tiles[0]?.length ?? 0;
  if (tiles.length === 0 || width === 0) {
    throw new Error(`Map "${name}" has no terrain tiles.`);
  }
  const raggedRow = tiles.findIndex((row) => row.length !== width);
  if (raggedRow !== -1) {
    throw new Error(
      `Map "${name}" terrain must be rectangular: row ${raggedRow} has ${
        tiles[raggedRow]!.length
      } tiles, expected ${width}.`,
    );
  }
  return {
    name,
    terrain: {
      palette: DEFAULT_TERRAIN_PALETTE,
      tiles,
    },
    entities,
  };
}
