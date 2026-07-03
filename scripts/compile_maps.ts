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
  return tilesets;
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
