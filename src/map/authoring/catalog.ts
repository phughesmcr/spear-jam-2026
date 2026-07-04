import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import { ENEMY_ARCHETYPE_CODES, enemyCatalogEntry } from "@/src/ecs/enemy_catalog.ts";
import { AttackPattern } from "@/src/game/attack.ts";
import { ExamineTextId } from "@/src/game/examine.ts";
import { ItemKind } from "@/src/game/items.ts";
import { DisplayName } from "@/src/game/names.ts";
import { KeyColor, TexturePack, VICTORY_GOTO } from "@/src/map/map.ts";
import {
  PALETTE_KEYS,
  TERRAIN_CATALOG_TILE_COLUMNS,
  TERRAIN_CATALOG_TILE_COUNT,
  TEXTURE_TERRAIN_COUNT,
} from "@/src/map/terrain_palettes.ts";
import type { EntityPrefab } from "@/src/map/map.ts";
import type { TiledObject, TiledProperty, TiledTilesetReference } from "@/src/map/authoring/tiled_types.ts";

export const MAPS_DIR = "game_assets/maps";
export const TEMPLATE_DIR = `${MAPS_DIR}/templates`;
export const AUTOMAP_DIR = `${MAPS_DIR}/automap`;
export const AUTOMAP_RULES_FILE = `${AUTOMAP_DIR}/rules.txt`;
export const TILED_PROJECT_AUTOMAP_RULES_FILE = "automap/rules.txt";
export const TERRAIN_TILESETS_DIR = `${MAPS_DIR}/terrain`;
export const COMPILED_MAPS_PATH = "src/map/compiled_maps.json";
export const TILED_PROJECT_PATH = `${MAPS_DIR}/game.tiled-project`;
export const ENTITY_MARKERS_TILESET = "entity_markers.tsj";
export const ENTITY_MARKERS_IMAGE = "entity_markers.png";
export const AUTHORING_TILE_SIZE = 16;
export const TERRAIN_ATLAS_TILE_COLUMNS = TERRAIN_CATALOG_TILE_COLUMNS;
export const TERRAIN_ATLAS_TILE_COUNT = TERRAIN_CATALOG_TILE_COUNT;
export const FLOOR_TILESET = "floors.tsj";
export const FLOOR_TILESET_IMAGE = "floors.png";
export const WALL_TILESET = "walls.tsj";
export const WALL_TILESET_IMAGE = "walls.png";
export const FLOOR_TILESET_FIRST_GID = 1;
export const WALL_TILESET_FIRST_GID = FLOOR_TILESET_FIRST_GID + TEXTURE_TERRAIN_COUNT;
export const TERRAIN_TILESET_FIRST_GID = FLOOR_TILESET_FIRST_GID;
export const ENTITY_MARKERS_FIRST_GID = TERRAIN_ATLAS_TILE_COUNT + 1;
export const TERRAIN_PASSABLE_TILE_ID = 0;
export const TERRAIN_BLOCKING_TILE_ID = WALL_TILESET_FIRST_GID - 1;
export const TEXTURE_PACK_TILE_SIZE = 128;
export const TEXTURE_PACK_COLUMNS = 5;
export const TEXTURE_PACK_ROWS = 4;
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export type TexturePackDefinition = {
  readonly pack: TexturePack;
  readonly label: string;
  readonly image: string;
};

export const TEXTURE_PACK_DEFINITIONS: readonly TexturePackDefinition[] = [
  texturePackDefinition(TexturePack.Pack1, "Pack 1", "pack1.png"),
  texturePackDefinition(TexturePack.Pack2, "Pack 2", "pack2.png"),
  texturePackDefinition(TexturePack.Pack3, "Pack 3", "pack3.png"),
];

export const TEXTURE_REFS: readonly string[] = TEXTURE_PACK_DEFINITIONS.flatMap((definition) =>
  Array.from(
    { length: TEXTURE_PACK_COLUMNS * TEXTURE_PACK_ROWS },
    (_value, tileId) =>
      textureRef(definition.pack, tileId % TEXTURE_PACK_COLUMNS, Math.floor(tileId / TEXTURE_PACK_COLUMNS)),
  )
);

export const ENTITY_MARKER_TYPES = [
  "player",
  "npc",
  "enemy",
  "door",
  "key",
  "uplinkCode",
  "uplinkTerminal",
  "weaponPickup",
  "item",
] as const satisfies readonly EntityPrefab[];

