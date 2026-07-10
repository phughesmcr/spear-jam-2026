import {
  createTilesetRegistry,
  decodeObjectGid,
  decodeTerrainGid,
  type TilesetRegistry,
  type TilesetSources,
} from "@/src/map/authoring/gid.ts";
import {
  mergeProperties,
  optionalBoolean,
  optionalString,
  type PropertyMap,
  readProperties,
  requiredInteger,
  requiredString,
  validatePropertyNames,
} from "@/src/map/authoring/properties.ts";
import type { TiledLayer, TiledMap, TiledObject, TiledTemplate } from "@/src/map/authoring/tiled_types.ts";
import {
  ENTITY_AUTHORING_PROPERTY_NAMES,
  ENTITY_SCHEMA,
  entityFromAuthoring,
  type EntityPrefab,
  mapEntityPrefab,
  PREFAB_AUTHORING_PROPERTY_NAMES,
} from "@/src/map/entity_descriptors.ts";
import { createGameMap, type EntityDef, type GameMap, type LightDef, type SoundDef } from "@/src/map/map.ts";
import { TERRAIN_CATALOG } from "@/src/map/terrain_palettes.ts";
import { flagsBlockAttack, flagsBlockMovement, flagsBlockSight, terrainFlags } from "@/src/map/tile_flags.ts";

export type CompileTiledMapOptions = {
  readonly sourcePath?: string;
  readonly templates?: Readonly<Record<string, TiledTemplate>>;
  readonly tilesets?: TilesetSources;
};

export type CompiledTiledMap = {
  readonly gameMap: GameMap;
  readonly campaignOrder: number;
};

type RequiredLayers = {
  readonly terrain: TiledLayer;
  readonly objects: TiledLayer;
  readonly lights?: TiledLayer;
  readonly sounds?: TiledLayer;
};

type GridPosition = {
  readonly x: number;
  readonly y: number;
};

type ResolvedObject = GridPosition & {
  readonly properties: PropertyMap;
};

type ResolvedTemplate = {
  readonly object: TiledObject;
  readonly registry: TilesetRegistry;
};

const NO_PROPERTY_NAMES: ReadonlySet<string> = new Set();
const MAP_PROPERTY_NAMES: ReadonlySet<string> = new Set(["name", "campaignOrder"]);
// Lights and sounds live on dedicated layers, so their authored objects carry no "prefab"
// property. Derive the accepted names from the single ENTITY_DEFINITIONS source of truth
// rather than restating them, so schema changes cannot drift from the compiler.
const LIGHT_PROPERTY_NAMES: ReadonlySet<string> = authoredFieldNames("light");
const SOUND_PROPERTY_NAMES: ReadonlySet<string> = authoredFieldNames("sound");
const TERRAIN_PROPERTY_NAMES: ReadonlySet<string> = new Set([
  "terrainId",
  "terrainKind",
  "blocking",
  "blocksSight",
  "blocksAttacks",
  "barrierTexture",
  "label",
  "floorTexture",
  "ceilingTexture",
  "wallTexture",
]);

export function compileTiledMap(source: TiledMap, options: CompileTiledMapOptions): CompiledTiledMap {
  validateMapShape(source);

  const mapProperties = readProperties(source.properties, MAP_PROPERTY_NAMES, "map");
  const name = requiredString(mapProperties, "name", "map");
  const campaignOrder = requiredInteger(mapProperties, "campaignOrder", "map");

  const layers = requiredLayers(source);
  const registry = createTilesetRegistry(source.tilesets, options.tilesets);
  const terrain = compileTerrain(source, layers.terrain, registry);
  const entities = [
    ...compileEntities(source, layers.objects, registry, options),
    ...compileLights(source, layers.lights, registry, options),
    ...compileSounds(source, layers.sounds, registry, options),
  ];

  return {
    gameMap: createGameMap(name, terrain, entities, { palette: TERRAIN_CATALOG }),
    campaignOrder,
  };
}

function validateMapShape(source: TiledMap): void {
  if (source.type !== undefined && source.type !== "map") throw new Error(`Tiled source must be a map.`);
  if (source.orientation !== "orthogonal") throw new Error(`Tiled map must be orthogonal.`);
  if (source.infinite === true || source.infinite === 1) throw new Error(`Infinite Tiled maps are unsupported.`);
  if (!positiveInteger(source.width) || !positiveInteger(source.height)) {
    throw new Error(`Tiled map width and height must be positive integers.`);
  }
  if (!positiveInteger(source.tilewidth) || !positiveInteger(source.tileheight)) {
    throw new Error(`Tiled map tile size must use positive integers.`);
  }
  if (source.tilewidth !== source.tileheight) throw new Error(`Tiled map tile size must be square.`);
}

