import { KeyColor as ContentKeyColor } from "@/src/map/entity_content.ts";
import type { DoorSlide, EntityDef, KeyColor as KeyColorType } from "@/src/map/entity_content.ts";
import { SKY_CEILING_TEXTURE, TERRAIN_CATALOG } from "@/src/map/terrain_palettes.ts";

export const KeyColor = ContentKeyColor;
export type KeyColor = KeyColorType;
export type {
  DecorationDef,
  DoorDef,
  DoorSlide,
  EnemyDef,
  EntityDef,
  EntityDefFor,
  EntityPrefab,
  ItemDef,
  KeyDef,
  LightDef,
  MapDecorationKind,
  MapEnemyArchetype,
  MapItemKind,
  NpcDef,
  PlayerDef,
  UplinkCodeDef,
  UplinkTerminalDef,
  WeaponPickupDef,
} from "@/src/map/entity_content.ts";

export const TexturePack = {
  Pack1: "pack1",
  Pack2: "pack2",
  Pack3: "pack3",
} as const;

export type TexturePack = (typeof TexturePack)[keyof typeof TexturePack];
export type TexturePackRef = `${TexturePack}:${number},${number}`;
export type WallTexture = "wall" | TexturePackRef;
export type FloorTexture = "floor" | TexturePackRef;
export { SKY_CEILING_TEXTURE };
export type CeilingTexture = "ceiling" | typeof SKY_CEILING_TEXTURE | TexturePackRef;

export const BarrierTexture = {
  Bars: "bars",
  Glass: "glass",
} as const;

export type BarrierTexture = (typeof BarrierTexture)[keyof typeof BarrierTexture];

export type WallTile = {
  kind: "wall";
  id: number;
  color: string;
  wall_texture?: WallTexture;
};

export type FloorTile = {
  kind: "floor";
  id: number;
  color: string;
  floor_texture: FloorTexture;
  ceiling_texture: CeilingTexture;
};

export type BarrierTile = {
  kind: "barrier";
  id: number;
  color: string;
  barrier_texture: BarrierTexture;
  floor_texture: FloorTexture;
  ceiling_texture: CeilingTexture;
};

export type TerrainTile = BarrierTile | FloorTile | WallTile;

export const DEFAULT_TERRAIN_PALETTE: readonly TerrainTile[] = TERRAIN_CATALOG;

const KEY_COLOR_CODES: Record<KeyColorType, number> = {
  [ContentKeyColor.Red]: 1,
  [ContentKeyColor.Blue]: 2,
  [ContentKeyColor.Yellow]: 3,
};

const KEY_COLORS_BY_CODE = new Map<number, KeyColorType>(
  Object.entries(KEY_COLOR_CODES).map(([color, code]) => [code, color as KeyColorType]),
);

export function keyColorCode(color: KeyColorType): number {
  return KEY_COLOR_CODES[color];
}

export function keyColorForCode(code: number): KeyColorType {
  const color = KEY_COLORS_BY_CODE.get(code);
  if (color === undefined) throw new Error(`Unknown key color code: ${code}`);
  return color;
}

/** Sentinel `goto` for exits that end the game in victory instead of loading a map. */
export const VICTORY_GOTO = "victory";
const MAX_TERMINAL_DESTINATION_CODE = 65535;
const TERMINAL_DESTINATION_CODES = new Map<string, number>([[VICTORY_GOTO, 1]]);
const TERMINAL_DESTINATIONS_BY_CODE = new Map<number, string>([[1, VICTORY_GOTO]]);
let nextTerminalDestinationCode = 2;

export function terminalDestinationCode(goto: string): number {
  const existing = TERMINAL_DESTINATION_CODES.get(goto);
  if (existing !== undefined) return existing;
  if (nextTerminalDestinationCode > MAX_TERMINAL_DESTINATION_CODE) {
    throw new Error("Too many uplink terminal destinations.");
  }

  const code = nextTerminalDestinationCode++;
  TERMINAL_DESTINATION_CODES.set(goto, code);
  TERMINAL_DESTINATIONS_BY_CODE.set(code, goto);
  return code;
}

