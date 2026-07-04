import type { AttackDef } from "@/src/game/attack.ts";
import { ENTITY_SCHEMA } from "@/src/map/entity_content.ts";
import { createGameMap } from "@/src/map/map.ts";
import type { EntityDef, GameMap, LightDef } from "@/src/map/map.ts";
import { TERRAIN_CATALOG } from "@/src/map/terrain_palettes.ts";
import { createTilesetRegistry, decodeObjectGid, decodeTerrainGid } from "@/src/map/authoring/gid.ts";
import type { TilesetRegistry, TilesetSources } from "@/src/map/authoring/gid.ts";
import {
  mergeProperties,
  optionalBoolean,
  optionalInteger,
  optionalNumber,
  optionalString,
  readProperties,
  requiredInteger,
  requiredString,
  validatePropertyNames,
} from "@/src/map/authoring/properties.ts";
import type { PropertyMap } from "@/src/map/authoring/properties.ts";
import type { TiledLayer, TiledMap, TiledObject, TiledTemplate } from "@/src/map/authoring/tiled_types.ts";
import {
  ENTITY_AUTHORING_PROPERTY_NAMES,
  mapEntityPrefab,
  PREFAB_AUTHORING_PROPERTY_NAMES,
} from "@/src/map/entity_content.ts";
import {
  mapAttackFacingRequirement,
  mapAttackPattern,
  mapAttackTargets,
  mapDecorationKind,
  mapDialogueTreeId,
  mapDirection,
  mapDisplayName,
  mapDoorSlide,
  mapEnemyArchetype,
  mapExamineTextId,
  mapItemKind,
  mapKeyColor,
  mapStoryEventId,
  mapStoryTargetId,
} from "@/src/map/authoring/mappings.ts";

export type CompileTiledMapOptions = {
  readonly sourcePath?: string;
  readonly templates?: Readonly<Record<string, TiledTemplate>>;
  readonly tilesets?: TilesetSources;
};

export type CompiledTiledMap = {
  readonly gameMap: GameMap;
  readonly paletteKey: string;
  readonly campaignOrder: number;
};

type RequiredLayers = {
  readonly terrain: TiledLayer;
  readonly objects: TiledLayer;
  readonly lights?: TiledLayer;
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
const MAP_PROPERTY_NAMES: ReadonlySet<string> = new Set(["name", "palette", "campaignOrder"]);
const LIGHT_PROPERTY_NAMES: ReadonlySet<string> = new Set(["color", "radius", "flickerAmount", "flickerSpeed"]);
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
  const paletteKey = requiredString(mapProperties, "palette", "map");
  const campaignOrder = requiredInteger(mapProperties, "campaignOrder", "map");

  const layers = requiredLayers(source);
  const registry = createTilesetRegistry(source.tilesets, options.tilesets);
  const terrain = compileTerrain(source, layers.terrain, registry);
  const entities = [
    ...compileEntities(source, layers.objects, registry, options),
    ...compileLights(source, layers.lights),
  ];

  return {
    gameMap: createGameMap(name, terrain, entities, { palette: TERRAIN_CATALOG }),
    paletteKey,
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
      default:
        throw new Error(`Unsupported gameplay layer "${layer.name}".`);
    }
  }

  if (terrain === undefined) throw new Error(`Tiled map is missing terrain layer.`);
  if (objects === undefined) throw new Error(`Tiled map is missing objects layer.`);
  return lights === undefined ? { terrain, objects } : { terrain, objects, lights };
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
  const blocking = optionalBoolean(properties, "blocking", context);
  if ((blocking ?? false) !== (catalogTile.kind !== "floor")) {
    throw new Error(`${context}: Property "blocking" does not match terrainId ${terrainId}.`);
  }
  const blocksSight = optionalBoolean(properties, "blocksSight", context);
  if (blocksSight !== undefined && blocksSight !== (catalogTile.kind === "wall")) {
    throw new Error(`${context}: Property "blocksSight" does not match terrainId ${terrainId}.`);
  }
  const blocksAttacks = optionalBoolean(properties, "blocksAttacks", context);
  if (blocksAttacks !== undefined && blocksAttacks !== (catalogTile.kind !== "floor")) {
    throw new Error(`${context}: Property "blocksAttacks" does not match terrainId ${terrainId}.`);
  }
  const barrierTexture = optionalString(properties, "barrierTexture", context);
  if (
    barrierTexture !== undefined &&
    (catalogTile.kind !== "barrier" || barrierTexture !== catalogTile.barrier_texture)
  ) {
    throw new Error(`${context}: Property "barrierTexture" does not match terrainId ${terrainId}.`);
  }
  return terrainId;
}

