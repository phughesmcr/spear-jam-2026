import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import { ENEMY_ARCHETYPE_CODES, enemyCatalogEntry } from "@/src/ecs/enemy_catalog.ts";
import { AttackPattern } from "@/src/game/attack.ts";
import { ExamineTextId } from "@/src/game/examine.ts";
import { ItemKind } from "@/src/game/items.ts";
import { DisplayName } from "@/src/game/names.ts";
import { KeyColor, VICTORY_GOTO } from "@/src/map/map.ts";
import {
  BOOT_SECTOR_PALETTE,
  DATA_CONDUIT_PALETTE,
  FIREWALL_PALETTE,
  MAINFRAME_CORE_PALETTE,
  NEXUS_PALETTE,
} from "@/src/map/terrain_palettes.ts";
import type { EntityPrefab, TerrainTile } from "@/src/map/map.ts";
import type { TiledObject, TiledProperty, TiledTilesetReference } from "@/src/map/authoring/tiled_types.ts";

export const MAPS_DIR = "game_assets/maps";
export const TEMPLATE_DIR = `${MAPS_DIR}/templates`;
export const AUTOMAP_DIR = `${MAPS_DIR}/automap`;
export const AUTOMAP_RULES_FILE = `${AUTOMAP_DIR}/rules.txt`;
export const TILED_PROJECT_AUTOMAP_RULES_FILE = "automap/rules.txt";
export const COMPILED_MAPS_PATH = "src/map/compiled_maps.json";
export const TILED_PROJECT_PATH = `${MAPS_DIR}/game.tiled-project`;
export const ENTITY_MARKERS_TILESET = "entity_markers.tsj";
export const ENTITY_MARKERS_IMAGE = "entity_markers.png";
export const TERRAIN_AUTHORING_TILES = "terrain_authoring_tiles.png";
export const AUTHORING_TILE_SIZE = 16;
export const TERRAIN_AUTHORING_TILE_COUNT = 6;
export const TERRAIN_TILESET_FIRST_GID = 1;
export const ENTITY_MARKERS_FIRST_GID = 7;
export const TERRAIN_PASSABLE_TILE_ID = 0;
export const TERRAIN_BLOCKING_TILE_ID = 1;
export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

export type RgbaColor = readonly [number, number, number, number];

export type TerrainAuthoringTile = {
  readonly id: number;
  readonly blocking: boolean;
  readonly color: RgbaColor;
  readonly accent: RgbaColor;
};

export const TERRAIN_AUTHORING_TILE_DEFINITIONS: readonly TerrainAuthoringTile[] = [
  terrainAuthoringTile(0, false, [0x00, 0xb8, 0x94, 0xff], [0x7d, 0xff, 0xe7, 0xff]),
  terrainAuthoringTile(1, true, [0xff, 0x3b, 0x30, 0xff], [0xff, 0xb3, 0xae, 0xff]),
  terrainAuthoringTile(2, false, [0x00, 0xb8, 0x94, 0xff], [0x7d, 0xff, 0xe7, 0xff]),
  terrainAuthoringTile(3, false, [0x00, 0xb8, 0x94, 0xff], [0x7d, 0xff, 0xe7, 0xff]),
  terrainAuthoringTile(4, true, [0xff, 0x3b, 0x30, 0xff], [0xff, 0xb3, 0xae, 0xff]),
  terrainAuthoringTile(5, true, [0xff, 0x3b, 0x30, 0xff], [0xff, 0xb3, 0xae, 0xff]),
];

export const PALETTES = {
  boot_sector: BOOT_SECTOR_PALETTE,
  data_conduit: DATA_CONDUIT_PALETTE,
  firewall: FIREWALL_PALETTE,
  nexus: NEXUS_PALETTE,
  mainframe_core: MAINFRAME_CORE_PALETTE,
} as const satisfies Readonly<Record<string, readonly TerrainTile[]>>;

export type PaletteKey = keyof typeof PALETTES;

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
  enumPropertyType(1, "TerrainPalette", Object.keys(PALETTES)),
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

export function terrainTilesetReference(): TiledTilesetReference {
  return {
    columns: TERRAIN_AUTHORING_TILE_COUNT,
    firstgid: TERRAIN_TILESET_FIRST_GID,
    image: TERRAIN_AUTHORING_TILES,
    imageheight: AUTHORING_TILE_SIZE,
    imagewidth: AUTHORING_TILE_SIZE * TERRAIN_AUTHORING_TILE_COUNT,
    margin: 0,
    name: "terrain",
    spacing: 0,
    tilecount: TERRAIN_AUTHORING_TILE_COUNT,
    tileheight: AUTHORING_TILE_SIZE,
    tiles: TERRAIN_AUTHORING_TILE_DEFINITIONS.map((tile) => ({
      id: tile.id,
      properties: [
        property("terrainId", tile.id),
        property("blocking", tile.blocking),
      ],
    })),
    tilewidth: AUTHORING_TILE_SIZE,
  };
}

function terrainAuthoringTile(
  id: number,
  blocking: boolean,
  color: RgbaColor,
  accent: RgbaColor,
): TerrainAuthoringTile {
  return { id, blocking, color, accent };
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
    executable: "deno",
    arguments: args,
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