export function terminalDestinationForCode(code: number): string {
  const goto = TERMINAL_DESTINATIONS_BY_CODE.get(code);
  if (goto === undefined) throw new Error(`Unknown uplink terminal destination code: ${code}`);
  return goto;
}

/**
 * Which way a door slides open. Horizontal directions must lie along the
 * door's span (east/west for doors in north-south walls, north/south for
 * doors in east-west walls); invalid directions fall back to the default.
 */
const DOOR_SLIDE_CODES: Readonly<Record<DoorSlide, number>> = {
  north: 1,
  east: 2,
  south: 3,
  west: 4,
  up: 5,
  down: 6,
};

const DOOR_SLIDES_BY_CODE = new Map<number, DoorSlide>(
  Object.entries(DOOR_SLIDE_CODES).map(([slide, code]) => [code, slide as DoorSlide]),
);

/** Storage code for a door slide direction; 0 means "renderer default". */
export function doorSlideCode(slide?: DoorSlide): number {
  return slide === undefined ? 0 : DOOR_SLIDE_CODES[slide];
}

export function doorSlideForCode(code: number): DoorSlide | undefined {
  return DOOR_SLIDES_BY_CODE.get(code);
}

/** How long a door takes to slide fully open (or closed). */
export const DEFAULT_DOOR_OPEN_MS = 350;

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

export type GameMapOptions = {
  readonly palette?: readonly TerrainTile[];
};

export function mapDimensions(map: GameMap): MapDimensions {
  return {
    width: map.terrain.tiles[0]?.length ?? 0,
    height: map.terrain.tiles.length,
  };
}

/** Decoded palette lookup per map, so terrain reads avoid a linear palette scan. */
const TERRAIN_GRIDS = new WeakMap<GameMap, readonly TerrainTile[]>();

function terrainGrid(map: GameMap): readonly TerrainTile[] {
  const existing = TERRAIN_GRIDS.get(map);
  if (existing !== undefined) return existing;

  const width = mapDimensions(map).width;
  const paletteById = terrainPaletteById(map);
  const grid: TerrainTile[] = [];
  for (let y = 0; y < map.terrain.tiles.length; y++) {
    const row = map.terrain.tiles[y]!;
    if (row.length !== width) {
      throw new Error(
        `Map "${map.name}" terrain must be rectangular: row ${y} has ${row.length} tiles, expected ${width}.`,
      );
    }

    for (let x = 0; x < row.length; x++) {
      const tileId = row[x]!;
      const terrain = paletteById.get(tileId);
      if (terrain === undefined) {
        throw new Error(`Map "${map.name}" terrain tile ${tileId} at (${x},${y}) is missing from its palette.`);
      }
      grid.push(terrain);
    }
  }

  TERRAIN_GRIDS.set(map, grid);
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

export function terrainAt(map: GameMap, x: number, y: number): TerrainTile | undefined {
  const { width, height } = mapDimensions(map);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  if (x < 0 || y < 0 || x >= width || y >= height) return undefined;
  return terrainGrid(map)[y * width + x];
}

export function terrainBlocksMovement(tile: TerrainTile | undefined): boolean {
  return tile === undefined || tile.kind === "wall" || tile.kind === "barrier";
}

export function terrainBlocksSight(tile: TerrainTile | undefined): boolean {
  return tile === undefined || tile.kind === "wall";
}

export function terrainBlocksAttacks(tile: TerrainTile | undefined): boolean {
  return tile === undefined || tile.kind === "wall" || tile.kind === "barrier";
}

export function terrainIsBarrier(tile: TerrainTile | undefined): tile is BarrierTile {
  return tile?.kind === "barrier";
}

export function createGameMap(
  name: string,
  tiles: readonly (readonly number[])[],
  entities: readonly EntityDef[],
  options: GameMapOptions = {},
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
  const map: GameMap = {
    name,
    terrain: {
      palette: options.palette ?? DEFAULT_TERRAIN_PALETTE,
      tiles,
    },
    entities,
  };
  terrainGrid(map);
  return map;
}