export type EntityMarkerType = (typeof ENTITY_MARKER_TYPES)[number];

export type TiledProjectCommand = {
  readonly command: string;
  readonly executable: string;
  readonly arguments: string;
  readonly workingDirectory: string;
  readonly shortcut: string;
  readonly showOutput: boolean;
  readonly saveBeforeExecute: boolean;
  readonly enabled: boolean;
};

export type TiledPropertyType =
  | TiledEnumPropertyType
  | TiledClassPropertyType;

export type TiledEnumPropertyType = {
  readonly id: number;
  readonly name: string;
  readonly storageType: "string";
  readonly type: "enum";
  readonly values: readonly string[];
  readonly valuesAsFlags: false;
};

export type TiledClassPropertyType = {
  readonly color: string;
  readonly drawFill: boolean;
  readonly id: number;
  readonly members: readonly TiledClassMember[];
  readonly name: string;
  readonly type: "class";
  readonly useAs: readonly string[];
};

export type TiledClassMember = {
  readonly name: string;
  readonly propertyType?: string;
  readonly type: "bool" | "int" | "string";
  readonly value: boolean | number | string;
};

export type TemplateDefinition = {
  readonly path: string;
  readonly marker: EntityMarkerType;
  readonly objectType: EntityPrefab;
  readonly name: string;
  readonly properties: readonly TiledProperty[];
};

export type TemplateFile = {
  readonly type: "template";
  readonly tileset: TiledTilesetReference;
  readonly object: TiledObject;
};

const TEMPLATE_MARKER_FIRST_GID = 1;

export const PROPERTY_TYPES: readonly TiledPropertyType[] = [
  enumPropertyType(1, "TerrainPalette", PALETTE_KEYS),
  enumPropertyType(2, "Prefab", ENTITY_MARKER_TYPES),
  enumPropertyType(3, "Facing", ["north", "east", "south", "west"]),
  enumPropertyType(4, "KeyColor", Object.values(KeyColor)),
  enumPropertyType(5, "DoorSlide", ["north", "east", "south", "west", "up", "down"]),
  enumPropertyType(6, "DisplayName", authoringKeys(DisplayName)),
  enumPropertyType(7, "DialogueTreeId", authoringKeys(DialogueTreeId)),
  enumPropertyType(8, "ExamineTextId", authoringKeys(ExamineTextId)),
  enumPropertyType(9, "ItemKind", authoringKeys(ItemKind)),
  enumPropertyType(
    10,
    "EnemyArchetype",
    ENEMY_ARCHETYPE_CODES.map((archetype) => enemyCatalogEntry(archetype).authoringKey),
  ),
  enumPropertyType(11, "AttackPattern", authoringKeys(AttackPattern)),
  enumPropertyType(12, "AttackTargets", ["first", "all"]),
  enumPropertyType(13, "AttackRequiresFacing", ["required", "none"]),
  enumPropertyType(14, "TextureRef", TEXTURE_REFS),
  classPropertyType(20, "map_metadata", "#ff0ea5e9", true, ["map"], [
    classMember("name", "string", "Boot Sector"),
    classMember("palette", "string", "boot_sector", "TerrainPalette"),
    classMember("campaignOrder", "int", 1),
  ]),
  classPropertyType(21, "terrain_layer", "#ff334155", true, ["layer"], []),
  classPropertyType(22, "object_layer", "#ffa855f7", false, ["layer"], []),
  classPropertyType(30, "player", "#ff22d3ee", false, ["object"], [
    classMember("prefab", "string", "player", "Prefab"),
    classMember("facing", "string", "north", "Facing"),
  ]),
  classPropertyType(31, "npc", "#fffb7185", false, ["object"], [
    classMember("prefab", "string", "npc", "Prefab"),
    classMember("facing", "string", "north", "Facing"),
    classMember("displayName", "string", "john", "DisplayName"),
    classMember("dialogueTreeId", "string", "none", "DialogueTreeId"),
  ]),
  classPropertyType(32, "enemy", "#fff59e0b", false, ["object"], [
    classMember("prefab", "string", "enemy", "Prefab"),
    classMember("facing", "string", "north", "Facing"),
    classMember("archetype", "string", "meleeDog", "EnemyArchetype"),
  ]),
  classPropertyType(33, "door", "#ff92400e", false, ["object"], [
    classMember("prefab", "string", "door", "Prefab"),
    classMember("locked", "bool", false),
    classMember("slide", "string", "up", "DoorSlide"),
  ]),
  classPropertyType(34, "key", "#fffacc15", false, ["object"], [
    classMember("prefab", "string", "key", "Prefab"),
    classMember("color", "string", "red", "KeyColor"),
  ]),
  classPropertyType(35, "uplinkCode", "#ffa855f7", false, ["object"], [
    classMember("prefab", "string", "uplinkCode", "Prefab"),
  ]),
  classPropertyType(36, "uplinkTerminal", "#ff22c55e", false, ["object"], [
    classMember("prefab", "string", "uplinkTerminal", "Prefab"),
    classMember("goto", "string", VICTORY_GOTO),
  ]),
  classPropertyType(37, "weaponPickup", "#ff3b82f6", false, ["object"], [
    classMember("prefab", "string", "weaponPickup", "Prefab"),
    classMember("slot", "int", 2),
  ]),
  classPropertyType(38, "item", "#ff38bdf8", false, ["object"], [
    classMember("prefab", "string", "item", "Prefab"),
    classMember("item", "string", "healthPatch", "ItemKind"),
    classMember("amount", "int", 1),
  ]),
];

