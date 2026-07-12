import {
  AMBIENT_SOUND_IDS,
  type DialogueTreeId,
  type DisplayName,
  ENEMY_ARCHETYPE_AUTHORING_KEYS,
  type EnemyArchetypeKey,
  type ExamineTextId,
  KNOWN_DIALOGUE_TREE_IDS,
  KNOWN_DISPLAY_NAMES,
  KNOWN_EXAMINE_TEXT_IDS,
  KNOWN_STORY_EVENT_IDS,
  KNOWN_STORY_TARGET_IDS,
  type SoundId as KnownSoundId,
  type StoryEventId,
  type StoryTargetId,
} from "@/src/content/known_ids.ts";
import {
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

export type { DialogueTreeId, DisplayName, ExamineTextId, StoryEventId, StoryTargetId };
/** Authoring enemy archetype key; runtime numeric codes live in {@link "@/src/content/enemies.ts"}. */
export type EnemyArchetype = EnemyArchetypeKey;
export type SoundId = KnownSoundId;
export const ITEM_KINDS = ["healthPatch", "pistolAmmo", "cannonAmmo"] as const;
/** Authoring pickup kind strings; runtime ECS codes live in {@link "@/src/content/items.ts"}. */
export type ItemKind = (typeof ITEM_KINDS)[number];
export const DECORATION_KINDS = [
  "serverPile",
  "cyborg",
  "ceilingHook",
  "ceilingLight",
  "ceilingWires",
  "mainframeCore",
  "tree1",
  "tree2",
  "tree3",
] as const;
export type DecorationKind = (typeof DECORATION_KINDS)[number];

export type EntityPrefab =
  | "player"
  | "npc"
  | "enemy"
  | "door"
  | "key"
  | "uplinkCode"
  | "uplinkTerminal"
  | "weaponPickup"
  | "item"
  | "decoration"
  | "light"
  | "sound"
  | "spearPickup"
  | "spearTurret";

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
const ATTACK_PATTERN_SCHEMA = stringEnumSchema(ATTACK_PATTERN_AUTHORING_KEYS, "attack pattern");
const ATTACK_TARGET_MODE_SCHEMA = stringEnumSchema(ATTACK_TARGET_MODE_AUTHORING_KEYS, "attack target mode");

const ATTACK_SCHEMA = z.object({
  minDamage: UINT8_SCHEMA.min(1).optional(),
  maxDamage: UINT8_SCHEMA.min(1).optional(),
  range: UINT8_SCHEMA.min(1).optional(),
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

/** Tiled flat attack_* properties → nested {@link AuthoringAttackDef} field names. */
export const ATTACK_PROPERTY_MAP = {
  attackMinDamage: "minDamage",
  attackMaxDamage: "maxDamage",
  attackRange: "range",
  attackBonus: "attackBonus",
  attackCritThreshold: "critThreshold",
  attackCritMultiplier: "critMultiplier",
  attackPattern: "pattern",
  attackTargets: "targets",
} as const;

export type EntityDescriptor = {
  readonly prefab: EntityPrefab;
  readonly authoringProperties: readonly string[];
  readonly normalizedFields: readonly string[];
  readonly blockingMovement: boolean;
  readonly marker: EntityPrefab;
  readonly schema: z.ZodObject<z.ZodRawShape>;
};

const ENTITY_DESCRIPTORS_INTERNAL = [
  entityDescriptor("player", ["prefab", "dir", "facing"], true, {
    dir: DIRECTION_SCHEMA,
  }),
  entityDescriptor(
    "npc",
    ["prefab", "dir", "facing", "displayName", "dialogueTreeId", "examineTextId", "storyId", "onTalkEvent"],
    true,
    {
      dir: DIRECTION_SCHEMA,
      displayName: DISPLAY_NAME_SCHEMA,
      dialogueTreeId: DIALOGUE_TREE_ID_SCHEMA.optional(),
      examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
      storyId: STORY_TARGET_ID_SCHEMA.optional(),
      onTalkEvent: STORY_EVENT_ID_SCHEMA.optional(),
    },
  ),
  entityDescriptor(
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
      "attackBonus",
      "attackCritThreshold",
      "attackCritMultiplier",
      "attackPattern",
      "attackTargets",
      "examineTextId",
    ],
    true,
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
  entityDescriptor(
    "door",
    ["prefab", "locked", "color", "slide", "openMs", "secret", "glass", "examineTextId"],
    true,
    {
      locked: z.boolean().optional(),
      color: KEY_COLOR_SCHEMA.optional(),
      slide: DOOR_SLIDE_SCHEMA.optional(),
      openMs: UINT16_SCHEMA.min(1).optional(),
      secret: z.boolean().optional(),
      glass: z.boolean().optional(),
      examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
    },
  ),
  entityDescriptor("key", ["prefab", "color"], false, {
    color: KEY_COLOR_SCHEMA,
  }),
  entityDescriptor("uplinkCode", ["prefab"], false, {}),
  entityDescriptor("uplinkTerminal", ["prefab", "goto", "examineTextId", "requiresSpear"], true, {
    goto: z.string().min(1),
    examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
    requiresSpear: z.boolean().optional(),
  }),
  entityDescriptor("weaponPickup", ["prefab", "slot"], false, {
    slot: z.union([z.literal(2), z.literal(3)]),
  }),
  entityDescriptor("item", ["prefab", "item", "amount"], false, {
    item: ITEM_KIND_SCHEMA,
    amount: UINT8_SCHEMA.min(1),
  }),
  entityDescriptor("decoration", ["prefab", "decoration"], false, {
    decoration: DECORATION_KIND_SCHEMA,
  }),
  entityDescriptor("light", ["prefab", "color", "radius", "flickerAmount", "flickerSpeed"], false, {
    color: LIGHT_COLOR_SCHEMA,
    radius: UINT8_SCHEMA.min(1),
    flickerAmount: z.number().min(0).max(1).optional(),
    flickerSpeed: z.number().positive().optional(),
  }),
  entityDescriptor("sound", ["prefab", "soundId", "radius", "volume"], false, {
    soundId: SOUND_ID_SCHEMA,
    radius: UINT8_SCHEMA.min(1),
    volume: z.number().min(0).max(1).optional(),
  }),
  entityDescriptor("spearPickup", ["prefab"], false, {}),
  entityDescriptor("spearTurret", ["prefab"], true, {}),
] as const;

export const ENTITY_DESCRIPTORS: readonly EntityDescriptor[] = ENTITY_DESCRIPTORS_INTERNAL;

const ENTITY_SCHEMAS = ENTITY_DESCRIPTORS_INTERNAL.map((descriptor) => descriptor.schema) as [
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[0]["schema"],
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[1]["schema"],
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[2]["schema"],
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[3]["schema"],
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[4]["schema"],
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[5]["schema"],
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[6]["schema"],
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[7]["schema"],
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[8]["schema"],
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[9]["schema"],
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[10]["schema"],
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[11]["schema"],
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[12]["schema"],
  (typeof ENTITY_DESCRIPTORS_INTERNAL)[13]["schema"],
];

export const ENTITY_SCHEMA = z.discriminatedUnion("prefab", ENTITY_SCHEMAS);

export type EntityDef = z.infer<typeof ENTITY_SCHEMA>;
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
export type SpearPickupDef = EntityDefFor<"spearPickup">;
export type SpearTurretDef = EntityDefFor<"spearTurret">;

export const ENTITY_PREFABS = ENTITY_DESCRIPTORS.map((descriptor) => descriptor.prefab) as readonly EntityPrefab[];
export const ENTITY_AUTHORING_PROPERTY_NAMES: ReadonlySet<string> = propertySet(
  ENTITY_DESCRIPTORS.flatMap((descriptor) => descriptor.authoringProperties),
);
export const PREFAB_AUTHORING_PROPERTY_NAMES = Object.fromEntries(
  ENTITY_DESCRIPTORS.map((descriptor) => [descriptor.prefab, propertySet(descriptor.authoringProperties)]),
) as Readonly<Record<EntityPrefab, ReadonlySet<string>>>;

const ENTITY_PREFAB_SET = new Set<string>(ENTITY_PREFABS);
const BLOCKING_PREFABS = new Set(
  ENTITY_DESCRIPTORS.filter((descriptor) => descriptor.blockingMovement).map((descriptor) => descriptor.prefab),
);

const DIRECTIONS: Readonly<Record<string, number>> = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
};

const DIALOGUE_TREE_NONE = "none";

export function descriptorForPrefab(prefab: EntityPrefab): EntityDescriptor {
  const descriptor = ENTITY_DESCRIPTORS.find((candidate) => candidate.prefab === prefab);
  if (descriptor === undefined) throw new Error(`Unknown entity prefab "${prefab}".`);
  return descriptor;
}

export function prefabBlocksMovement(prefab: EntityPrefab): boolean {
  return BLOCKING_PREFABS.has(prefab);
}

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

function entityDescriptor<Name extends EntityPrefab, Shape extends z.ZodRawShape>(
  prefab: Name,
  authoringProperties: readonly string[],
  blockingMovement: boolean,
  shape: Shape,
) {
  const schema = z.object({
    prefab: z.literal(prefab),
    ...BASE_ENTITY_SCHEMA,
    ...shape,
  }).strict();
  return {
    prefab,
    authoringProperties,
    normalizedFields: Object.keys(shape),
    blockingMovement,
    marker: prefab,
    schema,
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