function requiredLayers(source: TiledMap): RequiredLayers {
  let terrain: TiledLayer | undefined;
  let objects: TiledLayer | undefined;
  let lights: TiledLayer | undefined;
  let sounds: TiledLayer | undefined;
  for (const layer of source.layers) {
    validateLayerCommon(layer);
    switch (layer.name) {
      case "terrain":
        if (layer.type !== "tilelayer") throw new Error(`Layer "terrain" must be a tile layer.`);
        if (terrain !== undefined) throw new Error(`Tiled map has duplicate terrain layers.`);
        terrain = layer;
        break;
      case "objects":
        if (layer.type !== "objectgroup") throw new Error(`Layer "objects" must be an object layer.`);
        if (objects !== undefined) throw new Error(`Tiled map has duplicate objects layers.`);
        objects = layer;
        break;
      case "lights":
        if (layer.type !== "objectgroup") throw new Error(`Layer "lights" must be an object layer.`);
        if (lights !== undefined) throw new Error(`Tiled map has duplicate lights layers.`);
        lights = layer;
        break;
      case "sounds":
        if (layer.type !== "objectgroup") throw new Error(`Layer "sounds" must be an object layer.`);
        if (sounds !== undefined) throw new Error(`Tiled map has duplicate sounds layers.`);
        sounds = layer;
        break;
      default:
        throw new Error(`Unsupported gameplay layer "${layer.name}".`);
    }
  }

  if (terrain === undefined) throw new Error(`Tiled map is missing terrain layer.`);
  if (objects === undefined) throw new Error(`Tiled map is missing objects layer.`);
  return {
    terrain,
    objects,
    ...(lights === undefined ? {} : { lights }),
    ...(sounds === undefined ? {} : { sounds }),
  };
}

function validateLayerCommon(layer: TiledLayer): void {
  if (layer.visible === false) throw new Error(`Layer "${layer.name}" must not be hidden.`);
  if (layer.opacity !== undefined && layer.opacity !== 1) throw new Error(`Layer "${layer.name}" opacity must be 1.`);
  if ((layer.x ?? 0) !== 0 || (layer.y ?? 0) !== 0) throw new Error(`Layer "${layer.name}" offset must be 0,0.`);
  readProperties(layer.properties, NO_PROPERTY_NAMES, `layer "${layer.name}"`);
}

function compileTerrain(
  source: TiledMap,
  layer: TiledLayer,
  registry: TilesetRegistry,
): readonly (readonly number[])[] {
  if (layer.width !== source.width || layer.height !== source.height) {
    throw new Error(`Layer "terrain" dimensions must match the map dimensions.`);
  }
  if (layer.encoding !== undefined || layer.compression !== undefined || layer.chunks !== undefined) {
    throw new Error(`Layer "terrain" must use finite JSON array data.`);
  }
  if (layer.data === undefined) throw new Error(`Layer "terrain" is missing tile data.`);
  if (layer.data.length !== source.width * source.height) {
    throw new Error(`Layer "terrain" data length does not match map dimensions.`);
  }

  const rows: number[][] = [];
  for (let y = 0; y < source.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < source.width; x++) {
      const index = y * source.width + x;
      row.push(terrainIdFromGid(layer.data[index]!, registry, `terrain (${x},${y})`));
    }
    rows.push(row);
  }
  return rows;
}

