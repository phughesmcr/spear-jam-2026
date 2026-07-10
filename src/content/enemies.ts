import { SpriteId, type SpriteId as SpriteIdType } from "@/src/content/sprite_ids.ts";
import { type AttackDef, AttackPattern, AttackTargetMode } from "@/src/game/attack.ts";
import { DisplayName } from "@/src/game/names.ts";
import { SoundId, type SoundId as SoundIdType } from "@/src/game/sound.ts";
import { createCodeRegistry } from "@/src/utils/code_registry.ts";

export const EnemyArchetypeCode = {
  MeleeDog: 1,
  Gunslinger: 2,
  NetworkNeophyte: 3,
  SystemSentinel: 4,
  AgenticAcolyte: 5,
} as const;
export type EnemyArchetypeCode = (typeof EnemyArchetypeCode)[keyof typeof EnemyArchetypeCode];

export const ENEMY_ARCHETYPE_CODES = [
  EnemyArchetypeCode.MeleeDog,
  EnemyArchetypeCode.Gunslinger,
  EnemyArchetypeCode.NetworkNeophyte,
  EnemyArchetypeCode.SystemSentinel,
  EnemyArchetypeCode.AgenticAcolyte,
] as const satisfies readonly EnemyArchetypeCode[];

export const DEFAULT_ENEMY_ARCHETYPE = EnemyArchetypeCode.MeleeDog;

export type EnemyBehaviorPolicy = {
  readonly alert: EnemyAlertPolicy;
  readonly investigate: EnemyInvestigatePolicy;
};

export type EnemyAlertPolicy =
  | { readonly type: "advance"; readonly steps: number; readonly attackAfterMove?: boolean }
  | { readonly type: "skirmish"; readonly retreatRange: number; readonly advanceSteps: number }
  | { readonly type: "hold" };

export type EnemyInvestigatePolicy =
  | { readonly type: "move"; readonly steps: number }
  | { readonly type: "watch" };

export const DEFAULT_ENEMY_BEHAVIOR_POLICY: EnemyBehaviorPolicy = {
  alert: { type: "advance", steps: 1 },
  investigate: { type: "move", steps: 1 },
};

export type EnemySenses = {
  readonly sightRadius: number;
  readonly hearingRadius: number;
};

export const DEFAULT_ENEMY_SENSES: EnemySenses = {
  sightRadius: 5,
  hearingRadius: 7,
};

export type EnemyIdleSoundProfile = {
  readonly soundId: SoundIdType;
  readonly radius: number;
  readonly volume: number;
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
};

export const DEFAULT_ENEMY_IDLE_SOUND: EnemyIdleSoundProfile = {
  soundId: SoundId.EnemyIdle,
  radius: 5,
  volume: 0.42,
  minDelayMs: 7000,
  maxDelayMs: 14000,
};

export type EnemyCatalogEntry = {
  readonly displayName: DisplayName;
  readonly health: number;
  readonly hitDc: number;
  readonly damage: number;
  readonly attack: Readonly<Partial<AttackDef>>;
  readonly behavior: EnemyBehaviorPolicy;
  readonly senses: EnemySenses;
  readonly idleSound: EnemyIdleSoundProfile;
};

export type EnemyArchetypeKey =
  | "meleeDog"
  | "gunslinger"
  | "networkNeophyte"
  | "systemSentinel"
  | "agenticAcolyte";

export const ENEMY_ARCHETYPE_AUTHORING_KEYS = [
  "meleeDog",
  "gunslinger",
  "networkNeophyte",
  "systemSentinel",
  "agenticAcolyte",
] as const satisfies readonly EnemyArchetypeKey[];

type EnemyArchetypeDefinition = {
  readonly code: EnemyArchetypeCode;
  readonly authoringKey: EnemyArchetypeKey;
  readonly spriteId: SpriteIdType;
  readonly catalog: EnemyCatalogEntry;
};

