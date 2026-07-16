import { type AttackDef, AttackPattern } from "@/src/game/model/attack.ts";
import type { DisplayName } from "@/src/game/content/names.ts";
import type { SoundId as SoundIdType } from "@/src/game/model/sound.ts";

export const EnemyArchetypeCode = {
  MeleeDog: 1,
  Gunslinger: 2,
  NetworkNeophyte: 3,
  SystemSentinel: 4,
  AgenticAcolyte: 5,
} as const;
export type EnemyArchetypeCode = (typeof EnemyArchetypeCode)[keyof typeof EnemyArchetypeCode];

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

export type EnemySenses = {
  readonly sightRadius: number;
  readonly hearingRadius: number;
};

export type EnemyIdleSoundProfile = {
  readonly soundId: SoundIdType;
  readonly radius: number;
  readonly volume: number;
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
};

export type EnemySoundProfile = {
  readonly idle: EnemyIdleSoundProfile;
  readonly alert: SoundIdType;
  readonly attack: SoundIdType;
  readonly hurt: SoundIdType;
  readonly defeat: SoundIdType;
};

export type EnemyCatalogEntry = {
  readonly displayName: DisplayName;
  readonly health: number;
  readonly hitDc: number;
  readonly damage: number;
  readonly attack: Readonly<AttackDef>;
  readonly behavior: EnemyBehaviorPolicy;
  readonly senses: EnemySenses;
  readonly sounds: EnemySoundProfile;
};

export type EnemyArchetypeKey =
  | "meleeDog"
  | "gunslinger"
  | "networkNeophyte"
  | "systemSentinel"
  | "agenticAcolyte";

export const ENEMY_ARCHETYPE_KEYS = [
  "meleeDog",
  "gunslinger",
  "networkNeophyte",
  "systemSentinel",
  "agenticAcolyte",
] as const satisfies readonly EnemyArchetypeKey[];

export function enemyAttackFacesTarget(pattern: AttackPattern): boolean {
  return pattern === AttackPattern.Line;
}
