import {
  AMBIENT_SOUND_IDS,
  ENEMY_ARCHETYPE_AUTHORING_KEYS,
  KNOWN_DIALOGUE_TREE_IDS,
  KNOWN_DISPLAY_NAMES,
  KNOWN_EXAMINE_TEXT_IDS,
  KNOWN_STORY_EVENT_IDS,
  KNOWN_STORY_TARGET_IDS,
} from "@/src/content/known_ids.ts";
import { ATTACK_PATTERN_AUTHORING_KEYS, ATTACK_TARGET_MODE_AUTHORING_KEYS } from "@/src/game/attack.ts";
import type { TiledObject, TiledProperty, TiledTilesetReference } from "@/src/map/authoring/tiled_types.ts";
import { VICTORY_GOTO } from "@/src/map/destinations.ts";
import { ENTITY_PREFABS, type EntityPrefab } from "@/src/map/entity_descriptors.ts";
import { DECORATION_KINDS, KeyColor, SKY_CEILING_TEXTURE, TexturePack } from "@/src/map/map.ts";
import {
  BARRIER_TERRAIN_COUNT,
  TERRAIN_CATALOG_TILE_COLUMNS,
  TEXTURE_PACK_COLUMNS,
  TEXTURE_PACK_ROWS,
  TEXTURE_TERRAIN_COUNT,
} from "@/src/map/terrain_palettes.ts";

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
export const FLOOR_TILESET = "floors.tsj";
export const FLOOR_TILESET_IMAGE = "floors.png";
export const WALL_TILESET = "walls.tsj";
export const WALL_TILESET_IMAGE = "walls.png";
export const BARRIER_TILESET = "barriers.tsj";
export const BARRIER_TILESET_IMAGE = "barriers.png";
export const FLOOR_TILESET_FIRST_GID = 1;
export const WALL_TILESET_FIRST_GID = FLOOR_TILESET_FIRST_GID + TEXTURE_TERRAIN_COUNT;
export const BARRIER_TILESET_FIRST_GID = WALL_TILESET_FIRST_GID + TEXTURE_TERRAIN_COUNT;
export const ENTITY_MARKERS_FIRST_GID = BARRIER_TILESET_FIRST_GID + BARRIER_TERRAIN_COUNT;
export const TERRAIN_PASSABLE_TILE_ID = 0;
export const TERRAIN_BLOCKING_TILE_ID = WALL_TILESET_FIRST_GID - 1;
export const TEXTURE_PACK_TILE_SIZE = 128;
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

export const TEXTURE_REFS: readonly string[] = [
  SKY_CEILING_TEXTURE,
  ...TEXTURE_PACK_DEFINITIONS.flatMap((definition) =>
    Array.from(
      { length: TEXTURE_PACK_COLUMNS * TEXTURE_PACK_ROWS },
      (_value, tileId) =>
        textureRef(definition.pack, tileId % TEXTURE_PACK_COLUMNS, Math.floor(tileId / TEXTURE_PACK_COLUMNS)),
    )
  ),
];

export const ENTITY_MARKER_TYPES = ENTITY_PREFABS;
export type EntityMarkerType = EntityPrefab;

