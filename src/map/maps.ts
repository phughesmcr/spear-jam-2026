import { z } from "zod";
import { AttackFacingRequirement, AttackPattern, AttackTargetMode } from "@/src/game/attack.ts";
import { DialogueTreeId, type DialogueTreeId as DialogueTreeIdType } from "@/src/dialogue/dialogue.ts";
import { EnemyArchetype, type EnemyArchetype as EnemyArchetypeType } from "@/src/ecs/components.ts";
import { ExamineTextId, type ExamineTextId as ExamineTextIdType } from "@/src/game/examine.ts";
import { ItemKind, type ItemKind as ItemKindType } from "@/src/game/items.ts";
import { DisplayName, type DisplayName as DisplayNameType } from "@/src/game/names.ts";
import {
  createGameMap,
  type DoorSlide,
  type EntityDef,
  type GameMap,
  KeyColor,
  type KeyColor as KeyColorType,
} from "@/src/map/map.ts";
import compiledMapsData from "@/src/map/compiled_maps.json" with { type: "json" };
import { validateGameMaps } from "@/src/map/map_validation.ts";
import {
  BOOT_SECTOR_PALETTE,
  DATA_CONDUIT_PALETTE,
  FIREWALL_PALETTE,
  MAINFRAME_CORE_PALETTE,
  NEXUS_PALETTE,
} from "@/src/map/terrain_palettes.ts";

export type LoadedGameMaps = {
  readonly startMapName: string;
  readonly gameMaps: readonly GameMap[];
};

const PALETTES = {
  boot_sector: BOOT_SECTOR_PALETTE,
  data_conduit: DATA_CONDUIT_PALETTE,
  firewall: FIREWALL_PALETTE,
  nexus: NEXUS_PALETTE,
  mainframe_core: MAINFRAME_CORE_PALETTE,
} as const;

const PALETTE_KEYS = ["boot_sector", "data_conduit", "firewall", "nexus", "mainframe_core"] as const;
const DOOR_SLIDES = ["north", "east", "south", "west", "up", "down"] as const satisfies readonly DoorSlide[];
const INTEGER_SCHEMA = z.number().int();
const NON_NEGATIVE_INTEGER_SCHEMA = INTEGER_SCHEMA.nonnegative();
const POSITIVE_INTEGER_SCHEMA = INTEGER_SCHEMA.positive();
const DIRECTION_SCHEMA = INTEGER_SCHEMA.min(0).max(3);
const KEY_COLOR_SCHEMA = z.enum([KeyColor.Red, KeyColor.Blue, KeyColor.Yellow]) satisfies z.ZodType<KeyColorType>;
const PALETTE_SCHEMA = z.enum(PALETTE_KEYS);
const DOOR_SLIDE_SCHEMA = z.enum(DOOR_SLIDES);
const DISPLAY_NAME_SCHEMA = numberEnumSchema<DisplayNameType>(Object.values(DisplayName), "displayName");
const DIALOGUE_TREE_ID_SCHEMA = numberEnumSchema<DialogueTreeIdType>(
  Object.values(DialogueTreeId),
  "dialogueTreeId",
);
const ENEMY_ARCHETYPE_SCHEMA = numberEnumSchema<EnemyArchetypeType>(Object.values(EnemyArchetype), "archetype");
const EXAMINE_TEXT_ID_SCHEMA = numberEnumSchema<ExamineTextIdType>(Object.values(ExamineTextId), "examineTextId");
const ITEM_KIND_SCHEMA = numberEnumSchema<ItemKindType>(Object.values(ItemKind), "item");
const ATTACK_FACING_REQUIREMENT_SCHEMA = numberEnumSchema(
  Object.values(AttackFacingRequirement),
  "attack.requiresFacing",
);
const ATTACK_PATTERN_SCHEMA = numberEnumSchema(Object.values(AttackPattern), "attack.pattern");
const ATTACK_TARGET_MODE_SCHEMA = numberEnumSchema(Object.values(AttackTargetMode), "attack.targets");

const ATTACK_SCHEMA = z.object({
  minDamage: POSITIVE_INTEGER_SCHEMA.optional(),
  maxDamage: POSITIVE_INTEGER_SCHEMA.optional(),
  range: POSITIVE_INTEGER_SCHEMA.optional(),
  requiresFacing: ATTACK_FACING_REQUIREMENT_SCHEMA.optional(),
  attackBonus: INTEGER_SCHEMA.optional(),
  critThreshold: POSITIVE_INTEGER_SCHEMA.optional(),
  critMultiplier: POSITIVE_INTEGER_SCHEMA.optional(),
  pattern: ATTACK_PATTERN_SCHEMA.optional(),
  targets: ATTACK_TARGET_MODE_SCHEMA.optional(),
}).strict();

const BASE_ENTITY_SCHEMA = {
  x: NON_NEGATIVE_INTEGER_SCHEMA,
  y: NON_NEGATIVE_INTEGER_SCHEMA,
} as const;

