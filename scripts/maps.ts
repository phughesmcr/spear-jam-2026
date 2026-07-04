import { compileTiledMap } from "@/src/map/authoring/mod.ts";
import type {
  CompiledTiledMap,
  TiledMap,
  TiledProperty,
  TiledTemplate,
  TiledTileset,
} from "@/src/map/authoring/mod.ts";
import {
  AUTHORING_TILE_SIZE,
  AUTOMAP_DIR,
  AUTOMAP_RULES_FILE,
  COMPILED_MAPS_PATH,
  ENTITY_MARKER_TYPES,
  ENTITY_MARKERS_IMAGE,
  ENTITY_MARKERS_TILESET,
  entityMarkersTilesetReference,
  MAPS_DIR,
  PALETTES,
  PNG_SIGNATURE,
  PROPERTY_TYPES,
  TEMPLATE_DEFINITIONS,
  TEMPLATE_DIR,
  templateFile,
  TERRAIN_AUTHORING_TILE_COUNT,
  TERRAIN_AUTHORING_TILE_DEFINITIONS,
  TERRAIN_AUTHORING_TILES,
  TERRAIN_BLOCKING_TILE_ID,
  TERRAIN_PASSABLE_TILE_ID,
  terrainTilesetReference,
  TILED_PROJECT_AUTOMAP_RULES_FILE,
  TILED_PROJECT_COMMANDS,
  TILED_PROJECT_PATH,
} from "@/src/map/authoring/catalog.ts";
import type { PaletteKey, TiledProjectCommand } from "@/src/map/authoring/catalog.ts";
import type { EntityDef } from "@/src/map/map.ts";
import { validateGameMaps } from "@/src/map/map_validation.ts";

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

type NewMapOptions = {
  readonly name: string;
  readonly palette: PaletteKey;
  readonly width: number;
  readonly height: number;
  readonly campaignOrder: number;
};

type ParsedNewMapArgs = Omit<NewMapOptions, "campaignOrder"> & {
  readonly campaignOrder?: number;
  readonly output?: string;
};

const JSON_INDENT = 2;

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  });
}

export async function main(args: readonly string[] = Deno.args): Promise<void> {
  const command = args[0];
  switch (command) {
    case "check":
      await checkMaps();
      return;
    case "compile":
      await compileMaps();
      return;
    case "play":
      await playCurrentMap(args.slice(1));
      return;
    case "sync-authoring":
      await syncAuthoring();
      return;
    case "new":
      await createNewMap(args.slice(1));
      return;
    default:
      throw new Error("Usage: deno run -A scripts/maps.ts check|compile|play|sync-authoring|new");
  }
}

async function checkMaps(): Promise<void> {
  const source = await generatedCompiledMapsSource();
  const issues = await generatedAuthoringIssues();

  const existing = await readRequiredTextFile(
    COMPILED_MAPS_PATH,
    `${COMPILED_MAPS_PATH} is missing. Run deno task maps:compile.`,
  );
  if (existing !== source) issues.push(`${COMPILED_MAPS_PATH} is stale. Run deno task maps:compile.`);

  if (issues.length > 0) throw new Error(`Map authoring check failed:\n${issues.join("\n")}`);
}

async function compileMaps(): Promise<void> {
  await Deno.writeTextFile(COMPILED_MAPS_PATH, await generatedCompiledMapsSource());
}