const PREFAB_AUTHORING_VALUES = ENTITY_MARKER_TYPES;

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
  readonly type: "bool" | "float" | "int" | "string";
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
  enumPropertyType(2, "Prefab", PREFAB_AUTHORING_VALUES),
  enumPropertyType(3, "Facing", ["north", "east", "south", "west"]),
  enumPropertyType(4, "KeyColor", Object.values(KeyColor)),
  enumPropertyType(5, "DoorSlide", ["north", "east", "south", "west", "up", "down"]),
  enumPropertyType(6, "DisplayName", KNOWN_DISPLAY_NAMES),
  enumPropertyType(7, "DialogueTreeId", ["none", ...KNOWN_DIALOGUE_TREE_IDS]),
  enumPropertyType(8, "ExamineTextId", KNOWN_EXAMINE_TEXT_IDS),
  enumPropertyType(9, "ItemKind", ["healthPatch", "pistolAmmo", "cannonAmmo"]),
  enumPropertyType(
    10,
    "EnemyArchetype",
    ENEMY_ARCHETYPE_AUTHORING_KEYS,
  ),
  enumPropertyType(11, "AttackPattern", ATTACK_PATTERN_AUTHORING_KEYS),
  enumPropertyType(12, "AttackTargets", ATTACK_TARGET_MODE_AUTHORING_KEYS),
  enumPropertyType(14, "TextureRef", TEXTURE_REFS),
  enumPropertyType(15, "DecorationKind", DECORATION_KINDS),
  enumPropertyType(16, "StoryTargetId", KNOWN_STORY_TARGET_IDS),
  enumPropertyType(17, "StoryEventId", KNOWN_STORY_EVENT_IDS),
  enumPropertyType(18, "SoundId", AMBIENT_SOUND_IDS),
  classPropertyType(20, "map_metadata", "#ff0ea5e9", true, ["map"], [
    classMember("name", "string", "Boot Sector"),
    classMember("campaignOrder", "int", 1),
  ]),
  classPropertyType(21, "terrain_layer", "#ff334155", true, ["layer"], []),
  classPropertyType(22, "object_layer", "#ffa855f7", false, ["layer"], []),
  classPropertyType(23, "sound_layer", "#ff14b8a6", false, ["layer"], []),
  classPropertyType(24, "light_layer", "#fffbbf24", false, ["layer"], []),
  classPropertyType(30, "player", "#ff22d3ee", false, ["object"], [
    classMember("prefab", "string", "player", "Prefab"),
    classMember("facing", "string", "north", "Facing"),
  ]),
  classPropertyType(31, "npc", "#fffb7185", false, ["object"], [
    classMember("prefab", "string", "npc", "Prefab"),
    classMember("facing", "string", "north", "Facing"),
    classMember("displayName", "string", "john", "DisplayName"),
    classMember("dialogueTreeId", "string", "none", "DialogueTreeId"),
    classMember("storyId", "string", "john", "StoryTargetId"),
    classMember("onTalkEvent", "string", "johnSpoken", "StoryEventId"),
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
    classMember("secret", "bool", false),
    classMember("glass", "bool", false),
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
    classMember("requiresSpear", "bool", false),
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
  classPropertyType(39, "decoration", "#ff64748b", false, ["object"], [
    classMember("prefab", "string", "decoration", "Prefab"),
    classMember("decoration", "string", "serverPile", "DecorationKind"),
  ]),
  classPropertyType(40, "sound", "#ff14b8a6", false, ["object"], [
    classMember("prefab", "string", "sound", "Prefab"),
    classMember("soundId", "string", "ambientHum", "SoundId"),
    classMember("radius", "int", 5),
    classMember("volume", "float", 1),
  ]),
  classPropertyType(41, "light", "#fffbbf24", false, ["object"], [
    classMember("prefab", "string", "light", "Prefab"),
    classMember("color", "string", "#ffffff"),
    classMember("radius", "int", 5),
    classMember("flickerAmount", "float", 0),
    classMember("flickerSpeed", "float", 1),
  ]),
  classPropertyType(42, "spearPickup", "#ff22d3ee", false, ["object"], [
    classMember("prefab", "string", "spearPickup", "Prefab"),
  ]),
  classPropertyType(43, "spearTurret", "#ff06b6d4", false, ["object"], [
    classMember("prefab", "string", "spearTurret", "Prefab"),
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
    property("storyId", "john", "StoryTargetId"),
    property("onTalkEvent", "johnSpoken", "StoryEventId"),
  ]),
  ...ENEMY_ARCHETYPE_AUTHORING_KEYS.map((authoringKey) =>
    templateDefinition(`enemy_${snakeCase(authoringKey)}.tx`, "enemy", "enemy", authoringKey, [
      property("prefab", "enemy", "Prefab"),
      property("facing", "north", "Facing"),
      property("archetype", authoringKey, "EnemyArchetype"),
    ])
  ),
  templateDefinition("door.tx", "door", "door", "Door", [
    property("prefab", "door", "Prefab"),
    property("slide", "up", "DoorSlide"),
  ]),
  templateDefinition("door_secret.tx", "door", "door", "Secret door", [
    property("prefab", "door", "Prefab"),
    property("slide", "up", "DoorSlide"),
    property("secret", true),
  ]),
  templateDefinition("door_glass.tx", "door", "door", "Glass door", [
    property("prefab", "door", "Prefab"),
    property("slide", "up", "DoorSlide"),
    property("glass", true),
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
  ...decorationTemplateDefinitions(),
  templateDefinition("light.tx", "light", "light", "Light", [
    property("prefab", "light", "Prefab"),
    property("color", "#ffffff"),
    property("radius", 5),
  ]),
  templateDefinition("sound_ambient_hum.tx", "sound", "sound", "Ambient hum", [
    property("prefab", "sound", "Prefab"),
    property("soundId", "ambientHum", "SoundId"),
    property("radius", 5),
  ]),
  templateDefinition("sound_ambient_light_buzz.tx", "sound", "sound", "Ambient light buzz", [
    property("prefab", "sound", "Prefab"),
    property("soundId", "ambientLightBuzz", "SoundId"),
    property("radius", 5),
  ]),
  templateDefinition("spear_pickup.tx", "spearPickup", "spearPickup", "Spear of Destiny", [
    property("prefab", "spearPickup", "Prefab"),
  ]),
  templateDefinition("spear_turret.tx", "spearTurret", "spearTurret", "Spear turret", [
    property("prefab", "spearTurret", "Prefab"),
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

export function barrierTilesetPath(): string {
  return `${TERRAIN_TILESETS_DIR}/${BARRIER_TILESET}`;
}

export function barrierTilesetImagePath(): string {
  return `${TERRAIN_TILESETS_DIR}/${BARRIER_TILESET_IMAGE}`;
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

export function barrierTilesetReference(): TiledTilesetReference {
  return {
    firstgid: BARRIER_TILESET_FIRST_GID,
    source: `terrain/${BARRIER_TILESET}`,
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

function decorationTemplateDefinitions(): readonly TemplateDefinition[] {
  return [
    decorationTemplateDefinition("serverPile", "Server pile"),
    decorationTemplateDefinition("cyborg", "Cyborg"),
    decorationTemplateDefinition("ceilingHook", "Ceiling hook"),
    decorationTemplateDefinition("ceilingLight", "Ceiling light"),
    decorationTemplateDefinition("ceilingWires", "Ceiling wires"),
    decorationTemplateDefinition("mainframeCore", "Mainframe core"),
  ];
}

function decorationTemplateDefinition(decoration: string, name: string): TemplateDefinition {
  return templateDefinition(`decor_${snakeCase(decoration)}.tx`, "decoration", "decoration", name, [
    property("prefab", "decoration", "Prefab"),
    property("decoration", decoration, "DecorationKind"),
  ]);
}

function propertyTypeForValue(value: TiledProperty["value"]): "bool" | "int" | "string" {
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number" && Number.isInteger(value)) return "int";
  return "string";
}

function snakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
