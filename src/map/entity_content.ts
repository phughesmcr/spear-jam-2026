import { z } from "zod";
import { DialogueTreeId, type DialogueTreeId as DialogueTreeIdType } from "@/src/dialogue/dialogue.ts";
import {
  type DecorationKind as DecorationKindType,
  DecorationKind as EcsDecorationKind,
  ItemKind as EcsItemKind,
  type ItemKind as ItemKindType,
} from "@/src/ecs/components.ts";
import {
  ENEMY_ARCHETYPE_CODES,
  EnemyArchetype as EcsEnemyArchetype,
  type EnemyArchetype as EnemyArchetypeType,
} from "@/src/ecs/enemy_catalog.ts";
import {
  type AttackDef,
  AttackFacingRequirement,
  type AttackFacingRequirement as AttackFacingRequirementType,
  AttackPattern,
  type AttackPattern as AttackPatternType,
  AttackTargetMode,
  type AttackTargetMode as AttackTargetModeType,
} from "@/src/game/attack.ts";
import { ExamineTextId, type ExamineTextId as ExamineTextIdType } from "@/src/game/examine_content.ts";
import { DisplayName, type DisplayName as DisplayNameType } from "@/src/game/names.ts";
import {
  StoryEventId,
  type StoryEventId as StoryEventIdType,
  StoryTargetId,
  type StoryTargetId as StoryTargetIdType,
} from "@/src/game/story.ts";

export const KeyColor = {
  Red: "red",
  Blue: "blue",
  Yellow: "yellow",
} as const;
export type KeyColor = (typeof KeyColor)[keyof typeof KeyColor];

export type DoorSlide = "north" | "east" | "south" | "west" | "up" | "down";
export const DOOR_SLIDES = ["north", "east", "south", "west", "up", "down"] as const satisfies readonly DoorSlide[];

export const DecorationKind = EcsDecorationKind;
export type DecorationKind = DecorationKindType;
export const EnemyArchetype = EcsEnemyArchetype;
export type EnemyArchetype = EnemyArchetypeType;
export const ItemKind = EcsItemKind;
export type ItemKind = ItemKindType;

const MAP_ITEM_KIND_CODES = [
  EcsItemKind.HealthPatch,
  EcsItemKind.PistolAmmo,
  EcsItemKind.CannonAmmo,
] as const satisfies readonly ItemKindType[];

const INTEGER_SCHEMA = z.number().int();
const UINT8_SCHEMA = INTEGER_SCHEMA.min(0).max(255);
const INT8_SCHEMA = INTEGER_SCHEMA.min(-128).max(127);
const UINT16_SCHEMA = INTEGER_SCHEMA.min(0).max(65535);
const NON_NEGATIVE_INTEGER_SCHEMA = INTEGER_SCHEMA.nonnegative();
const DIRECTION_SCHEMA = INTEGER_SCHEMA.min(0).max(3);
const KEY_COLOR_SCHEMA = z.enum([KeyColor.Red, KeyColor.Blue, KeyColor.Yellow]) satisfies z.ZodType<KeyColor>;
const DOOR_SLIDE_SCHEMA = z.enum(DOOR_SLIDES);
const LIGHT_COLOR_SCHEMA = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const DISPLAY_NAME_SCHEMA = numberEnumSchema<DisplayNameType>(Object.values(DisplayName), "displayName");
const STORY_TARGET_ID_SCHEMA = z.enum(Object.values(StoryTargetId)) satisfies z.ZodType<StoryTargetIdType>;
const STORY_EVENT_ID_SCHEMA = z.enum(Object.values(StoryEventId)) satisfies z.ZodType<StoryEventIdType>;
const DIALOGUE_TREE_ID_SCHEMA = numberEnumSchema<DialogueTreeIdType>(
  Object.values(DialogueTreeId),
  "dialogueTreeId",
);
const ENEMY_ARCHETYPE_SCHEMA = numberEnumSchema<EnemyArchetypeType>(ENEMY_ARCHETYPE_CODES, "archetype");
const EXAMINE_TEXT_ID_SCHEMA = numberEnumSchema<ExamineTextIdType>(Object.values(ExamineTextId), "examineTextId");
const ITEM_KIND_SCHEMA = numberEnumSchema<ItemKindType>(MAP_ITEM_KIND_CODES, "item");
const DECORATION_KIND_SCHEMA = numberEnumSchema<DecorationKindType>(Object.values(EcsDecorationKind), "decoration");
const ATTACK_FACING_REQUIREMENT_SCHEMA = numberEnumSchema<AttackFacingRequirementType>(
  Object.values(AttackFacingRequirement),
  "attack.requiresFacing",
);
const ATTACK_PATTERN_SCHEMA = numberEnumSchema<AttackPatternType>(Object.values(AttackPattern), "attack.pattern");
const ATTACK_TARGET_MODE_SCHEMA = numberEnumSchema<AttackTargetModeType>(
  Object.values(AttackTargetMode),
  "attack.targets",
);