function terrainIdFromGid(gid: number, registry: TilesetRegistry, context: string): number {
  const decoded = decodeTerrainGid(gid, registry, context);
  const properties = readProperties(decoded.tile?.properties, TERRAIN_PROPERTY_NAMES, context);
  const terrainId = requiredInteger(properties, "terrainId", context);
  if (terrainId < 0) throw new Error(`${context}: Property "terrainId" must be non-negative.`);
  const catalogTile = TERRAIN_CATALOG.find((tile) => tile.id === terrainId);
  if (catalogTile === undefined) throw new Error(`${context}: Unknown terrainId ${terrainId}.`);
  const terrainKind = optionalString(properties, "terrainKind", context);
  if (terrainKind !== undefined && terrainKind !== catalogTile.kind) {
    throw new Error(`${context}: Property "terrainKind" does not match terrainId ${terrainId}.`);
  }
  const flags = terrainFlags(catalogTile);
  const blocking = optionalBoolean(properties, "blocking", context);
  if (blocking !== flagsBlockMovement(flags)) {
    throw new Error(`${context}: Property "blocking" does not match terrainId ${terrainId}.`);
  }
  const blocksSight = optionalBoolean(properties, "blocksSight", context);
  if (blocksSight !== flagsBlockSight(flags)) {
    throw new Error(`${context}: Property "blocksSight" does not match terrainId ${terrainId}.`);
  }
  const blocksAttacks = optionalBoolean(properties, "blocksAttacks", context);
  if (blocksAttacks !== flagsBlockAttack(flags)) {
    throw new Error(`${context}: Property "blocksAttacks" does not match terrainId ${terrainId}.`);
  }

  switch (catalogTile.kind) {
    case "floor":
      requireMatchingTerrainString(properties, "floorTexture", catalogTile.floor_texture, terrainId, context);
      requireMatchingTerrainString(properties, "ceilingTexture", catalogTile.ceiling_texture, terrainId, context);
      break;
    case "wall":
      requireMatchingTerrainString(properties, "wallTexture", catalogTile.wall_texture, terrainId, context);
      break;
    case "barrier":
      requireMatchingTerrainString(properties, "barrierTexture", catalogTile.barrier_texture, terrainId, context);
      requireMatchingTerrainString(properties, "floorTexture", catalogTile.floor_texture, terrainId, context);
      requireMatchingTerrainString(properties, "ceilingTexture", catalogTile.ceiling_texture, terrainId, context);
      break;
    default: {
      const _exhaustive: never = catalogTile;
      return _exhaustive;
    }
  }
  return terrainId;
}

function requireMatchingTerrainString(
  properties: PropertyMap,
  name: string,
  expected: string,
  terrainId: number,
  context: string,
): void {
  if (optionalString(properties, name, context) !== expected) {
    throw new Error(`${context}: Property "${name}" does not match terrainId ${terrainId}.`);
  }
}

function compileEntities(
  source: TiledMap,
  layer: TiledLayer,
  registry: TilesetRegistry,
  options: CompileTiledMapOptions,
): readonly EntityDef[] {
  return (layer.objects ?? []).map((object, index) => compileEntity(source, object, index, registry, options));
}

function compileLights(
  source: TiledMap,
  layer: TiledLayer | undefined,
  registry: TilesetRegistry,
  options: CompileTiledMapOptions,
): readonly LightDef[] {
  if (layer === undefined) return [];
  return (layer.objects ?? []).map((object, index) => compileLight(source, object, index, registry, options));
}

function compileSounds(
  source: TiledMap,
  layer: TiledLayer | undefined,
  registry: TilesetRegistry,
  options: CompileTiledMapOptions,
): readonly SoundDef[] {
  if (layer === undefined) return [];
  return (layer.objects ?? []).map((object, index) => compileSound(source, object, index, registry, options));
}

function compileLight(
  source: TiledMap,
  object: TiledObject,
  index: number,
  registry: TilesetRegistry,
  options: CompileTiledMapOptions,
): LightDef {
  const context = objectContext(object, index);
  const resolved = resolveDedicatedLayerObject(source, object, context, registry, options, "light");
  return compileLightEntity({ x: resolved.x, y: resolved.y }, resolved.properties, context);
}

function compileSound(
  source: TiledMap,
  object: TiledObject,
  index: number,
  registry: TilesetRegistry,
  options: CompileTiledMapOptions,
): SoundDef {
  const context = objectContext(object, index);
  const resolved = resolveDedicatedLayerObject(source, object, context, registry, options, "sound");
  return compileSoundEntity({ x: resolved.x, y: resolved.y }, resolved.properties, context);
}

function compileEntity(
  source: TiledMap,
  object: TiledObject,
  index: number,
  registry: TilesetRegistry,
  options: CompileTiledMapOptions,
): EntityDef {
  const context = objectContext(object, index);
  const resolved = resolveObject(source, object, context, registry, options);
  const prefab = mapEntityPrefab(requiredString(resolved.properties, "prefab", context), context);
  if (prefab === "light") {
    throw new Error(`${context}: Light objects must be authored on the dedicated "lights" layer.`);
  }
  if (prefab === "sound") {
    throw new Error(`${context}: Sound objects must be authored on the dedicated "sounds" layer.`);
  }
  validatePropertyNames(resolved.properties, PREFAB_AUTHORING_PROPERTY_NAMES[prefab], context);
  return parseEntity(entityFromAuthoring(prefab, resolved.x, resolved.y, resolved.properties, context), context);
}

