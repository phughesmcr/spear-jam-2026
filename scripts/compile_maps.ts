import { compileTiledMap } from "@/src/map/authoring/mod.ts";
import type { CompiledTiledMap, TiledMap, TiledTileset } from "@/src/map/authoring/mod.ts";
import type { EntityDef } from "@/src/map/map.ts";
import { validateGameMaps } from "@/src/map/map_validation.ts";
import {
  BOOT_SECTOR_PALETTE,
  DATA_CONDUIT_PALETTE,
  FIREWALL_PALETTE,
  MAINFRAME_CORE_PALETTE,
  NEXUS_PALETTE,
} from "@/src/map/terrain_palettes.ts";

const MAPS_DIR = "game_assets/maps";
const COMPILED_MAPS_PATH = "src/map/compiled_maps.json";
const ENTITY_MARKERS_TILESET = "entity_markers.tsj";
const ENTITY_MARKER_TYPES = [
  "player",
  "npc",
  "enemy",
  "door",
  "key",
  "uplinkCode",
  "uplinkTerminal",
  "weaponPickup",
  "item",
] as const;
const TERRAIN_AUTHORING_TILES = "terrain_authoring_tiles.png";
const AUTHORING_TILE_SIZE = 16;
const TERRAIN_AUTHORING_TILE_COUNT = 6;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

const PALETTES = {
  boot_sector: BOOT_SECTOR_PALETTE,
  data_conduit: DATA_CONDUIT_PALETTE,
  firewall: FIREWALL_PALETTE,
  nexus: NEXUS_PALETTE,
  mainframe_core: MAINFRAME_CORE_PALETTE,
} as const;

type PaletteKey = keyof typeof PALETTES;

type GeneratedMap = CompiledTiledMap & {
  readonly sourcePath: string;
};

type CompiledMapsData = {
  readonly startMapName: string;
  readonly maps: readonly CompiledMapData[];
};

type CompiledMapData = {
  readonly name: string;
  readonly palette: PaletteKey;
  readonly tiles: readonly (readonly number[])[];
  readonly entities: readonly EntityDef[];
};

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  });
}

export async function main(args: readonly string[] = Deno.args): Promise<void> {
  const mode = args[0];
  if (mode !== "--write" && mode !== "--check") {
    throw new Error("Usage: deno run -A scripts/compile_maps.ts --write|--check");
  }

  const source = await generatedSource();

  if (mode === "--write") {
    await Deno.writeTextFile(COMPILED_MAPS_PATH, source);
    return;
  }

  let existing = "";
  try {
    existing = await Deno.readTextFile(COMPILED_MAPS_PATH);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`${COMPILED_MAPS_PATH} is missing. Run deno task maps:compile.`);
    }
    throw error;
  }

  if (existing !== source) {
    throw new Error(`${COMPILED_MAPS_PATH} is stale. Run deno task maps:compile.`);
  }
}

async function generatedSource(): Promise<string> {
  const maps = await compiledMaps();
  const validationIssues = validateGameMaps(maps.map((map) => map.gameMap));
  if (validationIssues.length > 0) {
    throw new Error(`Compiled maps failed validation:\n${validationIssues.join("\n")}`);
  }
  return `${JSON.stringify(compiledMapsData(maps))}\n`;
}

async function compiledMaps(): Promise<readonly GeneratedMap[]> {
  const tilesets = await loadTilesets();
  const maps: GeneratedMap[] = [];
  for await (const entry of Deno.readDir(MAPS_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".tiled.json")) continue;
    const sourcePath = `${MAPS_DIR}/${entry.name}`;
    const raw = parseJson<TiledMap>(sourcePath, await Deno.readTextFile(sourcePath));
    maps.push({
      ...compileTiledMap(raw, { palettes: PALETTES, tilesets }),
      sourcePath,
    });
  }

  maps.sort((a, b) => a.campaignOrder - b.campaignOrder || a.sourcePath.localeCompare(b.sourcePath));
  if (maps.length === 0) throw new Error(`No .tiled.json maps found in ${MAPS_DIR}`);
  return maps;
}

async function loadTilesets(): Promise<Readonly<Record<string, TiledTileset>>> {
  const tilesets: Record<string, TiledTileset> = {};
  for await (const entry of Deno.readDir(MAPS_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".tsj")) continue;
    const path = `${MAPS_DIR}/${entry.name}`;
    tilesets[entry.name] = parseJson<TiledTileset>(path, await Deno.readTextFile(path));
  }
  await validateAuthoringAssets(tilesets);
  return tilesets;
}