export const TILED_PROJECT_COMMANDS: readonly TiledProjectCommand[] = [
  tiledCommand("Validate maps", "task maps:check"),
  tiledCommand("Compile maps", "task maps:compile"),
  tiledCommand("Sync authoring assets", "task maps:sync-authoring"),
  tiledCommand("Play current map", 'task maps:play -- "%mapfile"'),
  tiledCommand("Start game dev server", "task dev"),
];

export const TEMPLATE_DEFINITIONS: readonly TemplateDefinition[] = [
  templateDefinition("player.tx", "player", "player", "Player", [
    property("prefab", "player", "Prefab"),
    property("facing", "north", "Facing"),
  ]),
  templateDefinition("npc_john.tx", "npc", "npc", "John", [
    property("prefab", "npc", "Prefab"),
    property("facing", "north", "Facing"),
    property("displayName", "john", "DisplayName"),
    property("dialogueTreeId", "johnIntro", "DialogueTreeId"),
  ]),
  ...ENEMY_ARCHETYPE_CODES.map((archetype) => {
    const entry = enemyCatalogEntry(archetype);
    return templateDefinition(`enemy_${snakeCase(entry.authoringKey)}.tx`, "enemy", "enemy", entry.authoringKey, [
      property("prefab", "enemy", "Prefab"),
      property("facing", "north", "Facing"),
      property("archetype", entry.authoringKey, "EnemyArchetype"),
    ]);
  }),
  templateDefinition("door.tx", "door", "door", "Door", [
    property("prefab", "door", "Prefab"),
    property("slide", "up", "DoorSlide"),
  ]),
  ...Object.values(KeyColor).map((color) =>
    templateDefinition(`door_${color}_locked.tx`, "door", "door", `${color} locked door`, [
      property("prefab", "door", "Prefab"),
      property("locked", true),
      property("color", color, "KeyColor"),
      property("slide", "up", "DoorSlide"),
    ])
  ),
  ...Object.values(KeyColor).map((color) =>
    templateDefinition(`key_${color}.tx`, "key", "key", `${color} key`, [
      property("prefab", "key", "Prefab"),
      property("color", color, "KeyColor"),
    ])
  ),
  templateDefinition("uplink_code.tx", "uplinkCode", "uplinkCode", "Uplink code", [
    property("prefab", "uplinkCode", "Prefab"),
  ]),
  templateDefinition("uplink_terminal_victory.tx", "uplinkTerminal", "uplinkTerminal", "Victory terminal", [
    property("prefab", "uplinkTerminal", "Prefab"),
    property("goto", VICTORY_GOTO),
  ]),
  templateDefinition("weapon_slot_2.tx", "weaponPickup", "weaponPickup", "Weapon slot 2", [
    property("prefab", "weaponPickup", "Prefab"),
    property("slot", 2),
  ]),
  templateDefinition("weapon_slot_3.tx", "weaponPickup", "weaponPickup", "Weapon slot 3", [
    property("prefab", "weaponPickup", "Prefab"),
    property("slot", 3),
  ]),
  templateDefinition("item_health_patch.tx", "item", "item", "Health patch", [
    property("prefab", "item", "Prefab"),
    property("item", "healthPatch", "ItemKind"),
    property("amount", 1),
  ]),
  templateDefinition("item_pistol_ammo.tx", "item", "item", "Pistol ammo", [
    property("prefab", "item", "Prefab"),
    property("item", "pistolAmmo", "ItemKind"),
    property("amount", 6),
  ]),
  templateDefinition("item_cannon_ammo.tx", "item", "item", "Cannon ammo", [
    property("prefab", "item", "Prefab"),
    property("item", "cannonAmmo", "ItemKind"),
    property("amount", 3),
  ]),
];

