import {
  AMBIENT_SOUND_IDS,
  ENEMY_ARCHETYPE_AUTHORING_KEYS,
  KNOWN_DIALOGUE_TREE_IDS,
  KNOWN_DISPLAY_NAMES,
  KNOWN_EXAMINE_TEXT_IDS,
  KNOWN_STORY_EVENT_IDS,
  KNOWN_STORY_TARGET_IDS,
  type SoundId as KnownSoundId,
} from "@/src/content/known_ids.ts";
import {
  ATTACK_FACING_REQUIREMENT_AUTHORING_KEYS,
  ATTACK_PATTERN_AUTHORING_KEYS,
  ATTACK_TARGET_MODE_AUTHORING_KEYS,
  type AuthoringAttackDef,
} from "@/src/game/attack.ts";
import { coerceLookup, lowerFirst } from "@/src/utils/strings.ts";
import { z } from "zod";

export const KeyColor = {
  Red: "red",
  Blue: "blue",
  Yellow: "yellow",
} as const;
export type KeyColor = (typeof KeyColor)[keyof typeof KeyColor];

export type DoorSlide = "north" | "east" | "south" | "west" | "up" | "down";
export const DOOR_SLIDES = ["north", "east", "south", "west", "up", "down"] as const satisfies readonly DoorSlide[];

/** Authoring-side attack override; runtime codes live in {@link "@/src/game/attack.ts"}. */
export type AttackDef = AuthoringAttackDef;