const ATTACK_SCHEMA = z.object({
  minDamage: UINT8_SCHEMA.min(1).optional(),
  maxDamage: UINT8_SCHEMA.min(1).optional(),
  range: UINT8_SCHEMA.min(1).optional(),
  requiresFacing: ATTACK_FACING_REQUIREMENT_SCHEMA.optional(),
  attackBonus: INT8_SCHEMA.optional(),
  critThreshold: UINT8_SCHEMA.min(1).optional(),
  critMultiplier: UINT8_SCHEMA.min(1).optional(),
  pattern: ATTACK_PATTERN_SCHEMA.optional(),
  targets: ATTACK_TARGET_MODE_SCHEMA.optional(),
}).strict() satisfies z.ZodType<Partial<AttackDef>>;

const BASE_ENTITY_SCHEMA = {
  x: NON_NEGATIVE_INTEGER_SCHEMA,
  y: NON_NEGATIVE_INTEGER_SCHEMA,
} as const;

const ENTITY_DEFINITIONS = [
  entityDefinition("player", ["prefab", "dir", "facing"], {
    dir: DIRECTION_SCHEMA,
  }),
  entityDefinition(
    "npc",
    ["prefab", "dir", "facing", "displayName", "dialogueTreeId", "examineTextId", "storyId", "onTalkEvent"],
    {
      dir: DIRECTION_SCHEMA,
      displayName: DISPLAY_NAME_SCHEMA,
      dialogueTreeId: DIALOGUE_TREE_ID_SCHEMA.optional(),
      examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
      storyId: STORY_TARGET_ID_SCHEMA.optional(),
      onTalkEvent: STORY_EVENT_ID_SCHEMA.optional(),
    },
  ),
  entityDefinition(
    "enemy",
    [
      "prefab",
      "dir",
      "facing",
      "displayName",
      "archetype",
      "health",
      "hitDc",
      "damage",
      "attackMinDamage",
      "attackMaxDamage",
      "attackRange",
      "attackRequiresFacing",
      "attackBonus",
      "attackCritThreshold",
      "attackCritMultiplier",
      "attackPattern",
      "attackTargets",
      "examineTextId",
    ],
    {
      dir: DIRECTION_SCHEMA,
      displayName: DISPLAY_NAME_SCHEMA.optional(),
      archetype: ENEMY_ARCHETYPE_SCHEMA.optional(),
      health: UINT8_SCHEMA.min(1).optional(),
      hitDc: UINT8_SCHEMA.min(1).optional(),
      damage: UINT8_SCHEMA.min(1).optional(),
      attack: ATTACK_SCHEMA.optional(),
      examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
    },
  ),
  entityDefinition("door", ["prefab", "locked", "color", "slide", "openMs", "secret", "examineTextId"], {
    locked: z.boolean().optional(),
    color: KEY_COLOR_SCHEMA.optional(),
    slide: DOOR_SLIDE_SCHEMA.optional(),
    openMs: UINT16_SCHEMA.min(1).optional(),
    secret: z.boolean().optional(),
    examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
  }),
  entityDefinition("key", ["prefab", "color"], {
    color: KEY_COLOR_SCHEMA,
  }),
  entityDefinition("uplinkCode", ["prefab"], {}),
  entityDefinition("uplinkTerminal", ["prefab", "goto", "examineTextId"], {
    goto: z.string().min(1),
    examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
  }),
  entityDefinition("weaponPickup", ["prefab", "slot"], {
    slot: z.union([z.literal(2), z.literal(3)]),
  }),
  entityDefinition("item", ["prefab", "item", "amount"], {
    item: ITEM_KIND_SCHEMA,
    amount: UINT8_SCHEMA.min(1),
  }),
  entityDefinition("decoration", ["prefab", "decoration"], {
    decoration: DECORATION_KIND_SCHEMA,
  }),
  entityDefinition("light", ["prefab", "color", "radius", "flickerAmount", "flickerSpeed"], {
    color: LIGHT_COLOR_SCHEMA,
    radius: UINT8_SCHEMA.min(1),
    flickerAmount: z.number().min(0).max(1).optional(),
    flickerSpeed: z.number().positive().optional(),
  }),
] as const;