function compileLightEntity(
  position: GridPosition,
  properties: PropertyMap,
  context: string,
): LightDef {
  return parseEntity(entityFromAuthoring("light", position.x, position.y, properties, context), context) as LightDef;
}

function compileSoundEntity(
  position: GridPosition,
  properties: PropertyMap,
  context: string,
): SoundDef {
  return parseEntity(entityFromAuthoring("sound", position.x, position.y, properties, context), context) as SoundDef;
}

function parseEntity(entity: Record<string, unknown>, context: string): EntityDef {
  const parsed = ENTITY_SCHEMA.safeParse(entity);
  if (parsed.success) return parsed.data;

  const issue = parsed.error.issues[0];
  const path = issue?.path.join(".") ?? "<root>";
  const message = issue?.message ?? "Invalid entity.";
  throw new Error(`${context}: ${path}: ${message}`);
}

function resolveObject(
  source: TiledMap,
  object: TiledObject,
  context: string,
  registry: TilesetRegistry,
  options: CompileTiledMapOptions,
): ResolvedObject {
  const template = resolveTemplate(object, context, options);
  const resolvedObject = resolvedObjectSource(object, template?.object);
  validateObjectAuthoringState(resolvedObject, context);
  if (template !== undefined) validateObjectAuthoringState(template.object, `${context} template`);

  const markerRegistry = object.gid === undefined && template !== undefined ? template.registry : registry;
  const markerProperties = propertiesFromMarker(resolvedObject, markerRegistry, context);
  const templateProperties = propertiesFromObjectSource(template?.object, context);
  const objectProperties = propertiesFromObjectSource(object, context);
  const properties = mergeProperties(
    usableMarkerProperties(markerProperties, templateProperties, objectProperties, context),
    templateProperties,
    objectProperties,
  );
  const position = objectGridPosition(resolvedObject, source.tilewidth, source.tileheight, context);

  return { ...position, properties };
}

function usableMarkerProperties(
  markerProperties: PropertyMap,
  templateProperties: PropertyMap,
  objectProperties: PropertyMap,
  context: string,
): PropertyMap {
  const markerPrefab = optionalString(markerProperties, "prefab", context);
  if (markerPrefab === undefined) return markerProperties;

  const overridePrefab = optionalString(objectProperties, "prefab", context) ??
    optionalString(templateProperties, "prefab", context);
  if (overridePrefab === undefined) return markerProperties;
  if (mapEntityPrefab(overridePrefab, context) === mapEntityPrefab(markerPrefab, context)) {
    return markerProperties;
  }
  // Object/template overrode the marker's prefab (e.g. decoration authored on a key tile).
  // Drop marker defaults so they cannot leak onto the final prefab.
  return new Map();
}

function resolveDedicatedLayerObject(
  source: TiledMap,
  object: TiledObject,
  context: string,
  registry: TilesetRegistry,
  options: CompileTiledMapOptions,
  prefab: "light" | "sound",
): ResolvedObject {
  const resolved = resolveObject(source, object, context, registry, options);
  const authoredPrefab = optionalString(resolved.properties, "prefab", context);
  if (authoredPrefab !== undefined && mapEntityPrefab(authoredPrefab, context) !== prefab) {
    throw new Error(`${context}: ${prefab} layer objects must use the "${prefab}" prefab.`);
  }

  const properties = new Map(resolved.properties);
  properties.delete("prefab");
  validatePropertyNames(
    properties,
    prefab === "light" ? LIGHT_PROPERTY_NAMES : SOUND_PROPERTY_NAMES,
    context,
  );
  return { x: resolved.x, y: resolved.y, properties };
}

function resolveTemplate(
  object: TiledObject,
  context: string,
  options: CompileTiledMapOptions,
): ResolvedTemplate | undefined {
  if (object.template === undefined) return undefined;

  const path = resolveTemplatePath(options.sourcePath, object.template);
  const template = options.templates?.[path];
  if (template === undefined) throw new Error(`${context}: Missing object template "${path}".`);
  if (template.type !== "template") throw new Error(`${context}: Template "${path}" must have type "template".`);

  return {
    object: template.object,
    registry: createTilesetRegistry(template.tileset === undefined ? undefined : [template.tileset], options.tilesets),
  };
}

