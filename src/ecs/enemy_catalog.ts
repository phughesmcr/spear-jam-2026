import {
  DEFAULT_ENEMY_ARCHETYPE,
  ENEMY_ARCHETYPE_CODES,
  type EnemyArchetype as EnemyArchetypeType,
  EnemyArchetype as EnemyArchetypeValues,
  enemyArchetypeAuthoringKey,
  enemyArchetypeForAuthoringKey,
  enemyArchetypeForCode,
} from "@/src/content/enemies.ts";
import { type AttackDef, AttackFacingRequirement, AttackPattern, AttackTargetMode } from "@/src/game/attack.ts";
import { DisplayName } from "@/src/game/names.ts";
import { SoundId, type SoundId as SoundIdType } from "@/src/game/sound.ts";

export {
  DEFAULT_ENEMY_ARCHETYPE,
  ENEMY_ARCHETYPE_CODES,
  enemyArchetypeAuthoringKey,
  enemyArchetypeForAuthoringKey,
  enemyArchetypeForCode,
};

export const EnemyArchetype = EnemyArchetypeValues;
export type EnemyArchetype = EnemyArchetypeType;

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

export const ENEMY_CATALOG = {
  [EnemyArchetype.MeleeDog]: {
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
  [EnemyArchetype.Gunslinger]: {
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
  [EnemyArchetype.NetworkNeophyte]: {
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
  [EnemyArchetype.SystemSentinel]: {
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
  [EnemyArchetype.AgenticAcolyte]: {
    displayName: DisplayName.AgenticAcolyte,
    health: 6,
    hitDc: 10,
    damage: 2,
    attack: {
      requiresFacing: AttackFacingRequirement.None,
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
} as const satisfies Readonly<Record<EnemyArchetypeType, EnemyCatalogEntry>>;

export function enemyCatalogEntry(archetype: EnemyArchetypeType): EnemyCatalogEntry {
  return ENEMY_CATALOG[archetype];
}
