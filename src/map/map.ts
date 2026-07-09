import {
  DECORATION_KINDS,
  type DoorSlide,
  type EntityDef,
  KeyColor as ContentKeyColor,
  type KeyColor as KeyColorType,
} from "@/src/map/entity_content.ts";
import { dimensions, terrainAt as staticTerrainAt } from "@/src/map/static_grid.ts";
import { SKY_CEILING_TEXTURE, TERRAIN_CATALOG } from "@/src/map/terrain_palettes.ts";
import { flagsBlockAttack, flagsBlockMovement, flagsBlockSight, terrainFlags } from "@/src/map/tile_flags.ts";

export const KeyColor = ContentKeyColor;
export { DECORATION_KINDS };
export type KeyColor = KeyColorType;
export type {
  DecorationDef,
  DecorationKind,
  DoorDef,
  DoorSlide,
  EnemyArchetype,
  EnemyDef,
  EntityDef,
  EntityDefFor,
  EntityPrefab,
  ItemDef,
  ItemKind,
  KeyDef,
  LightDef,
  NpcDef,
  PlayerDef,
  SoundDef,
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
  wall_texture: WallTexture;
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
  return dimensions(map);
}

export function terrainAt(map: GameMap, x: number, y: number): TerrainTile | undefined {
  return staticTerrainAt(map, x, y);
}

export function terrainBlocksMovement(tile: TerrainTile | undefined): boolean {
  return flagsBlockMovement(terrainFlags(tile));
}

export function terrainBlocksSight(tile: TerrainTile | undefined): boolean {
  return flagsBlockSight(terrainFlags(tile));
}

export function terrainBlocksAttacks(tile: TerrainTile | undefined): boolean {
  return flagsBlockAttack(terrainFlags(tile));
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
  staticTerrainAt(map, 0, 0);
  return map;
}