function resolvedObjectSource(object: TiledObject, template: TiledObject | undefined): TiledObject {
  if (template === undefined) return object;
  return {
    ...template,
    ...object,
    x: object.x,
    y: object.y,
  };
}

function propertiesFromObjectSource(object: TiledObject | undefined, context: string): Map<string, unknown> {
  if (object === undefined) return new Map();
  const properties = readProperties(object.properties, ENTITY_AUTHORING_PROPERTY_NAMES, context);
  if (object.type !== undefined && object.type.length > 0 && !properties.has("prefab")) {
    properties.set("prefab", object.type);
  }
  return properties;
}

function propertiesFromMarker(
  object: TiledObject,
  registry: TilesetRegistry,
  context: string,
): Map<string, unknown> {
  if (object.gid === undefined) return new Map();
  const marker = decodeObjectGid(object.gid, registry, `${context} marker`);
  const properties = readProperties(marker.tile?.properties, ENTITY_AUTHORING_PROPERTY_NAMES, `${context} marker`);
  if (marker.tile?.type !== undefined && marker.tile.type.length > 0 && !properties.has("prefab")) {
    properties.set("prefab", marker.tile.type);
  }
  return properties;
}

function objectGridPosition(
  object: TiledObject,
  tileWidth: number,
  tileHeight: number,
  context: string,
): GridPosition {
  const x = finiteNumber(object.x, "x", context);
  const y = finiteNumber(object.y, "y", context);
  const width = object.width === undefined ? tileWidth : finiteNumber(object.width, "width", context);
  const height = object.height === undefined ? tileHeight : finiteNumber(object.height, "height", context);

  if (!aligned(width, tileWidth) || !aligned(height, tileHeight)) {
    throw new Error(`${context}: object dimensions must be cell-aligned.`);
  }
  if (width !== tileWidth || height !== tileHeight) {
    throw new Error(`${context}: object dimensions must be exactly one cell.`);
  }

  const gridTopY = object.gid === undefined ? y : y - height;
  if (!aligned(x, tileWidth) || !aligned(gridTopY, tileHeight)) {
    throw new Error(`${context}: object position must be cell-aligned.`);
  }

  return {
    x: x / tileWidth,
    y: gridTopY / tileHeight,
  };
}

function validateObjectAuthoringState(object: TiledObject, context: string): void {
  if (object.visible === false) throw new Error(`${context}: hidden objects are unsupported.`);
  if (object.rotation !== undefined && object.rotation !== 0) {
    throw new Error(`${context}: object rotation is unsupported.`);
  }
  if (object.point === true) throw new Error(`${context}: point objects are unsupported.`);
  if (object.ellipse === true) throw new Error(`${context}: ellipse objects are unsupported.`);
  if (object.polygon !== undefined) throw new Error(`${context}: polygon objects are unsupported.`);
  if (object.polyline !== undefined) throw new Error(`${context}: polyline objects are unsupported.`);
  if (object.text !== undefined) throw new Error(`${context}: text objects are unsupported.`);
}

function authoredFieldNames(prefab: EntityPrefab): ReadonlySet<string> {
  const names = new Set(PREFAB_AUTHORING_PROPERTY_NAMES[prefab]);
  names.delete("prefab");
  return names;
}

function objectContext(object: TiledObject, index: number): string {
  return object.id === undefined ? `object #${index + 1}` : `object ${object.id}`;
}

function finiteNumber(value: unknown, name: string, context: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${context}: object ${name} must be a finite number.`);
  }
  return value;
}

function aligned(value: number, cellSize: number): boolean {
  return Number.isInteger(value / cellSize);
}

function positiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function resolveTemplatePath(sourcePath: string | undefined, templatePath: string): string {
  if (templatePath.startsWith("/")) return normalizePath(templatePath.slice(1));
  if (sourcePath === undefined) return normalizePath(templatePath);
  const slash = sourcePath.lastIndexOf("/");
  const directory = slash === -1 ? "" : sourcePath.slice(0, slash);
  return normalizePath(directory.length === 0 ? templatePath : `${directory}/${templatePath}`);
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part.length === 0 || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}