async function validateAuthoringAssets(tilesets: Readonly<Record<string, TiledTileset>>): Promise<void> {
  const markers = tilesets[ENTITY_MARKERS_TILESET];
  if (markers === undefined) throw new Error(`${ENTITY_MARKERS_TILESET} is missing.`);
  await validateEntityMarkers(markers);
  await validateTerrainAuthoringTiles();
}

async function validateEntityMarkers(tileset: TiledTileset): Promise<void> {
  const expectedCount = ENTITY_MARKER_TYPES.length;
  requireTilesetField(tileset.tilewidth, "tilewidth", ENTITY_MARKERS_TILESET, AUTHORING_TILE_SIZE);
  requireTilesetField(tileset.tileheight, "tileheight", ENTITY_MARKERS_TILESET, AUTHORING_TILE_SIZE);
  requireTilesetField(tileset.columns, "columns", ENTITY_MARKERS_TILESET, expectedCount);
  requireTilesetField(tileset.tilecount, "tilecount", ENTITY_MARKERS_TILESET, expectedCount);
  requireTilesetField(tileset.imagewidth, "imagewidth", ENTITY_MARKERS_TILESET, AUTHORING_TILE_SIZE * expectedCount);
  requireTilesetField(tileset.imageheight, "imageheight", ENTITY_MARKERS_TILESET, AUTHORING_TILE_SIZE);

  const dimensions = await pngDimensions(`${MAPS_DIR}/${tileset.image ?? "entity_markers.png"}`);
  if (dimensions.width !== tileset.imagewidth || dimensions.height !== tileset.imageheight) {
    throw new Error(
      `${ENTITY_MARKERS_TILESET} image dimensions ${dimensions.width}x${dimensions.height} do not match tileset metadata.`,
    );
  }

  for (let id = 0; id < ENTITY_MARKER_TYPES.length; id++) {
    const tile = tileset.tiles?.find((candidate) => candidate.id === id);
    const expectedType = ENTITY_MARKER_TYPES[id]!;
    if (tile?.type !== expectedType) {
      throw new Error(`${ENTITY_MARKERS_TILESET} tile ${id} must be "${expectedType}".`);
    }
  }
}

async function validateTerrainAuthoringTiles(): Promise<void> {
  const dimensions = await pngDimensions(`${MAPS_DIR}/${TERRAIN_AUTHORING_TILES}`);
  if (
    dimensions.width !== AUTHORING_TILE_SIZE * TERRAIN_AUTHORING_TILE_COUNT ||
    dimensions.height !== AUTHORING_TILE_SIZE
  ) {
    throw new Error(
      `${TERRAIN_AUTHORING_TILES} must be ${
        AUTHORING_TILE_SIZE * TERRAIN_AUTHORING_TILE_COUNT
      }x${AUTHORING_TILE_SIZE}.`,
    );
  }
}

function requireTilesetField(
  actual: number | undefined,
  field: string,
  tileset: string,
  expected: number,
): void {
  if (actual !== expected) throw new Error(`${tileset} ${field} must be ${expected}.`);
}

async function pngDimensions(path: string): Promise<{ readonly width: number; readonly height: number }> {
  const bytes = await Deno.readFile(path);
  if (bytes.length < 24) throw new Error(`${path} is not a valid PNG file.`);
  for (let index = 0; index < PNG_SIGNATURE.length; index++) {
    if (bytes[index] !== PNG_SIGNATURE[index]) throw new Error(`${path} is not a valid PNG file.`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

function compiledMapsData(maps: readonly GeneratedMap[]): CompiledMapsData {
  return {
    startMapName: maps[0]!.gameMap.name,
    maps: maps.map(compiledMapData),
  };
}

function compiledMapData(map: GeneratedMap): CompiledMapData {
  return {
    name: map.gameMap.name,
    palette: paletteKey(map.paletteKey),
    tiles: map.gameMap.terrain.tiles,
    entities: map.gameMap.entities,
  };
}

function paletteKey(value: string): PaletteKey {
  if (value in PALETTES) return value as PaletteKey;
  throw new Error(`Compiled map used unknown terrain palette "${value}".`);
}

function parseJson<T>(path: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path} is not valid JSON: ${message}`);
  }
}