const ENTITY_SCHEMA: z.ZodType<EntityDef> = z.discriminatedUnion("prefab", [
  z.object({
    prefab: z.literal("player"),
    ...BASE_ENTITY_SCHEMA,
    dir: DIRECTION_SCHEMA,
  }).strict(),
  z.object({
    prefab: z.literal("npc"),
    ...BASE_ENTITY_SCHEMA,
    dir: DIRECTION_SCHEMA,
    displayName: DISPLAY_NAME_SCHEMA,
    dialogueTreeId: DIALOGUE_TREE_ID_SCHEMA.optional(),
    examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
  }).strict(),
  z.object({
    prefab: z.literal("enemy"),
    ...BASE_ENTITY_SCHEMA,
    dir: DIRECTION_SCHEMA,
    displayName: DISPLAY_NAME_SCHEMA,
    archetype: ENEMY_ARCHETYPE_SCHEMA.optional(),
    health: POSITIVE_INTEGER_SCHEMA.optional(),
    hitDc: POSITIVE_INTEGER_SCHEMA.optional(),
    damage: POSITIVE_INTEGER_SCHEMA.optional(),
    attack: ATTACK_SCHEMA.optional(),
    examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
  }).strict(),
  z.object({
    prefab: z.literal("door"),
    ...BASE_ENTITY_SCHEMA,
    locked: z.boolean().optional(),
    color: KEY_COLOR_SCHEMA.optional(),
    slide: DOOR_SLIDE_SCHEMA.optional(),
    openMs: POSITIVE_INTEGER_SCHEMA.optional(),
    examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
  }).strict(),
  z.object({
    prefab: z.literal("key"),
    ...BASE_ENTITY_SCHEMA,
    color: KEY_COLOR_SCHEMA,
  }).strict(),
  z.object({
    prefab: z.literal("uplinkCode"),
    ...BASE_ENTITY_SCHEMA,
  }).strict(),
  z.object({
    prefab: z.literal("uplinkTerminal"),
    ...BASE_ENTITY_SCHEMA,
    goto: z.string().min(1),
    examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
  }).strict(),
  z.object({
    prefab: z.literal("weaponPickup"),
    ...BASE_ENTITY_SCHEMA,
    slot: z.union([z.literal(2), z.literal(3)]),
  }).strict(),
  z.object({
    prefab: z.literal("item"),
    ...BASE_ENTITY_SCHEMA,
    item: ITEM_KIND_SCHEMA,
    amount: POSITIVE_INTEGER_SCHEMA,
  }).strict(),
]);

const COMPILED_MAP_SCHEMA = z.object({
  name: z.string().min(1),
  palette: PALETTE_SCHEMA,
  tiles: z.array(z.array(NON_NEGATIVE_INTEGER_SCHEMA).nonempty()).nonempty(),
  entities: z.array(ENTITY_SCHEMA),
}).strict();

const COMPILED_MAPS_SCHEMA = z.object({
  startMapName: z.string().min(1),
  maps: z.array(COMPILED_MAP_SCHEMA).nonempty(),
}).strict()
  .refine((data) => data.maps.some((map) => map.name === data.startMapName), {
    message: "startMapName must match a compiled map name",
    path: ["startMapName"],
  })
  .refine((data) => new Set(data.maps.map((map) => map.name)).size === data.maps.length, {
    message: "map names must be unique",
    path: ["maps"],
  });

type CompiledMap = z.infer<typeof COMPILED_MAP_SCHEMA>;

const LOADED_GAME_MAPS = loadGameMapsData(compiledMapsData);

export const START_MAP_NAME = LOADED_GAME_MAPS.startMapName;
export const GAME_MAPS = LOADED_GAME_MAPS.gameMaps;

const MAPS: ReadonlyMap<string, GameMap> = new Map(GAME_MAPS.map((map) => [map.name, map]));

export function getMap(name: string): GameMap {
  const map = MAPS.get(name);
  if (!map) throw new Error(`Unknown map: ${name}`);
  return map;
}

export function loadGameMapsData(data: unknown): LoadedGameMaps {
  const parsed = COMPILED_MAPS_SCHEMA.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Invalid compiled map data:\n${formatZodError(parsed.error)}`);
  }

  const gameMaps = parsed.data.maps.map(gameMapFromCompiledMap);
  const validationIssues = validateGameMaps(gameMaps);
  if (validationIssues.length > 0) {
    throw new Error(`Invalid compiled game maps:\n${validationIssues.join("\n")}`);
  }

  return {
    startMapName: parsed.data.startMapName,
    gameMaps,
  };
}

function gameMapFromCompiledMap(map: CompiledMap): GameMap {
  return createGameMap(map.name, map.tiles, map.entities, { palette: PALETTES[map.palette] });
}

function numberEnumSchema<T extends number>(values: readonly T[], name: string): z.ZodType<T> {
  const allowed = new Set<number>(values);
  return z.custom<T>((value) => typeof value === "number" && Number.isInteger(value) && allowed.has(value), {
    message: `${name} must be one of ${values.join(", ")}`,
  });
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("\n");
}
