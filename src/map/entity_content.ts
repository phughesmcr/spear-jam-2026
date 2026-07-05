import { z } from "zod";

export const KeyColor = {
  Red: "red",
  Blue: "blue",
  Yellow: "yellow",
} as const;
export type KeyColor = (typeof KeyColor)[keyof typeof KeyColor];

export type DoorSlide = "north" | "east" | "south" | "west" | "up" | "down";
export const DOOR_SLIDES = ["north", "east", "south", "west", "up", "down"] as const satisfies readonly DoorSlide[];

export const AttackFacingRequirement = {
  Required: "required",
  None: "none",
} as const;
export type AttackFacingRequirement = (typeof AttackFacingRequirement)[keyof typeof AttackFacingRequirement];

export const AttackPattern = {
  Line: "line",
  Adjacent: "adjacent",
} as const;
export type AttackPattern = (typeof AttackPattern)[keyof typeof AttackPattern];

export const AttackTargetMode = {
  First: "first",
  All: "all",
} as const;
export type AttackTargetMode = (typeof AttackTargetMode)[keyof typeof AttackTargetMode];

export type AttackDef = {
  readonly minDamage: number;
  readonly maxDamage: number;
  readonly range: number;
  readonly requiresFacing: AttackFacingRequirement;
  readonly attackBonus: number;
  readonly critThreshold: number;
  readonly critMultiplier: number;
  readonly pattern: AttackPattern;
  readonly targets: AttackTargetMode;
};

export type DisplayName = string;
export type DialogueTreeId = string;
export type ExamineTextId = string;
export type StoryEventId = string;
export type StoryTargetId = string;
export type EnemyArchetype = string;
export const ITEM_KINDS = ["healthPatch", "pistolAmmo", "cannonAmmo"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const DECORATION_KINDS = [
  "serverPile",
  "cyborg",
  "ceilingHook",
  "ceilingLight",
  "ceilingWires",
] as const;
export type DecorationKind = (typeof DECORATION_KINDS)[number];

const INTEGER_SCHEMA = z.number().int();
const UINT8_SCHEMA = INTEGER_SCHEMA.min(0).max(255);
const INT8_SCHEMA = INTEGER_SCHEMA.min(-128).max(127);
const UINT16_SCHEMA = INTEGER_SCHEMA.min(0).max(65535);
const NON_NEGATIVE_INTEGER_SCHEMA = INTEGER_SCHEMA.nonnegative();
const DIRECTION_SCHEMA = INTEGER_SCHEMA.min(0).max(3);
const KEY_COLOR_SCHEMA = z.enum([KeyColor.Red, KeyColor.Blue, KeyColor.Yellow]) satisfies z.ZodType<KeyColor>;
const DOOR_SLIDE_SCHEMA = z.enum(DOOR_SLIDES);
const LIGHT_COLOR_SCHEMA = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const NON_EMPTY_STRING_SCHEMA = z.string().min(1);
const DISPLAY_NAME_SCHEMA = NON_EMPTY_STRING_SCHEMA satisfies z.ZodType<DisplayName>;
const STORY_TARGET_ID_SCHEMA = NON_EMPTY_STRING_SCHEMA satisfies z.ZodType<StoryTargetId>;
const STORY_EVENT_ID_SCHEMA = NON_EMPTY_STRING_SCHEMA satisfies z.ZodType<StoryEventId>;
const DIALOGUE_TREE_ID_SCHEMA = NON_EMPTY_STRING_SCHEMA satisfies z.ZodType<DialogueTreeId>;
const ENEMY_ARCHETYPE_SCHEMA = NON_EMPTY_STRING_SCHEMA satisfies z.ZodType<EnemyArchetype>;
const EXAMINE_TEXT_ID_SCHEMA = NON_EMPTY_STRING_SCHEMA satisfies z.ZodType<ExamineTextId>;
const ITEM_KIND_SCHEMA = z.enum(ITEM_KINDS) satisfies z.ZodType<ItemKind>;
const DECORATION_KIND_SCHEMA = z.enum(DECORATION_KINDS) satisfies z.ZodType<DecorationKind>;
const ATTACK_FACING_REQUIREMENT_SCHEMA = z.enum([
  AttackFacingRequirement.Required,
  AttackFacingRequirement.None,
]) satisfies z.ZodType<AttackFacingRequirement>;
const ATTACK_PATTERN_SCHEMA = z.enum([
  AttackPattern.Line,
  AttackPattern.Adjacent,
]) satisfies z.ZodType<AttackPattern>;
const ATTACK_TARGET_MODE_SCHEMA = z.enum([
  AttackTargetMode.First,
  AttackTargetMode.All,
]) satisfies z.ZodType<AttackTargetMode>;

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

function lowerFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toLowerCase()}${value.slice(1)}`;
}
