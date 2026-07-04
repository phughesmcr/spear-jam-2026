import { z } from "zod";
import { DialogueTreeId, type DialogueTreeId as DialogueTreeIdType } from "@/src/dialogue/dialogue.ts";
import { ItemKind, type ItemKind as ItemKindType } from "@/src/ecs/components.ts";
import { EnemyArchetype, type EnemyArchetype as EnemyArchetypeType } from "@/src/ecs/enemy_catalog.ts";
import {
  AttackFacingRequirement,
  type AttackFacingRequirement as AttackFacingRequirementType,
  AttackPattern,
  type AttackPattern as AttackPatternType,
  AttackTargetMode,
  type AttackTargetMode as AttackTargetModeType,
} from "@/src/game/attack.ts";
import type { AttackDef } from "@/src/game/attack.ts";
import { ExamineTextId, type ExamineTextId as ExamineTextIdType } from "@/src/game/examine.ts";
import { DisplayName, type DisplayName as DisplayNameType } from "@/src/game/names.ts";
import { type DoorSlide, KeyColor, type KeyColor as KeyColorType } from "@/src/map/map.ts";

const DOOR_SLIDES = ["north", "east", "south", "west", "up", "down"] as const satisfies readonly DoorSlide[];

const INTEGER_SCHEMA = z.number().int();
const NON_NEGATIVE_INTEGER_SCHEMA = INTEGER_SCHEMA.nonnegative();
const POSITIVE_INTEGER_SCHEMA = INTEGER_SCHEMA.positive();
const DIRECTION_SCHEMA = INTEGER_SCHEMA.min(0).max(3);
const KEY_COLOR_SCHEMA = z.enum([KeyColor.Red, KeyColor.Blue, KeyColor.Yellow]) satisfies z.ZodType<KeyColorType>;
const DOOR_SLIDE_SCHEMA = z.enum(DOOR_SLIDES);
const LIGHT_COLOR_SCHEMA = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const DISPLAY_NAME_SCHEMA = numberEnumSchema<DisplayNameType>(Object.values(DisplayName), "displayName");
const DIALOGUE_TREE_ID_SCHEMA = numberEnumSchema<DialogueTreeIdType>(
  Object.values(DialogueTreeId),
  "dialogueTreeId",
);
const ENEMY_ARCHETYPE_SCHEMA = numberEnumSchema<EnemyArchetypeType>(Object.values(EnemyArchetype), "archetype");
const EXAMINE_TEXT_ID_SCHEMA = numberEnumSchema<ExamineTextIdType>(Object.values(ExamineTextId), "examineTextId");
const ITEM_KIND_SCHEMA = numberEnumSchema<ItemKindType>(Object.values(ItemKind), "item");
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
  minDamage: POSITIVE_INTEGER_SCHEMA.optional(),
  maxDamage: POSITIVE_INTEGER_SCHEMA.optional(),
  range: POSITIVE_INTEGER_SCHEMA.optional(),
  requiresFacing: ATTACK_FACING_REQUIREMENT_SCHEMA.optional(),
  attackBonus: INTEGER_SCHEMA.optional(),
  critThreshold: POSITIVE_INTEGER_SCHEMA.optional(),
  critMultiplier: POSITIVE_INTEGER_SCHEMA.optional(),
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
  entityDefinition("npc", ["prefab", "dir", "facing", "displayName", "dialogueTreeId", "examineTextId"], {
    dir: DIRECTION_SCHEMA,
    displayName: DISPLAY_NAME_SCHEMA,
    dialogueTreeId: DIALOGUE_TREE_ID_SCHEMA.optional(),
    examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
  }),
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
      health: POSITIVE_INTEGER_SCHEMA.optional(),
      hitDc: POSITIVE_INTEGER_SCHEMA.optional(),
      damage: POSITIVE_INTEGER_SCHEMA.optional(),
      attack: ATTACK_SCHEMA.optional(),
      examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
    },
  ),
  entityDefinition("door", ["prefab", "locked", "color", "slide", "openMs", "secret", "examineTextId"], {
    locked: z.boolean().optional(),
    color: KEY_COLOR_SCHEMA.optional(),
    slide: DOOR_SLIDE_SCHEMA.optional(),
    openMs: POSITIVE_INTEGER_SCHEMA.optional(),
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
    amount: POSITIVE_INTEGER_SCHEMA,
  }),
  entityDefinition("light", ["prefab", "color", "radius", "flickerAmount", "flickerSpeed"], {
    color: LIGHT_COLOR_SCHEMA,
    radius: POSITIVE_INTEGER_SCHEMA,
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