async function playCurrentMap(args: readonly string[]): Promise<void> {
  const mapPath = args[0];
  if (mapPath === undefined || mapPath.length === 0) {
    throw new Error("Usage: deno task maps:play -- <map.tiled.json>");
  }

  await compileMaps();
  const mapName = await mapNameForTiledMapPath(mapPath);
  const command = new Deno.Command("deno", {
    args: ["task", "dev", "--", "--open", startMapUrlPath(mapName)],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  if (!status.success) throw new Error(`Dev server exited with code ${status.code}.`);
}

async function syncAuthoring(): Promise<void> {
  await Deno.writeTextFile(TILED_PROJECT_PATH, generatedTiledProjectSource());
  await Deno.writeTextFile(`${MAPS_DIR}/${ENTITY_MARKERS_TILESET}`, generatedEntityMarkersTilesetSource());
  await Deno.writeFile(`${MAPS_DIR}/${TERRAIN_AUTHORING_TILES}`, generatedTerrainAuthoringPng());

  await Deno.mkdir(TEMPLATE_DIR, { recursive: true });
  const expectedPaths = new Set<string>();
  for (const [path, source] of Object.entries(generatedTemplateSources())) {
    expectedPaths.add(path);
    await Deno.writeTextFile(path, source);
  }

  for await (const entry of Deno.readDir(TEMPLATE_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".tx")) continue;
    const path = `${TEMPLATE_DIR}/${entry.name}`;
    if (!expectedPaths.has(path)) await Deno.remove(path);
  }

  await Deno.mkdir(AUTOMAP_DIR, { recursive: true });
  const expectedAutomapPaths = new Set<string>();
  for (const [path, source] of Object.entries(generatedAutomappingSources())) {
    expectedAutomapPaths.add(path);
    await Deno.writeTextFile(path, source);
  }

  for await (const entry of Deno.readDir(AUTOMAP_DIR)) {
    if (!entry.isFile) continue;
    const path = `${AUTOMAP_DIR}/${entry.name}`;
    if (!expectedAutomapPaths.has(path)) await Deno.remove(path);
  }
}

async function createNewMap(args: readonly string[]): Promise<void> {
  const parsed = parseNewMapArgs(args);
  const campaignOrder = parsed.campaignOrder ?? await nextCampaignOrder();
  const output = parsed.output ?? `${MAPS_DIR}/map_${campaignOrder}.tiled.json`;

  try {
    await Deno.stat(output);
    throw new Error(`${output} already exists.`);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }

  const map = buildScaffoldMap({ ...parsed, campaignOrder });
  await Deno.writeTextFile(output, jsonSource(map));
}

export function buildScaffoldMap(options: NewMapOptions): TiledMap {
  if (!Number.isInteger(options.width) || options.width < 3) throw new Error("Map width must be an integer >= 3.");
  if (!Number.isInteger(options.height) || options.height < 3) throw new Error("Map height must be an integer >= 3.");
  if (!Number.isInteger(options.campaignOrder) || options.campaignOrder <= 0) {
    throw new Error("Campaign order must be a positive integer.");
  }

  return {
    compressionlevel: -1,
    height: options.height,
    infinite: false,
    layers: [
      {
        data: scaffoldTerrain(options.width, options.height),
        height: options.height,
        id: 1,
        name: "terrain",
        opacity: 1,
        type: "tilelayer",
        visible: true,
        width: options.width,
        x: 0,
        y: 0,
      },
      {
        draworder: "topdown",
        id: 2,
        name: "objects",
        objects: [],
        opacity: 1,
        type: "objectgroup",
        visible: true,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 3,
    nextobjectid: 1,
    orientation: "orthogonal",
    properties: [
      property("campaignOrder", options.campaignOrder),
      property("name", options.name),
      property("palette", options.palette, "TerrainPalette"),
    ],
    renderorder: "right-down",
    tiledversion: "1.12.2",
    tileheight: AUTHORING_TILE_SIZE,
    tilesets: [
      terrainTilesetReference(),
      entityMarkersTilesetReference(),
    ],
    tilewidth: AUTHORING_TILE_SIZE,
    type: "map",
    version: "1.10",
    width: options.width,
  };
}

export function generatedTiledProjectSource(): string {
  return jsonSource({
    automappingRulesFile: TILED_PROJECT_AUTOMAP_RULES_FILE,
    commands: TILED_PROJECT_COMMANDS.map(projectCommandData),
    compatibilityVersion: 1100,
    extensionsPath: "extensions",
    folders: [
      ".",
      "automap",
      "templates",
    ],
    properties: [],
    propertyTypes: PROPERTY_TYPES,
  });
}

export function generatedAutomappingSources(): Readonly<Record<string, string>> {
  return {
    [AUTOMAP_RULES_FILE]: [
      "# Generated by deno task maps:sync-authoring",
      "reset_walls.tiled.json",
      "wall_variants.tiled.json",
      "",
    ].join("\n"),
    [`${AUTOMAP_DIR}/reset_walls.tiled.json`]: jsonSource(resetWallsAutomapRuleMap()),
    [`${AUTOMAP_DIR}/wall_variants.tiled.json`]: jsonSource(wallVariantsAutomapRuleMap()),
  };
}

export function generatedEntityMarkersTilesetSource(): string {
  return jsonSource({
    columns: ENTITY_MARKER_TYPES.length,
    image: ENTITY_MARKERS_IMAGE,
    imageheight: AUTHORING_TILE_SIZE,
    imagewidth: AUTHORING_TILE_SIZE * ENTITY_MARKER_TYPES.length,
    margin: 0,
    name: "entity_markers",
    spacing: 0,
    tilecount: ENTITY_MARKER_TYPES.length,
    tiledversion: "1.11.2",
    tileheight: AUTHORING_TILE_SIZE,
    tiles: ENTITY_MARKER_TYPES.map((type, id) => ({
      id,
      type,
      properties: [property("prefab", type, "Prefab")],
    })),
    tilewidth: AUTHORING_TILE_SIZE,
    type: "tileset",
    version: "1.10",
  });
}

export function generatedTemplateSources(): Readonly<Record<string, string>> {
  return Object.fromEntries(TEMPLATE_DEFINITIONS.map((definition) => [
    definition.path,
    jsonSource(templateFile(definition)),
  ]));
}

export function generatedTerrainAuthoringPng(): Uint8Array {
  const width = AUTHORING_TILE_SIZE * TERRAIN_AUTHORING_TILE_COUNT;
  const height = AUTHORING_TILE_SIZE;
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < TERRAIN_AUTHORING_TILE_DEFINITIONS.length; index++) {
    drawTerrainAuthoringTile(pixels, width, index, TERRAIN_AUTHORING_TILE_DEFINITIONS[index]!);
  }
  return encodePng(width, height, pixels);
}

function resetWallsAutomapRuleMap(): TiledMap {
  const width = 7;
  const height = 1;
  const baseWall = terrainGid(TERRAIN_BLOCKING_TILE_ID);
  const input = emptyTileData(width, height);
  const output = emptyTileData(width, height);
  for (
    const [x, terrainId] of [
      [0, 1],
      [2, 4],
      [4, 5],
    ] as const
  ) {
    input[x] = terrainGid(terrainId);
    output[x] = baseWall;
  }
  return automapRuleMap(width, height, [
    tileLayer(1, "input_terrain", width, height, input),
    tileLayer(2, "output_terrain", width, height, output),
  ]);
}

function wallVariantsAutomapRuleMap(): TiledMap {
  const width = 7;
  const height = 3;
  const wall = terrainGid(TERRAIN_BLOCKING_TILE_ID);
  const input = emptyTileData(width, height);
  const output = emptyTileData(width, height);

  setTile(input, width, 0, 1, wall);
  setTile(input, width, 1, 1, wall);
  setTile(input, width, 2, 1, wall);
  setTile(output, width, 1, 1, terrainGid(4));

  setTile(input, width, 5, 0, wall);
  setTile(input, width, 5, 1, wall);
  setTile(input, width, 5, 2, wall);
  setTile(output, width, 5, 1, terrainGid(5));

  return automapRuleMap(width, height, [
    tileLayer(1, "input_terrain", width, height, input),
    tileLayer(2, "output_terrain", width, height, output),
  ]);
}

function automapRuleMap(width: number, height: number, layers: TiledMap["layers"]): TiledMap {
  return {
    compressionlevel: -1,
    height,
    infinite: false,
    layers,
    nextlayerid: layers.length + 1,
    nextobjectid: 1,
    orientation: "orthogonal",
    properties: [
      property("AutomappingRadius", 1),
      property("MatchInOrder", true),
    ],
    renderorder: "right-down",
    tiledversion: "1.12.2",
    tileheight: AUTHORING_TILE_SIZE,
    tilesets: [automapTerrainTilesetReference()],
    tilewidth: AUTHORING_TILE_SIZE,
    type: "map",
    version: "1.10",
    width,
  };
}

function tileLayer(
  id: number,
  name: string,
  width: number,
  height: number,
  data: readonly number[],
): TiledMap["layers"][number] {
  return {
    data,
    height,
    id,
    name,
    opacity: 1,
    type: "tilelayer",
    visible: true,
    width,
    x: 0,
    y: 0,
  };
}

function emptyTileData(width: number, height: number): number[] {
  return Array.from({ length: width * height }, () => 0);
}

function setTile(data: number[], width: number, x: number, y: number, gid: number): void {
  data[y * width + x] = gid;
}

function terrainGid(terrainId: number): number {
  return terrainId + 1;
}

function automapTerrainTilesetReference(): ReturnType<typeof terrainTilesetReference> {
  return {
    ...terrainTilesetReference(),
    image: `../${TERRAIN_AUTHORING_TILES}`,
  };
}

async function generatedCompiledMapsSource(): Promise<string> {
  const maps = await compiledMaps();
  const validationIssues = validateGameMaps(maps.map((map) => map.gameMap));
  const campaignIssues = validateCampaignOrders(maps);
  const issues = [...validationIssues, ...campaignIssues];
  if (issues.length > 0) {
    throw new Error(`Compiled maps failed validation:\n${issues.join("\n")}`);
  }
  return `${JSON.stringify(compiledMapsData(maps))}\n`;
}

async function compiledMaps(): Promise<readonly GeneratedMap[]> {
  const tilesets = await loadTilesets();
  const templates = await loadTemplates();
  const maps: GeneratedMap[] = [];
  for await (const entry of Deno.readDir(MAPS_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".tiled.json")) continue;
    const sourcePath = `${MAPS_DIR}/${entry.name}`;
    const raw = parseJson<TiledMap>(sourcePath, await Deno.readTextFile(sourcePath));
    validateRawMap(sourcePath, raw);
    try {
      maps.push({
        ...compileTiledMap(raw, { palettes: PALETTES, sourcePath, templates, tilesets }),
        sourcePath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${sourcePath}: ${message}`);
    }
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

async function loadTemplates(): Promise<Readonly<Record<string, TiledTemplate>>> {
  const templates: Record<string, TiledTemplate> = {};
  try {
    for await (const entry of Deno.readDir(TEMPLATE_DIR)) {
      if (!entry.isFile || !entry.name.endsWith(".tx")) continue;
      const path = `${TEMPLATE_DIR}/${entry.name}`;
      templates[path] = parseJson<TiledTemplate>(path, await Deno.readTextFile(path));
    }
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
  return templates;
}

async function validateAuthoringAssets(tilesets: Readonly<Record<string, TiledTileset>>): Promise<void> {
  const issues: string[] = [];
  const markers = tilesets[ENTITY_MARKERS_TILESET];
  if (markers === undefined) {
    issues.push(`${ENTITY_MARKERS_TILESET} is missing.`);
  } else {
    await validateEntityMarkers(markers, issues);
  }
  await validateTerrainAuthoringTiles(issues);
  if (issues.length > 0) throw new Error(`Authoring assets failed validation:\n${issues.join("\n")}`);
}

async function generatedAuthoringIssues(): Promise<string[]> {
  const issues: string[] = [];
  await checkGeneratedText(TILED_PROJECT_PATH, generatedTiledProjectSource(), issues);
  await checkGeneratedText(`${MAPS_DIR}/${ENTITY_MARKERS_TILESET}`, generatedEntityMarkersTilesetSource(), issues);
  await checkGeneratedBytes(`${MAPS_DIR}/${TERRAIN_AUTHORING_TILES}`, generatedTerrainAuthoringPng(), issues);

  const expectedAutomap = generatedAutomappingSources();
  for (const [path, source] of Object.entries(expectedAutomap)) {
    await checkGeneratedText(path, source, issues);
  }

  const expectedTemplates = generatedTemplateSources();
  for (const [path, source] of Object.entries(expectedTemplates)) {
    await checkGeneratedText(path, source, issues);
  }

  try {
    for await (const entry of Deno.readDir(TEMPLATE_DIR)) {
      if (!entry.isFile || !entry.name.endsWith(".tx")) continue;
      const path = `${TEMPLATE_DIR}/${entry.name}`;
      if (expectedTemplates[path] === undefined) issues.push(`${path} is not generated by the authoring catalog.`);
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      issues.push(`${TEMPLATE_DIR} is missing. Run deno task maps:sync-authoring.`);
    } else {
      throw error;
    }
  }

  try {
    for await (const entry of Deno.readDir(AUTOMAP_DIR)) {
      if (!entry.isFile) continue;
      const path = `${AUTOMAP_DIR}/${entry.name}`;
      if (expectedAutomap[path] === undefined) issues.push(`${path} is not generated by the authoring catalog.`);
    }
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      issues.push(`${AUTOMAP_DIR} is missing. Run deno task maps:sync-authoring.`);
    } else {
      throw error;
    }
  }

  return issues;
}

async function validateEntityMarkers(tileset: TiledTileset, issues: string[]): Promise<void> {
  const expectedCount = ENTITY_MARKER_TYPES.length;
  requireTilesetField(tileset.tilewidth, "tilewidth", ENTITY_MARKERS_TILESET, AUTHORING_TILE_SIZE, issues);
  requireTilesetField(tileset.tileheight, "tileheight", ENTITY_MARKERS_TILESET, AUTHORING_TILE_SIZE, issues);
  requireTilesetField(tileset.columns, "columns", ENTITY_MARKERS_TILESET, expectedCount, issues);
  requireTilesetField(tileset.tilecount, "tilecount", ENTITY_MARKERS_TILESET, expectedCount, issues);
  requireTilesetField(
    tileset.imagewidth,
    "imagewidth",
    ENTITY_MARKERS_TILESET,
    AUTHORING_TILE_SIZE * expectedCount,
    issues,
  );
  requireTilesetField(tileset.imageheight, "imageheight", ENTITY_MARKERS_TILESET, AUTHORING_TILE_SIZE, issues);

  const dimensions = await pngDimensions(`${MAPS_DIR}/${tileset.image ?? ENTITY_MARKERS_IMAGE}`);
  if (dimensions.width !== tileset.imagewidth || dimensions.height !== tileset.imageheight) {
    issues.push(
      `${ENTITY_MARKERS_TILESET} image dimensions ${dimensions.width}x${dimensions.height} do not match tileset metadata.`,
    );
  }

  for (let id = 0; id < ENTITY_MARKER_TYPES.length; id++) {
    const tile = tileset.tiles?.find((candidate) => candidate.id === id);
    const expectedType = ENTITY_MARKER_TYPES[id]!;
    if (tile?.type !== expectedType) issues.push(`${ENTITY_MARKERS_TILESET} tile ${id} must be "${expectedType}".`);
  }
}

async function validateTerrainAuthoringTiles(issues: string[]): Promise<void> {
  const dimensions = await pngDimensions(`${MAPS_DIR}/${TERRAIN_AUTHORING_TILES}`);
  if (
    dimensions.width !== AUTHORING_TILE_SIZE * TERRAIN_AUTHORING_TILE_COUNT ||
    dimensions.height !== AUTHORING_TILE_SIZE
  ) {
    issues.push(
      `${TERRAIN_AUTHORING_TILES} must be ${
        AUTHORING_TILE_SIZE * TERRAIN_AUTHORING_TILE_COUNT
      }x${AUTHORING_TILE_SIZE}.`,
    );
  }
}

function validateRawMap(path: string, map: TiledMap): void {
  const issues: string[] = [];
  const terrainLayers = map.layers.filter((layer) => layer.name === "terrain");
  const objectLayers = map.layers.filter((layer) => layer.name === "objects");
  if (terrainLayers.length !== 1) issues.push(`${path}: expected exactly one "terrain" layer.`);
  if (objectLayers.length !== 1) issues.push(`${path}: expected exactly one "objects" layer.`);
  for (const layer of terrainLayers) {
    if (layer.type !== "tilelayer") issues.push(`${path}: layer "terrain" must be a tile layer.`);
    if (layer.class !== undefined && layer.class !== "terrain_layer") {
      issues.push(`${path}: layer "terrain" class must be "terrain_layer" when set.`);
    }
  }
  for (const layer of objectLayers) {
    if (layer.type !== "objectgroup") issues.push(`${path}: layer "objects" must be an object layer.`);
    if (layer.class !== undefined && layer.class !== "object_layer") {
      issues.push(`${path}: layer "objects" class must be "object_layer" when set.`);
    }
  }
  if (issues.length > 0) throw new Error(issues.join("\n"));
}

function validateCampaignOrders(maps: readonly GeneratedMap[]): readonly string[] {
  const issues: string[] = [];
  const byOrder = new Map<number, string>();
  for (const map of maps) {
    if (!Number.isInteger(map.campaignOrder) || map.campaignOrder <= 0) {
      issues.push(`${map.sourcePath}: campaignOrder must be a positive integer.`);
      continue;
    }
    const existing = byOrder.get(map.campaignOrder);
    if (existing !== undefined) {
      issues.push(`${map.sourcePath}: campaignOrder ${map.campaignOrder} duplicates ${existing}.`);
    } else {
      byOrder.set(map.campaignOrder, map.sourcePath);
    }
  }
  return issues;
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

function projectCommandData(command: TiledProjectCommand): TiledProjectCommand {
  return command;
}

export async function mapNameForTiledMapPath(path: string): Promise<string> {
  return mapNameForTiledMap(path, parseJson<TiledMap>(path, await Deno.readTextFile(path)));
}

export function mapNameForTiledMap(path: string, map: TiledMap): string {
  const raw = map.properties?.find((candidate) => candidate.name === "name")?.value;
  if (typeof raw !== "string" || raw.length === 0) throw new Error(`${path}: missing string map name.`);
  return raw;
}

export function startMapUrlPath(mapName: string): string {
  return `/?map=${encodeURIComponent(mapName)}`;
}

function parseNewMapArgs(args: readonly string[]): ParsedNewMapArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const name = args[index]!;
    if (!name.startsWith("--")) throw new Error(`Unexpected argument "${name}".`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for "${name}".`);
    values.set(name, value);
    index++;
  }

  const name = requiredArg(values, "--name");
  const palette = parsePalette(requiredArg(values, "--palette"));
  const width = parseIntegerArg(requiredArg(values, "--width"), "--width");
  const height = parseIntegerArg(requiredArg(values, "--height"), "--height");
  const campaignOrderValue = values.get("--campaign-order");
  const output = values.get("--output");

  return {
    name,
    palette,
    width,
    height,
    ...(campaignOrderValue === undefined ?
      {} :
      { campaignOrder: parseIntegerArg(campaignOrderValue, "--campaign-order") }),
    ...(output === undefined ? {} : { output }),
  };
}

function requiredArg(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined || value.length === 0) throw new Error(`Missing required argument "${name}".`);
  return value;
}

function parsePalette(value: string): PaletteKey {
  if (value in PALETTES) return value as PaletteKey;
  throw new Error(`Unknown palette "${value}".`);
}

function parseIntegerArg(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

async function nextCampaignOrder(): Promise<number> {
  let next = 1;
  for await (const entry of Deno.readDir(MAPS_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".tiled.json")) continue;
    const path = `${MAPS_DIR}/${entry.name}`;
    const map = parseJson<TiledMap>(path, await Deno.readTextFile(path));
    next = Math.max(next, mapCampaignOrder(path, map) + 1);
  }
  return next;
}

function mapCampaignOrder(path: string, map: TiledMap): number {
  const raw = map.properties?.find((candidate) => candidate.name === "campaignOrder")?.value;
  if (typeof raw !== "number" || !Number.isInteger(raw)) throw new Error(`${path}: missing integer campaignOrder.`);
  return raw;
}

function scaffoldTerrain(width: number, height: number): readonly number[] {
  const data: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      data.push(border ? TERRAIN_BLOCKING_TILE_ID + 1 : TERRAIN_PASSABLE_TILE_ID + 1);
    }
  }
  return data;
}