export function floorTilesetPath(): string {
  return `${TERRAIN_TILESETS_DIR}/${FLOOR_TILESET}`;
}

export function floorTilesetImagePath(): string {
  return `${TERRAIN_TILESETS_DIR}/${FLOOR_TILESET_IMAGE}`;
}

export function wallTilesetPath(): string {
  return `${TERRAIN_TILESETS_DIR}/${WALL_TILESET}`;
}

export function wallTilesetImagePath(): string {
  return `${TERRAIN_TILESETS_DIR}/${WALL_TILESET_IMAGE}`;
}

export function floorTilesetReference(): TiledTilesetReference {
  return {
    firstgid: FLOOR_TILESET_FIRST_GID,
    source: `terrain/${FLOOR_TILESET}`,
  };
}

export function wallTilesetReference(): TiledTilesetReference {
  return {
    firstgid: WALL_TILESET_FIRST_GID,
    source: `terrain/${WALL_TILESET}`,
  };
}

export function entityMarkersTilesetReference(): TiledTilesetReference {
  return {
    firstgid: ENTITY_MARKERS_FIRST_GID,
    source: ENTITY_MARKERS_TILESET,
  };
}

export function templateFile(definition: TemplateDefinition): TemplateFile {
  const markerId = ENTITY_MARKER_TYPES.indexOf(definition.marker);
  return {
    type: "template",
    tileset: {
      firstgid: TEMPLATE_MARKER_FIRST_GID,
      source: `../${ENTITY_MARKERS_TILESET}`,
    },
    object: {
      gid: TEMPLATE_MARKER_FIRST_GID + markerId,
      height: AUTHORING_TILE_SIZE,
      name: definition.name,
      properties: definition.properties,
      rotation: 0,
      type: definition.objectType,
      visible: true,
      width: AUTHORING_TILE_SIZE,
      x: 0,
      y: AUTHORING_TILE_SIZE,
    },
  };
}

function enumPropertyType(id: number, name: string, values: readonly string[]): TiledEnumPropertyType {
  return {
    id,
    name,
    storageType: "string",
    type: "enum",
    values,
    valuesAsFlags: false,
  };
}

function classPropertyType(
  id: number,
  name: string,
  color: string,
  drawFill: boolean,
  useAs: readonly string[],
  members: readonly TiledClassMember[],
): TiledClassPropertyType {
  return {
    color,
    drawFill,
    id,
    members,
    name,
    type: "class",
    useAs,
  };
}

function classMember(
  name: string,
  type: TiledClassMember["type"],
  value: TiledClassMember["value"],
  propertyType?: string,
): TiledClassMember {
  return propertyType === undefined ? { name, type, value } : { name, propertyType, type, value };
}

function tiledCommand(command: string, args: string): TiledProjectCommand {
  return {
    command,
    executable: "/bin/zsh",
    arguments: `-lc ${JSON.stringify(`deno ${args}`)}`,
    workingDirectory: "%projectpath/../..",
    shortcut: "",
    showOutput: true,
    saveBeforeExecute: true,
    enabled: true,
  };
}

function templateDefinition(
  path: string,
  marker: EntityMarkerType,
  objectType: EntityPrefab,
  name: string,
  properties: readonly TiledProperty[],
): TemplateDefinition {
  return { path: `${TEMPLATE_DIR}/${path}`, marker, objectType, name, properties };
}

function texturePackDefinition(pack: TexturePack, label: string, image: string): TexturePackDefinition {
  return { pack, label, image };
}

function textureRef(pack: TexturePack, column: number, row: number): string {
  return `${pack}:${column},${row}`;
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

function authoringKeys(source: Readonly<Record<string, number>>): readonly string[] {
  return Object.keys(source).map(lowerFirst);
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toLowerCase()}${value.slice(1)}`;
}

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