function compileEntities(
  source: TiledMap,
  layer: TiledLayer,
  registry: TilesetRegistry,
  options: CompileTiledMapOptions,
): readonly EntityDef[] {
  return (layer.objects ?? []).map((object, index) => compileEntity(source, object, index, registry, options));
}

function compileLights(source: TiledMap, layer: TiledLayer | undefined): readonly LightDef[] {
  if (layer === undefined) return [];
  return (layer.objects ?? []).map((object, index) => compileLight(source, object, index));
}

function compileLight(source: TiledMap, object: TiledObject, index: number): LightDef {
  const context = objectContext(object, index);
  validateObjectAuthoringState(object, context);
  const properties = readProperties(object.properties, LIGHT_PROPERTY_NAMES, context);
  const position = objectGridPosition(object, source.tilewidth, source.tileheight, context);
  return compileLightEntity(position, properties, context);
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
  validatePropertyNames(resolved.properties, PREFAB_AUTHORING_PROPERTY_NAMES[prefab], context);

  let entity: EntityDef;
  switch (prefab) {
    case "player":
      entity = {
        prefab: "player",
        x: resolved.x,
        y: resolved.y,
        dir: requiredDirection(resolved.properties, context),
      };
      break;
    case "npc":
      entity = {
        prefab: "npc",
        x: resolved.x,
        y: resolved.y,
        dir: requiredDirection(resolved.properties, context),
        displayName: requiredDisplayName(resolved.properties, context),
        ...optionalDialogueTreeId(resolved.properties, context),
        ...optionalExamineTextId(resolved.properties, context),
        ...optionalStoryTargetId(resolved.properties, context),
        ...optionalOnTalkEvent(resolved.properties, context),
      };
      break;
    case "enemy":
      entity = compileEnemy(resolved, context);
      break;
    case "door":
      entity = compileDoor(resolved, context);
      break;
    case "key":
      entity = {
        prefab: "key",
        x: resolved.x,
        y: resolved.y,
        color: requiredKeyColor(resolved.properties, context),
      };
      break;
    case "uplinkCode":
      entity = { prefab: "uplinkCode", x: resolved.x, y: resolved.y };
      break;
    case "uplinkTerminal":
      entity = {
        prefab: "uplinkTerminal",
        x: resolved.x,
        y: resolved.y,
        goto: requiredString(resolved.properties, "goto", context),
        ...optionalExamineTextId(resolved.properties, context),
      };
      break;
    case "weaponPickup":
      entity = {
        prefab: "weaponPickup",
        x: resolved.x,
        y: resolved.y,
        slot: requiredWeaponSlot(resolved.properties, context),
      };
      break;
    case "item":
      entity = {
        prefab: "item",
        x: resolved.x,
        y: resolved.y,
        item: requiredItemKind(resolved.properties, context),
        amount: requiredInteger(resolved.properties, "amount", context),
      };
      break;
    case "decoration":
      entity = {
        prefab: "decoration",
        x: resolved.x,
        y: resolved.y,
        decoration: requiredDecorationKind(resolved.properties, context),
      };
      break;
    case "light":
      entity = compileLightEntity(resolved, resolved.properties, context);
      break;
  }
  return parseEntity(entity, context);
}

function compileLightEntity(
  position: GridPosition,
  properties: PropertyMap,
  context: string,
): LightDef {
  const radius = requiredInteger(properties, "radius", context);
  if (radius <= 0) throw new Error(`${context}: Property "radius" must be positive.`);

  return parseEntity({
    prefab: "light",
    ...position,
    color: requiredLightColor(properties, context),
    radius,
    ...optionalLightNumberField(properties, "flickerAmount", context),
    ...optionalLightNumberField(properties, "flickerSpeed", context),
  }, context) as LightDef;
}

