import {
  AUTHORING_TILE_SIZE,
  BARRIER_TILESET_FIRST_GID,
  barrierTilesetReference,
  COMPILED_MAPS_PATH,
  ENTITY_MARKER_TYPES,
  ENTITY_MARKERS_IMAGE,
  ENTITY_MARKERS_TILESET,
  FLOOR_TILESET_FIRST_GID,
  floorTilesetReference,
  MAPS_DIR,
  TEMPLATE_DIR,
  TEXTURE_PACK_DEFINITIONS,
  TEXTURE_PACK_TILE_SIZE,
  WALL_TILESET_FIRST_GID,
  wallTilesetReference,
} from "@/src/map/authoring/catalog.ts";
import { compileTiledMap } from "@/src/map/authoring/compile.ts";
import type { TiledMap, TiledTemplate, TiledTileset } from "@/src/map/authoring/tiled_types.ts";
import { validateGameMaps } from "@/src/map/map_validation.ts";
import { TEXTURE_PACK_COLUMNS, TEXTURE_PACK_ROWS } from "@/src/map/terrain_palettes.ts";
import { parseJson } from "./json_utils.ts";
import { pngDimensions } from "./png.ts";
import type { CompiledMapData, CompiledMapsData, GeneratedMap } from "./types.ts";

export async function compileMaps(): Promise<void> {
  await Deno.writeTextFile(COMPILED_MAPS_PATH, await generatedCompiledMapsSource());
}

export async function generatedCompiledMapsSource(): Promise<string> {
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
        ...compileTiledMap(raw, { sourcePath, templates, tilesets }),
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
  await loadTilesetsFromDir(MAPS_DIR, "", tilesets);
  await validateAuthoringAssets(tilesets);
  return tilesets;
}

async function loadTilesetsFromDir(
  absoluteDir: string,
  relativeDir: string,
  tilesets: Record<string, TiledTileset>,
): Promise<void> {
  for await (const entry of Deno.readDir(absoluteDir)) {
    const path = `${absoluteDir}/${entry.name}`;
    const relativePath = relativeDir.length === 0 ? entry.name : `${relativeDir}/${entry.name}`;
    if (entry.isDirectory) {
      await loadTilesetsFromDir(path, relativePath, tilesets);
      continue;
    }
    if (!entry.isFile || !entry.name.endsWith(".tsj")) continue;
    tilesets[relativePath] = parseJson<TiledTileset>(path, await Deno.readTextFile(path));
    tilesets[entry.name] = tilesets[relativePath];
  }
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
  await validateTexturePackImages(issues);
  if (issues.length > 0) throw new Error(`Authoring assets failed validation:\n${issues.join("\n")}`);
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

async function validateTexturePackImages(issues: string[]): Promise<void> {
  const expectedWidth = TEXTURE_PACK_COLUMNS * TEXTURE_PACK_TILE_SIZE;
  const expectedHeight = TEXTURE_PACK_ROWS * TEXTURE_PACK_TILE_SIZE;
  for (const definition of TEXTURE_PACK_DEFINITIONS) {
    const path = `assets/game/textures/${definition.image}`;
    const dimensions = await pngDimensions(path);
    if (dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
      issues.push(`${path} must be ${expectedWidth}x${expectedHeight}.`);
    }
  }
}

function validateRawMap(path: string, map: TiledMap): void {
  const issues: string[] = [];
  const terrainLayers = map.layers.filter((layer) => layer.name === "terrain");
  const objectLayers = map.layers.filter((layer) => layer.name === "objects");
  const lightLayers = map.layers.filter((layer) => layer.name === "lights");
  const soundLayers = map.layers.filter((layer) => layer.name === "sounds");
  if (terrainLayers.length !== 1) issues.push(`${path}: expected exactly one "terrain" layer.`);
  if (objectLayers.length !== 1) issues.push(`${path}: expected exactly one "objects" layer.`);
  if (lightLayers.length > 1) issues.push(`${path}: expected at most one "lights" layer.`);
  if (soundLayers.length > 1) issues.push(`${path}: expected at most one "sounds" layer.`);
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
  for (const layer of lightLayers) {
    if (layer.type !== "objectgroup") issues.push(`${path}: layer "lights" must be an object layer.`);
    if (layer.class !== undefined && layer.class !== "light_layer") {
      issues.push(`${path}: layer "lights" class must be "light_layer" when set.`);
    }
  }
  for (const layer of soundLayers) {
    if (layer.type !== "objectgroup") issues.push(`${path}: layer "sounds" must be an object layer.`);
    if (layer.class !== undefined && layer.class !== "sound_layer") {
      issues.push(`${path}: layer "sounds" class must be "sound_layer" when set.`);
    }
  }
  const floorTileset = map.tilesets?.find((tileset) => tileset.firstgid === FLOOR_TILESET_FIRST_GID);
  const wallTileset = map.tilesets?.find((tileset) => tileset.firstgid === WALL_TILESET_FIRST_GID);
  const barrierTileset = map.tilesets?.find((tileset) => tileset.firstgid === BARRIER_TILESET_FIRST_GID);
  if (floorTileset?.source !== floorTilesetReference().source) {
    issues.push(`${path}: floor terrain tileset must be "${floorTilesetReference().source}".`);
  }
  if (wallTileset?.source !== wallTilesetReference().source) {
    issues.push(`${path}: wall terrain tileset must be "${wallTilesetReference().source}".`);
  }
  if (barrierTileset?.source !== barrierTilesetReference().source) {
    issues.push(`${path}: barrier terrain tileset must be "${barrierTilesetReference().source}".`);
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
    tiles: map.gameMap.terrain.tiles,
    entities: map.gameMap.entities,
  };
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