const ENEMY_ARCHETYPE_DEFINITIONS = [
  {
    code: EnemyArchetypeCode.MeleeDog,
    authoringKey: "meleeDog",
    spriteId: SpriteId.DigitalDog,
    catalog: {
      displayName: DisplayName.DigitalDog,
      health: 2,
      hitDc: 10,
      damage: 1,
      attack: {
        attackBonus: 4,
        range: 1,
      },
      behavior: {
        alert: { type: "advance", steps: 2, attackAfterMove: true },
        investigate: { type: "move", steps: 1 },
      },
      senses: { ...DEFAULT_ENEMY_SENSES, sightRadius: 4 },
      idleSound: DEFAULT_ENEMY_IDLE_SOUND,
    },
  },
  {
    code: EnemyArchetypeCode.Gunslinger,
    authoringKey: "gunslinger",
    spriteId: SpriteId.GigabitGunslinger,
    catalog: {
      displayName: DisplayName.GigabitGunslinger,
      health: 4,
      hitDc: 10,
      damage: 1,
      attack: {
        attackBonus: 3,
        range: 3,
      },
      behavior: {
        alert: { type: "skirmish", retreatRange: 1, advanceSteps: 1 },
        investigate: { type: "move", steps: 1 },
      },
      senses: { ...DEFAULT_ENEMY_SENSES, hearingRadius: 6 },
      idleSound: DEFAULT_ENEMY_IDLE_SOUND,
    },
  },
  {
    code: EnemyArchetypeCode.NetworkNeophyte,
    authoringKey: "networkNeophyte",
    spriteId: SpriteId.NetworkNeophyte,
    catalog: {
      displayName: DisplayName.NetworkNeophyte,
      health: 6,
      hitDc: 10,
      damage: 1,
      attack: {
        attackBonus: 2,
        range: 3,
      },
      behavior: {
        alert: { type: "skirmish", retreatRange: 2, advanceSteps: 1 },
        investigate: { type: "move", steps: 1 },
      },
      senses: { ...DEFAULT_ENEMY_SENSES },
      idleSound: DEFAULT_ENEMY_IDLE_SOUND,
    },
  },
  {
    code: EnemyArchetypeCode.SystemSentinel,
    authoringKey: "systemSentinel",
    spriteId: SpriteId.SystemSentinel,
    catalog: {
      displayName: DisplayName.SystemSentinel,
      health: 10,
      hitDc: 10,
      damage: 2,
      attack: {
        attackBonus: 4,
        range: 1,
      },
      behavior: {
        alert: { type: "hold" },
        investigate: { type: "watch" },
      },
      senses: { sightRadius: 1, hearingRadius: 1 },
      idleSound: DEFAULT_ENEMY_IDLE_SOUND,
    },
  },
  {
    code: EnemyArchetypeCode.AgenticAcolyte,
    authoringKey: "agenticAcolyte",
    spriteId: SpriteId.AgenticAcolyte,
    catalog: {
      displayName: DisplayName.AgenticAcolyte,
      health: 6,
      hitDc: 10,
      damage: 2,
      attack: {
        attackBonus: 3,
        range: 2,
        pattern: AttackPattern.Adjacent,
        targets: AttackTargetMode.All,
      },
      behavior: {
        alert: { type: "advance", steps: 1, attackAfterMove: true },
        investigate: { type: "move", steps: 1 },
      },
      senses: { ...DEFAULT_ENEMY_SENSES },
      idleSound: DEFAULT_ENEMY_IDLE_SOUND,
    },
  },
] as const satisfies readonly EnemyArchetypeDefinition[];

const ENEMY_ARCHETYPE_KEYS_BY_CODE = Object.fromEntries(
  ENEMY_ARCHETYPE_DEFINITIONS.map((definition) => [definition.code, definition.authoringKey]),
) as Readonly<Record<EnemyArchetypeCode, EnemyArchetypeKey>>;

const ENEMY_SPRITE_IDS_BY_CODE = Object.fromEntries(
  ENEMY_ARCHETYPE_DEFINITIONS.map((definition) => [definition.code, definition.spriteId]),
) as Readonly<Record<EnemyArchetypeCode, SpriteIdType>>;

const ENEMY_CATALOG_BY_CODE = Object.fromEntries(
  ENEMY_ARCHETYPE_DEFINITIONS.map((definition) => [definition.code, definition.catalog]),
) as Readonly<Record<EnemyArchetypeCode, EnemyCatalogEntry>>;

const ENEMY_ARCHETYPE_REGISTRY = createCodeRegistry("enemy archetype", ENEMY_ARCHETYPE_AUTHORING_KEYS);

export function enemyArchetypeAuthoringKey(archetype: EnemyArchetypeCode): EnemyArchetypeKey {
  return ENEMY_ARCHETYPE_KEYS_BY_CODE[archetype];
}

export function enemyArchetypeForAuthoringKey(authoringKey: EnemyArchetypeKey): EnemyArchetypeCode {
  return ENEMY_ARCHETYPE_REGISTRY.encode(authoringKey) as EnemyArchetypeCode;
}

export function enemyArchetypeForCode(archetype: number): EnemyArchetypeCode {
  ENEMY_ARCHETYPE_REGISTRY.decode(archetype);
  return archetype as EnemyArchetypeCode;
}

export function enemyCatalogEntry(archetype: EnemyArchetypeCode): EnemyCatalogEntry {
  return ENEMY_CATALOG_BY_CODE[archetype];
}

export function spriteIdForEnemyArchetype(archetype: EnemyArchetypeCode): SpriteIdType {
  return ENEMY_SPRITE_IDS_BY_CODE[archetype];
}

export function enemyAttackFacesTarget(pattern: AttackPattern): boolean {
  return pattern === AttackPattern.Line;
}