function parseEntity(entity: EntityDef, context: string): EntityDef {
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
  const properties = mergeProperties(markerProperties, templateProperties, objectProperties);
  const position = objectGridPosition(resolvedObject, source.tilewidth, source.tileheight, context);

  return { ...position, properties };
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

function compileEnemy(resolved: ResolvedObject, context: string): EntityDef {
  return {
    prefab: "enemy",
    x: resolved.x,
    y: resolved.y,
    dir: requiredDirection(resolved.properties, context),
    ...optionalDisplayName(resolved.properties, context),
    ...optionalEnemyArchetype(resolved.properties, context),
    ...optionalNumberField(resolved.properties, "health", context),
    ...optionalNumberField(resolved.properties, "hitDc", context),
    ...optionalNumberField(resolved.properties, "damage", context),
    ...optionalAttack(resolved.properties, context),
    ...optionalExamineTextId(resolved.properties, context),
  };
}

function compileDoor(resolved: ResolvedObject, context: string): EntityDef {
  const locked = optionalBoolean(resolved.properties, "locked", context);
  const color = optionalKeyColor(resolved.properties, context);
  if (locked === true && color === undefined) throw new Error(`${context}: Locked door is missing key color.`);
  return {
    prefab: "door",
    x: resolved.x,
    y: resolved.y,
    ...optionalBooleanField(resolved.properties, "locked", context),
    ...(color === undefined ? {} : { color }),
    ...optionalDoorSlide(resolved.properties, context),
    ...optionalNumberField(resolved.properties, "openMs", context),
    ...optionalBooleanField(resolved.properties, "secret", context),
    ...optionalExamineTextId(resolved.properties, context),
  };
}

function requiredDirection(properties: PropertyMap, context: string): number {
  const value = optionalString(properties, "dir", context) ?? optionalString(properties, "facing", context);
  if (value === undefined) throw new Error(`${context}: Missing required property "dir" or "facing".`);
  return mapDirection(value, `${context} property "dir"`);
}

function requiredDisplayName(properties: PropertyMap, context: string): ReturnType<typeof mapDisplayName> {
  return mapDisplayName(requiredString(properties, "displayName", context), `${context} property "displayName"`);
}

function optionalDisplayName(
  properties: PropertyMap,
  context: string,
): { readonly displayName?: ReturnType<typeof mapDisplayName> } {
  const value = optionalString(properties, "displayName", context);
  return value === undefined ? {} : { displayName: mapDisplayName(value, `${context} property "displayName"`) };
}

function requiredKeyColor(properties: PropertyMap, context: string): ReturnType<typeof mapKeyColor> {
  return mapKeyColor(requiredString(properties, "color", context), `${context} property "color"`);
}

function optionalKeyColor(properties: PropertyMap, context: string): ReturnType<typeof mapKeyColor> | undefined {
  const value = optionalString(properties, "color", context);
  return value === undefined ? undefined : mapKeyColor(value, `${context} property "color"`);
}

function requiredItemKind(properties: PropertyMap, context: string): ReturnType<typeof mapItemKind> {
  return mapItemKind(requiredString(properties, "item", context), `${context} property "item"`);
}

function requiredDecorationKind(properties: PropertyMap, context: string): ReturnType<typeof mapDecorationKind> {
  return mapDecorationKind(requiredString(properties, "decoration", context), `${context} property "decoration"`);
}

function requiredWeaponSlot(properties: PropertyMap, context: string): 2 | 3 {
  const slot = requiredInteger(properties, "slot", context);
  if (slot !== 2 && slot !== 3) throw new Error(`${context}: Property "slot" must be 2 or 3.`);
  return slot;
}

function optionalDialogueTreeId(
  properties: PropertyMap,
  context: string,
): { readonly dialogueTreeId?: ReturnType<typeof mapDialogueTreeId> } {
  const value = optionalString(properties, "dialogueTreeId", context);
  return value === undefined ?
    {} :
    { dialogueTreeId: mapDialogueTreeId(value, `${context} property "dialogueTreeId"`) };
}

function optionalStoryTargetId(
  properties: PropertyMap,
  context: string,
): { readonly storyId?: ReturnType<typeof mapStoryTargetId> } {
  const value = optionalString(properties, "storyId", context);
  return value === undefined ? {} : { storyId: mapStoryTargetId(value, `${context} property "storyId"`) };
}

function optionalOnTalkEvent(
  properties: PropertyMap,
  context: string,
): { readonly onTalkEvent?: ReturnType<typeof mapStoryEventId> } {
  const value = optionalString(properties, "onTalkEvent", context);
  return value === undefined ? {} : { onTalkEvent: mapStoryEventId(value, `${context} property "onTalkEvent"`) };
}

function optionalExamineTextId(
  properties: PropertyMap,
  context: string,
): { readonly examineTextId?: ReturnType<typeof mapExamineTextId> } {
  const value = optionalString(properties, "examineTextId", context);
  return value === undefined ? {} : { examineTextId: mapExamineTextId(value, `${context} property "examineTextId"`) };
}

function optionalEnemyArchetype(
  properties: PropertyMap,
  context: string,
): { readonly archetype?: ReturnType<typeof mapEnemyArchetype> } {
  const value = optionalString(properties, "archetype", context);
  return value === undefined ? {} : { archetype: mapEnemyArchetype(value, `${context} property "archetype"`) };
}

function optionalDoorSlide(
  properties: PropertyMap,
  context: string,
): { readonly slide?: ReturnType<typeof mapDoorSlide> } {
  const value = optionalString(properties, "slide", context);
  return value === undefined ? {} : { slide: mapDoorSlide(value, `${context} property "slide"`) };
}

function optionalNumberField(properties: PropertyMap, name: string, context: string): Record<string, number> {
  const value = optionalInteger(properties, name, context);
  return value === undefined ? {} : { [name]: value };
}

function requiredLightColor(properties: PropertyMap, context: string): `#${string}` {
  const value = requiredString(properties, "color", context);
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`${context}: Property "color" must be a #rrggbb hex color.`);
  }
  return value.toLowerCase() as `#${string}`;
}

