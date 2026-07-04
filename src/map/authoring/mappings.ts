import { DialogueTreeId, type DialogueTreeId as DialogueTreeIdType } from "@/src/dialogue/dialogue.ts";
import {
  AttackFacingRequirement,
  type AttackFacingRequirement as AttackFacingRequirementType,
  AttackPattern,
  type AttackPattern as AttackPatternType,
  AttackTargetMode,
  type AttackTargetMode as AttackTargetModeType,
} from "@/src/game/attack.ts";
import {
  ENEMY_ARCHETYPE_CODES,
  type EnemyArchetype as EnemyArchetypeType,
  enemyCatalogEntry,
} from "@/src/ecs/enemy_catalog.ts";
import { ExamineTextId, type ExamineTextId as ExamineTextIdType } from "@/src/game/examine.ts";
import { ItemKind, type ItemKind as ItemKindType } from "@/src/game/items.ts";
import { DisplayName, type DisplayName as DisplayNameType } from "@/src/game/names.ts";
import { type DoorSlide, KeyColor, type KeyColor as KeyColorType } from "@/src/map/map.ts";

const DIRECTIONS: Readonly<Record<string, number>> = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
};

const DISPLAY_NAMES: Readonly<Record<string, DisplayNameType>> = {
  john: DisplayName.John,
  digitalDog: DisplayName.DigitalDog,
  gigabitGunslinger: DisplayName.GigabitGunslinger,
  networkNeophyte: DisplayName.NetworkNeophyte,
  systemSentinel: DisplayName.SystemSentinel,
  agenticAcolyte: DisplayName.AgenticAcolyte,
};

const DIALOGUE_TREE_IDS: Readonly<Record<string, DialogueTreeIdType>> = {
  none: DialogueTreeId.None,
  johnIntro: DialogueTreeId.JohnIntro,
};

const EXAMINE_TEXT_IDS: Readonly<Record<string, ExamineTextIdType>> = {
  bootSectorUplinkTerminal: ExamineTextId.BootSectorUplinkTerminal,
};

const ENEMY_ARCHETYPES: Readonly<Record<string, EnemyArchetypeType>> = Object.fromEntries(
  ENEMY_ARCHETYPE_CODES.map((archetype) => [enemyCatalogEntry(archetype).authoringKey, archetype]),
);

const KEY_COLORS: Readonly<Record<string, KeyColorType>> = {
  red: KeyColor.Red,
  blue: KeyColor.Blue,
  yellow: KeyColor.Yellow,
};

const DOOR_SLIDES: Readonly<Record<string, DoorSlide>> = {
  north: "north",
  east: "east",
  south: "south",
  west: "west",
  up: "up",
  down: "down",
};

const ITEM_KINDS: Readonly<Record<string, ItemKindType>> = {
  healthPatch: ItemKind.HealthPatch,
  pistolAmmo: ItemKind.PistolAmmo,
  cannonAmmo: ItemKind.CannonAmmo,
  key: ItemKind.Key,
  uplinkCode: ItemKind.UplinkCode,
  weapon: ItemKind.Weapon,
};

const ATTACK_PATTERNS: Readonly<Record<string, AttackPatternType>> = {
  line: AttackPattern.Line,
  adjacent: AttackPattern.Adjacent,
};

const ATTACK_TARGETS: Readonly<Record<string, AttackTargetModeType>> = {
  first: AttackTargetMode.First,
  all: AttackTargetMode.All,
};

const ATTACK_FACING_REQUIREMENTS: Readonly<Record<string, AttackFacingRequirementType>> = {
  required: AttackFacingRequirement.Required,
  none: AttackFacingRequirement.None,
};

export function mapDirection(value: string, context: string): number {
  return lookup(DIRECTIONS, value, "direction", context);
}

export function mapDisplayName(value: string, context: string): DisplayNameType {
  return lookup(DISPLAY_NAMES, value, "display name", context);
}

export function mapDialogueTreeId(value: string, context: string): DialogueTreeIdType {
  return lookup(DIALOGUE_TREE_IDS, value, "dialogue tree", context);
}

export function mapExamineTextId(value: string, context: string): ExamineTextIdType {
  return lookup(EXAMINE_TEXT_IDS, value, "examine text", context);
}

export function mapEnemyArchetype(value: string, context: string): EnemyArchetypeType {
  return lookup(ENEMY_ARCHETYPES, value, "enemy archetype", context);
}

export function mapKeyColor(value: string, context: string): KeyColorType {
  return lookup(KEY_COLORS, value, "key color", context);
}

export function mapDoorSlide(value: string, context: string): DoorSlide {
  return lookup(DOOR_SLIDES, value, "door slide", context);
}

export function mapItemKind(value: string, context: string): ItemKindType {
  return lookup(ITEM_KINDS, value, "item kind", context);
}

export function mapAttackPattern(value: string, context: string): AttackPatternType {
  return lookup(ATTACK_PATTERNS, value, "attack pattern", context);
}

export function mapAttackTargets(value: string, context: string): AttackTargetModeType {
  return lookup(ATTACK_TARGETS, value, "attack target mode", context);
}

export function mapAttackFacingRequirement(value: string, context: string): AttackFacingRequirementType {
  return lookup(ATTACK_FACING_REQUIREMENTS, value, "attack facing requirement", context);
}

function lookup<T>(table: Readonly<Record<string, T>>, value: string, kind: string, context: string): T {
  const mapped = table[value] ?? table[lowerFirst(value)];
  if (mapped === undefined) throw new Error(`${context}: Unknown ${kind} "${value}".`);
  return mapped;
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toLowerCase()}${value.slice(1)}`;
}
