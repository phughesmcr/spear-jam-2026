import { ENEMY_ARCHETYPE_KEYS, type EnemyArchetypeKey } from "@/src/game/content/enemies.ts";
import { DialogueTreeId } from "@/src/game/content/dialogue/trees.ts";
import { ExamineTextId } from "@/src/game/content/examine_text.ts";
import { MAP_ITEM_KINDS, type MapItemKind } from "@/src/game/content/items.ts";
import { DisplayName } from "@/src/game/content/names.ts";
import { StoryEventId, StoryTargetId } from "@/src/game/content/story.ts";
import { AMBIENT_SOUND_IDS, type SoundId } from "@/src/game/model/sound.ts";
import { ATTACK_PATTERN_KEYS, ATTACK_TARGET_MODE_KEYS, type AttackOverrides } from "@/src/game/model/attack.ts";
import { z } from "zod";

export const KeyColor = {
  Red: "red",
  Blue: "blue",
  Yellow: "yellow",
} as const;
export type KeyColor = (typeof KeyColor)[keyof typeof KeyColor];

export type DoorSlide = "north" | "east" | "south" | "west" | "up" | "down";
export const DOOR_SLIDES = ["north", "east", "south", "west", "up", "down"] as const satisfies readonly DoorSlide[];

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
const KEY_COLOR_SCHEMA = stringEnumSchema<KeyColor>(Object.values(KeyColor), "key color");
const DOOR_SLIDE_SCHEMA = stringEnumSchema<DoorSlide>(DOOR_SLIDES, "door slide");
const LIGHT_COLOR_SCHEMA = z.string().regex(/^#[0-9a-f]{6}$/);
const DISPLAY_NAME_SCHEMA = stringEnumSchema<DisplayName>(Object.values(DisplayName), "display name");
const STORY_TARGET_ID_SCHEMA = stringEnumSchema<StoryTargetId>(Object.values(StoryTargetId), "story target");
const STORY_EVENT_ID_SCHEMA = stringEnumSchema<StoryEventId>(Object.values(StoryEventId), "story event");
const DIALOGUE_TREE_ID_SCHEMA = stringEnumSchema<DialogueTreeId>(Object.values(DialogueTreeId), "dialogue tree");
const ENEMY_ARCHETYPE_SCHEMA = stringEnumSchema<EnemyArchetypeKey>(
  ENEMY_ARCHETYPE_KEYS,
  "enemy archetype",
);
const SOUND_ID_SCHEMA = stringEnumSchema<SoundId>(AMBIENT_SOUND_IDS, "ambient sound id");
const EXAMINE_TEXT_ID_SCHEMA = stringEnumSchema<ExamineTextId>(Object.values(ExamineTextId), "examine text");
const ITEM_KIND_SCHEMA = stringEnumSchema<MapItemKind>(MAP_ITEM_KINDS, "item kind");
const DECORATION_KIND_SCHEMA = stringEnumSchema<DecorationKind>(DECORATION_KINDS, "decoration kind");
const ATTACK_PATTERN_SCHEMA = stringEnumSchema(ATTACK_PATTERN_KEYS, "attack pattern");
const ATTACK_TARGET_MODE_SCHEMA = stringEnumSchema(ATTACK_TARGET_MODE_KEYS, "attack target mode");

const ATTACK_SCHEMA = z.object({
  minDamage: UINT8_SCHEMA.min(1).optional(),
  maxDamage: UINT8_SCHEMA.min(1).optional(),
  range: UINT8_SCHEMA.min(1).optional(),
  attackBonus: INT8_SCHEMA.optional(),
  critThreshold: UINT8_SCHEMA.min(1).optional(),
  critMultiplier: UINT8_SCHEMA.min(1).optional(),
  pattern: ATTACK_PATTERN_SCHEMA.optional(),
  targets: ATTACK_TARGET_MODE_SCHEMA.optional(),
}).strict() satisfies z.ZodType<AttackOverrides>;

const PLAYER_SCHEMA = entitySchema("player", { dir: DIRECTION_SCHEMA });
const NPC_SCHEMA = entitySchema("npc", {
  dir: DIRECTION_SCHEMA,
  displayName: DISPLAY_NAME_SCHEMA,
  dialogueTreeId: DIALOGUE_TREE_ID_SCHEMA.optional(),
  examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
  storyId: STORY_TARGET_ID_SCHEMA.optional(),
  onTalkEvent: STORY_EVENT_ID_SCHEMA.optional(),
});
const ENEMY_SCHEMA = entitySchema("enemy", {
  dir: DIRECTION_SCHEMA,
  displayName: DISPLAY_NAME_SCHEMA.optional(),
  archetype: ENEMY_ARCHETYPE_SCHEMA.optional(),
  health: UINT8_SCHEMA.min(1).optional(),
  hitDc: UINT8_SCHEMA.min(1).optional(),
  damage: UINT8_SCHEMA.min(1).optional(),
  attack: ATTACK_SCHEMA.optional(),
  examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
});
const DOOR_SCHEMA = entitySchema("door", {
  locked: z.boolean().optional(),
  color: KEY_COLOR_SCHEMA.optional(),
  slide: DOOR_SLIDE_SCHEMA.optional(),
  openMs: UINT16_SCHEMA.min(1).optional(),
  secret: z.boolean().optional(),
  glass: z.boolean().optional(),
  examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
});
const KEY_SCHEMA = entitySchema("key", { color: KEY_COLOR_SCHEMA });
const UPLINK_CODE_SCHEMA = entitySchema("uplinkCode", {});
const UPLINK_TERMINAL_SCHEMA = entitySchema("uplinkTerminal", {
  goto: z.string().min(1),
  examineTextId: EXAMINE_TEXT_ID_SCHEMA.optional(),
  requiresSpear: z.boolean().optional(),
});
const WEAPON_PICKUP_SCHEMA = entitySchema("weaponPickup", { slot: z.union([z.literal(2), z.literal(3)]) });
const ITEM_SCHEMA = entitySchema("item", {
  item: ITEM_KIND_SCHEMA,
  amount: UINT8_SCHEMA.min(1),
});
const DECORATION_SCHEMA = entitySchema("decoration", { decoration: DECORATION_KIND_SCHEMA });
const LIGHT_SCHEMA = entitySchema("light", {
  color: LIGHT_COLOR_SCHEMA,
  radius: UINT8_SCHEMA.min(1),
  flickerAmount: z.number().min(0).max(1).optional(),
  flickerSpeed: z.number().positive().optional(),
});
const SOUND_SCHEMA = entitySchema("sound", {
  soundId: SOUND_ID_SCHEMA,
  radius: UINT8_SCHEMA.min(1),
  volume: z.number().min(0).max(1).optional(),
});
const SPEAR_PICKUP_SCHEMA = entitySchema("spearPickup", {});
const SPEAR_TURRET_SCHEMA = entitySchema("spearTurret", {});

export const ENTITY_SCHEMA = z.discriminatedUnion("prefab", [
  PLAYER_SCHEMA,
  NPC_SCHEMA,
  ENEMY_SCHEMA,
  DOOR_SCHEMA,
  KEY_SCHEMA,
  UPLINK_CODE_SCHEMA,
  UPLINK_TERMINAL_SCHEMA,
  WEAPON_PICKUP_SCHEMA,
  ITEM_SCHEMA,
  DECORATION_SCHEMA,
  LIGHT_SCHEMA,
  SOUND_SCHEMA,
  SPEAR_PICKUP_SCHEMA,
  SPEAR_TURRET_SCHEMA,
]);

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

const BLOCKING_PREFABS: ReadonlySet<EntityPrefab> = new Set([
  "player",
  "npc",
  "enemy",
  "door",
  "uplinkTerminal",
  "spearTurret",
]);

export function prefabBlocksMovement(prefab: EntityPrefab): boolean {
  return BLOCKING_PREFABS.has(prefab);
}

function entitySchema<Name extends EntityPrefab, Shape extends z.ZodRawShape>(prefab: Name, shape: Shape) {
  return z.object({
    prefab: z.literal(prefab),
    x: NON_NEGATIVE_INTEGER_SCHEMA,
    y: NON_NEGATIVE_INTEGER_SCHEMA,
    ...shape,
  }).strict();
}

function stringEnumSchema<T extends string>(values: readonly T[], kind: string): z.ZodType<T> {
  return z.string().transform((value, context): T => {
    const match = values.find((candidate) => candidate === value);
    if (match !== undefined) return match;
    context.addIssue({
      code: "custom",
      message: `Unknown ${kind} "${value}".`,
    });
    return z.NEVER;
  });
}