export type DisplayName = string;
export type DialogueTreeId = string;
export type ExamineTextId = string;
export type StoryEventId = string;
export type StoryTargetId = string;
export type EnemyArchetype = string;
export type SoundId = KnownSoundId;
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
const KEY_COLOR_SCHEMA = stringEnumSchema<KeyColor>(
  [KeyColor.Red, KeyColor.Blue, KeyColor.Yellow],
  "key color",
);
const DOOR_SLIDE_SCHEMA = stringEnumSchema<(typeof DOOR_SLIDES)[number]>(DOOR_SLIDES, "door slide");
const LIGHT_COLOR_SCHEMA = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const DISPLAY_NAME_SCHEMA = stringEnumSchema<DisplayName>(KNOWN_DISPLAY_NAMES, "display name");
const STORY_TARGET_ID_SCHEMA = stringEnumSchema<StoryTargetId>(KNOWN_STORY_TARGET_IDS, "story target");
const STORY_EVENT_ID_SCHEMA = stringEnumSchema<StoryEventId>(KNOWN_STORY_EVENT_IDS, "story event");
const DIALOGUE_TREE_ID_SCHEMA = stringEnumSchema<DialogueTreeId>(KNOWN_DIALOGUE_TREE_IDS, "dialogue tree");
const ENEMY_ARCHETYPE_SCHEMA = stringEnumSchema<EnemyArchetype>(
  ENEMY_ARCHETYPE_AUTHORING_KEYS,
  "enemy archetype",
);
const SOUND_ID_SCHEMA = stringEnumSchema<SoundId>(AMBIENT_SOUND_IDS, "ambient sound id");
const EXAMINE_TEXT_ID_SCHEMA = stringEnumSchema<ExamineTextId>(KNOWN_EXAMINE_TEXT_IDS, "examine text");
const ITEM_KIND_SCHEMA = stringEnumSchema<ItemKind>(ITEM_KINDS, "item kind");
const DECORATION_KIND_SCHEMA = stringEnumSchema<DecorationKind>(DECORATION_KINDS, "decoration kind");
const ATTACK_FACING_REQUIREMENT_SCHEMA = stringEnumSchema(
  ATTACK_FACING_REQUIREMENT_AUTHORING_KEYS,
  "attack facing requirement",
);
const ATTACK_PATTERN_SCHEMA = stringEnumSchema(ATTACK_PATTERN_AUTHORING_KEYS, "attack pattern");
const ATTACK_TARGET_MODE_SCHEMA = stringEnumSchema(ATTACK_TARGET_MODE_AUTHORING_KEYS, "attack target mode");

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
}).strict() satisfies z.ZodType<AttackDef>;

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
  entityDefinition("sound", ["prefab", "soundId", "radius", "volume"], {
    soundId: SOUND_ID_SCHEMA,
    radius: UINT8_SCHEMA.min(1),
    volume: z.number().min(0).max(1).optional(),
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
  (typeof ENTITY_DEFINITIONS)[11]["schema"],
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
export type SoundDef = EntityDefFor<"sound">;

export const ENTITY_PREFABS = ENTITY_DEFINITIONS.map((definition) => definition.prefab) as readonly EntityPrefab[];
export const ENTITY_AUTHORING_PROPERTY_NAMES: ReadonlySet<string> = propertySet(
  ENTITY_DEFINITIONS.flatMap((definition) => definition.authoringProperties),
);
export const PREFAB_AUTHORING_PROPERTY_NAMES = Object.fromEntries(
  ENTITY_DEFINITIONS.map((definition) => [definition.prefab, propertySet(definition.authoringProperties)]),
) as Readonly<Record<EntityPrefab, ReadonlySet<string>>>;

const ENTITY_PREFAB_SET = new Set<string>(ENTITY_PREFABS);

const DIRECTIONS: Readonly<Record<string, number>> = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
};

/** Tiled flat attack_* properties → nested {@link AuthoringAttackDef} field names. */
const ATTACK_PROPERTY_MAP = {
  attackMinDamage: "minDamage",
  attackMaxDamage: "maxDamage",
  attackRange: "range",
  attackRequiresFacing: "requiresFacing",
  attackBonus: "attackBonus",
  attackCritThreshold: "critThreshold",
  attackCritMultiplier: "critMultiplier",
  attackPattern: "pattern",
  attackTargets: "targets",
} as const;

const DIALOGUE_TREE_NONE = "none";

export function mapEntityPrefab(value: string, context: string): EntityPrefab {
  if (isEntityPrefab(value)) return value;

  const lowered = lowerFirst(value);
  if (isEntityPrefab(lowered)) return lowered;

  throw new Error(`${context}: Unknown prefab "${value}".`);
}

/**
 * Reshape Tiled property bags into the shape {@link ENTITY_SCHEMA} expects
 * (aliases, attack nesting, sentinels). Validation stays in Zod.
 */
export function normalizeAuthoringProperties(
  prefab: EntityPrefab,
  properties: ReadonlyMap<string, unknown>,
  context: string,
): Record<string, unknown> {
  const raw: Record<string, unknown> = {};
  for (const [name, value] of properties) {
    if (name === "prefab" || name === "x" || name === "y") continue;
    raw[name] = value;
  }

  if (raw.dir === undefined && raw.facing !== undefined) raw.dir = raw.facing;
  delete raw.facing;
  if (typeof raw.dir === "string") {
    raw.dir = coerceLookup(DIRECTIONS, raw.dir, "direction", `${context} property "dir"`);
  }

  const attack: Record<string, unknown> = {};
  for (const [from, to] of Object.entries(ATTACK_PROPERTY_MAP)) {
    if (raw[from] === undefined) continue;
    attack[to] = raw[from];
    delete raw[from];
  }
  if (Object.keys(attack).length > 0) raw.attack = attack;

  if (raw.dialogueTreeId === DIALOGUE_TREE_NONE) delete raw.dialogueTreeId;

  if (prefab === "light" && typeof raw.color === "string") {
    raw.color = raw.color.toLowerCase();
  }

  if (prefab === "door" && raw.locked === true && raw.color === undefined) {
    throw new Error(`${context}: Locked door is missing key color.`);
  }

  return raw;
}

/** Build an unparsed entity object for {@link ENTITY_SCHEMA}. */
export function entityFromAuthoring(
  prefab: EntityPrefab,
  x: number,
  y: number,
  properties: ReadonlyMap<string, unknown>,
  context: string,
): Record<string, unknown> {
  return {
    prefab,
    x,
    y,
    ...normalizeAuthoringProperties(prefab, properties, context),
  };
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

/** Accepts the canonical id or its PascalCase form (`John` → `john`), matching prior knownString coerce. */
function stringEnumSchema<T extends string>(values: readonly T[], kind: string): z.ZodType<T> {
  return z.string().transform((value, ctx): T => {
    const mapped = values.find((candidate) => candidate === value || candidate === lowerFirst(value));
    if (mapped !== undefined) return mapped;
    ctx.addIssue({
      code: "custom",
      message: `Unknown ${kind} "${value}".`,
    });
    return z.NEVER;
  });
}