const ENTITY_SCHEMAS = ENTITY_DEFINITIONS.map((definition) => definition.schema) as [
  (typeof ENTITY_DEFINITIONS)[0]["schema"],
  (typeof ENTITY_DEFINITIONS)[1]["schema"],
  (typeof ENTITY_DEFINITIONS)[2]["schema"],
  (typeof ENTITY_DEFINITIONS)[3]["schema"],
  (typeof ENTITY_DEFINITIONS)[4]["schema"],
  (typeof ENTITY_DEFINITIONS)[5]["schema"],
  (typeof ENTITY_DEFINITIONS)[6]["schema"],
  (typeof ENTITY_DEFINITIONS)[7]["schema"],
  (typeof ENTITY_DEFINITIONS)[8]["schema"],
  (typeof ENTITY_DEFINITIONS)[9]["schema"],
  (typeof ENTITY_DEFINITIONS)[10]["schema"],
];

export const ENTITY_SCHEMA = z.discriminatedUnion("prefab", ENTITY_SCHEMAS);

export type EntityDef = z.infer<typeof ENTITY_SCHEMA>;
export type EntityPrefab = EntityDef["prefab"];
export type EntityDefFor<Prefab extends EntityPrefab> = Extract<EntityDef, { readonly prefab: Prefab }>;
export type PlayerDef = EntityDefFor<"player">;
export type NpcDef = EntityDefFor<"npc">;
export type EnemyDef = EntityDefFor<"enemy">;
export type DoorDef = EntityDefFor<"door">;
export type KeyDef = EntityDefFor<"key">;
export type UplinkCodeDef = EntityDefFor<"uplinkCode">;
export type UplinkTerminalDef = EntityDefFor<"uplinkTerminal">;
export type WeaponPickupDef = EntityDefFor<"weaponPickup">;
export type ItemDef = EntityDefFor<"item">;
export type DecorationDef = EntityDefFor<"decoration">;
export type LightDef = EntityDefFor<"light">;

const ENTITY_PREFABS = ENTITY_DEFINITIONS.map((definition) => definition.prefab) as readonly EntityPrefab[];
export const ENTITY_AUTHORING_PROPERTY_NAMES: ReadonlySet<string> = propertySet(
  ENTITY_DEFINITIONS.flatMap((definition) => definition.authoringProperties),
);
export const PREFAB_AUTHORING_PROPERTY_NAMES = Object.fromEntries(
  ENTITY_DEFINITIONS.map((definition) => [definition.prefab, propertySet(definition.authoringProperties)]),
) as Readonly<Record<EntityPrefab, ReadonlySet<string>>>;

const ENTITY_PREFAB_SET = new Set<string>(ENTITY_PREFABS);

export function mapEntityPrefab(value: string, context: string): EntityPrefab {
  if (isEntityPrefab(value)) return value;

  const lowered = lowerFirst(value);
  if (isEntityPrefab(lowered)) return lowered;

  throw new Error(`${context}: Unknown prefab "${value}".`);
}

function entityDefinition<Name extends string, Shape extends z.ZodRawShape>(
  prefab: Name,
  authoringProperties: readonly string[],
  shape: Shape,
) {
  return {
    prefab,
    authoringProperties,
    schema: z.object({
      prefab: z.literal(prefab),
      ...BASE_ENTITY_SCHEMA,
      ...shape,
    }).strict(),
  } as const;
}

function isEntityPrefab(value: string): value is EntityPrefab {
  return ENTITY_PREFAB_SET.has(value);
}

function propertySet(properties: readonly string[]): ReadonlySet<string> {
  return new Set(properties);
}

function numberEnumSchema<T extends number>(values: readonly T[], name: string): z.ZodType<T> {
  const allowed = new Set<number>(values);
  return z.custom<T>((value) => typeof value === "number" && Number.isInteger(value) && allowed.has(value), {
    message: `${name} must be one of ${values.join(", ")}`,
  });
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toLowerCase()}${value.slice(1)}`;
}