async function checkGeneratedText(path: string, expected: string, issues: string[]): Promise<void> {
  let actual = "";
  try {
    actual = await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      issues.push(`${path} is missing. Run deno task maps:sync-authoring.`);
      return;
    }
    throw error;
  }
  if (actual !== expected) issues.push(`${path} is stale. Run deno task maps:sync-authoring.`);
}

async function checkGeneratedBytes(path: string, expected: Uint8Array, issues: string[]): Promise<void> {
  let actual: Uint8Array;
  try {
    actual = await Deno.readFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      issues.push(`${path} is missing. Run deno task maps:sync-authoring.`);
      return;
    }
    throw error;
  }

  if (!bytesEqual(actual, expected)) issues.push(`${path} is stale. Run deno task maps:sync-authoring.`);
}

async function readRequiredTextFile(path: string, missingMessage: string): Promise<string> {
  try {
    return await Deno.readTextFile(path);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) throw new Error(missingMessage);
    throw error;
  }
}

function requireTilesetField(
  actual: number | undefined,
  field: string,
  tileset: string,
  expected: number,
  issues: string[],
): void {
  if (actual !== expected) issues.push(`${tileset} ${field} must be ${expected}.`);
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

function drawTerrainAuthoringTile(
  pixels: Uint8Array,
  imageWidth: number,
  tileIndex: number,
  tile: (typeof TERRAIN_AUTHORING_TILE_DEFINITIONS)[number],
): void {
  const left = tileIndex * AUTHORING_TILE_SIZE;
  for (let y = 0; y < AUTHORING_TILE_SIZE; y++) {
    for (let x = 0; x < AUTHORING_TILE_SIZE; x++) {
      const border = x === 0 || y === 0 || x === AUTHORING_TILE_SIZE - 1 || y === AUTHORING_TILE_SIZE - 1;
      const diagonal = tile.id % 3 === 2 && x === y;
      const center = tile.id % 3 === 0 && x >= 5 && x <= 10 && y >= 5 && y <= 10;
      const stripes = tile.id % 3 === 1 && (x + y) % 5 === 0;
      const color = border || diagonal || center || stripes ? tile.accent : tile.color;
      const offset = ((y * imageWidth) + left + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = color[3];
    }
  }
}

function encodePng(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const scanlineLength = 1 + width * 4;
  const raw = new Uint8Array(scanlineLength * height);
  for (let y = 0; y < height; y++) {
    const rawOffset = y * scanlineLength;
    raw[rawOffset] = 0;
    raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), rawOffset + 1);
  }

  return concatBytes([
    new Uint8Array(PNG_SIGNATURE),
    pngChunk("IHDR", ihdrData(width, height)),
    pngChunk("IDAT", zlibStored(raw)),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function ihdrData(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = 8;
  data[9] = 6;
  return data;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(concatBytes([typeBytes, data])));
  return chunk;
}

function zlibStored(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < data.length; offset += 0xffff) {
    const block = data.subarray(offset, Math.min(offset + 0xffff, data.length));
    const header = new Uint8Array(5);
    header[0] = offset + block.length >= data.length ? 0x01 : 0x00;
    header[1] = block.length & 0xff;
    header[2] = block.length >> 8;
    const inverse = 0xffff - block.length;
    header[3] = inverse & 0xff;
    header[4] = inverse >> 8;
    blocks.push(header, block);
  }

  const checksum = new Uint8Array(4);
  new DataView(checksum.buffer).setUint32(0, adler32(data));
  blocks.push(checksum);
  return concatBytes(blocks);
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function property(name: string, value: TiledProperty["value"], propertytype?: string): TiledProperty {
  const type = propertyTypeForValue(value);
  return propertytype === undefined ? { name, type, value } : { name, propertytype, type, value };
}

function propertyTypeForValue(value: TiledProperty["value"]): "bool" | "int" | "string" {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number" && Number.isInteger(value)) return "int";
  return "string";
}

function parseJson<T>(path: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${path} is not valid JSON: ${message}`);
  }
}

function jsonSource(value: unknown): string {
  return `${JSON.stringify(value, null, JSON_INDENT)}\n`;
}