function optionalLightNumberField(properties: PropertyMap, name: string, context: string): Record<string, number> {
  const value = optionalNumber(properties, name, context);
  if (value === undefined) return {};
  if (name === "flickerAmount" && (value < 0 || value > 1)) {
    throw new Error(`${context}: Property "flickerAmount" must be between 0 and 1.`);
  }
  if (name === "flickerSpeed" && value <= 0) {
    throw new Error(`${context}: Property "flickerSpeed" must be positive.`);
  }
  return { [name]: value };
}

function optionalBooleanField(properties: PropertyMap, name: string, context: string): Record<string, boolean> {
  const value = optionalBoolean(properties, name, context);
  return value === undefined ? {} : { [name]: value };
}

function optionalAttack(
  properties: PropertyMap,
  context: string,
): { readonly attack?: Partial<AttackDef> } {
  const attack: Partial<AttackDef> = {};
  addAttackInteger(attack, properties, "attackMinDamage", "minDamage", context);
  addAttackInteger(attack, properties, "attackMaxDamage", "maxDamage", context);
  addAttackInteger(attack, properties, "attackRange", "range", context);
  addAttackInteger(attack, properties, "attackBonus", "attackBonus", context);
  addAttackInteger(attack, properties, "attackCritThreshold", "critThreshold", context);
  addAttackInteger(attack, properties, "attackCritMultiplier", "critMultiplier", context);

  const requiresFacing = optionalString(properties, "attackRequiresFacing", context);
  if (requiresFacing !== undefined) {
    attack.requiresFacing = mapAttackFacingRequirement(
      requiresFacing,
      `${context} property "attackRequiresFacing"`,
    );
  }

  const pattern = optionalString(properties, "attackPattern", context);
  if (pattern !== undefined) attack.pattern = mapAttackPattern(pattern, `${context} property "attackPattern"`);

  const targets = optionalString(properties, "attackTargets", context);
  if (targets !== undefined) attack.targets = mapAttackTargets(targets, `${context} property "attackTargets"`);

  return Object.keys(attack).length === 0 ? {} : { attack };
}

function addAttackInteger<K extends keyof AttackDef>(
  attack: Partial<AttackDef>,
  properties: PropertyMap,
  propertyName: string,
  attackName: K,
  context: string,
): void {
  const value = optionalInteger(properties, propertyName, context);
  if (value !== undefined) {
    attack[attackName] = value as AttackDef[K];
  }
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
