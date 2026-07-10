import { createCodeRegistry } from "@/src/utils/code_registry.ts";
import { lowerFirst } from "@/src/utils/strings.ts";

export const AttackPattern = {
  Line: 1,
  Adjacent: 2,
} as const;
export type AttackPattern = (typeof AttackPattern)[keyof typeof AttackPattern];

export const AttackTargetMode = {
  First: 1,
  All: 2,
} as const;
export type AttackTargetMode = (typeof AttackTargetMode)[keyof typeof AttackTargetMode];

export type AttackDef = {
  minDamage: number;
  maxDamage: number;
  range: number;
  attackBonus: number;
  critThreshold: number;
  critMultiplier: number;
  pattern: AttackPattern;
  targets: AttackTargetMode;
};

export const DEFAULT_ATTACK: AttackDef = {
  minDamage: 1,
  maxDamage: 1,
  range: 1,
  attackBonus: 2,
  critThreshold: 20,
  critMultiplier: 2,
  pattern: AttackPattern.Line,
  targets: AttackTargetMode.First,
};

export const ATTACK_PATTERN_CODES = [AttackPattern.Line, AttackPattern.Adjacent] as const;
export const ATTACK_TARGET_MODE_CODES = [AttackTargetMode.First, AttackTargetMode.All] as const;

const ATTACK_PATTERN_AUTHORING_BY_CODE = {
  [AttackPattern.Line]: "line",
  [AttackPattern.Adjacent]: "adjacent",
} as const satisfies Readonly<Record<AttackPattern, string>>;

const ATTACK_TARGET_MODE_AUTHORING_BY_CODE = {
  [AttackTargetMode.First]: "first",
  [AttackTargetMode.All]: "all",
} as const satisfies Readonly<Record<AttackTargetMode, string>>;

/** Tiled / EntityDef string values; order matches {@link ATTACK_PATTERN_CODES}. */
export const ATTACK_PATTERN_AUTHORING_KEYS = ATTACK_PATTERN_CODES.map(
  (code) => ATTACK_PATTERN_AUTHORING_BY_CODE[code],
);
/** Tiled / EntityDef string values; order matches {@link ATTACK_TARGET_MODE_CODES}. */
export const ATTACK_TARGET_MODE_AUTHORING_KEYS = ATTACK_TARGET_MODE_CODES.map(
  (code) => ATTACK_TARGET_MODE_AUTHORING_BY_CODE[code],
);

export type AttackPatternAuthoring = (typeof ATTACK_PATTERN_AUTHORING_BY_CODE)[AttackPattern];
export type AttackTargetModeAuthoring = (typeof ATTACK_TARGET_MODE_AUTHORING_BY_CODE)[AttackTargetMode];

/** Authoring-side attack override; string enums map to {@link AttackDef} codes at spawn. */
export type AuthoringAttackDef = {
  readonly minDamage?: number;
  readonly maxDamage?: number;
  readonly range?: number;
  readonly attackBonus?: number;
  readonly critThreshold?: number;
  readonly critMultiplier?: number;
  readonly pattern?: AttackPatternAuthoring;
  readonly targets?: AttackTargetModeAuthoring;
};

const ATTACK_PATTERN_REGISTRY = createCodeRegistry("attack pattern", ATTACK_PATTERN_AUTHORING_KEYS);
const ATTACK_TARGET_MODE_REGISTRY = createCodeRegistry("attack target mode", ATTACK_TARGET_MODE_AUTHORING_KEYS);

export function attackPatternAuthoringKey(pattern: AttackPattern): AttackPatternAuthoring {
  return ATTACK_PATTERN_AUTHORING_BY_CODE[pattern];
}

export function attackTargetModeAuthoringKey(targets: AttackTargetMode): AttackTargetModeAuthoring {
  return ATTACK_TARGET_MODE_AUTHORING_BY_CODE[targets];
}

export function attackPatternForAuthoringKey(authoringKey: string): AttackPattern {
  const key = ATTACK_PATTERN_REGISTRY.has(authoringKey) ? authoringKey : lowerFirst(authoringKey);
  if (!ATTACK_PATTERN_REGISTRY.has(key)) throw new Error(`Unknown attack pattern "${authoringKey}".`);
  return ATTACK_PATTERN_REGISTRY.encode(key) as AttackPattern;
}

export function attackTargetModeForAuthoringKey(authoringKey: string): AttackTargetMode {
  const key = ATTACK_TARGET_MODE_REGISTRY.has(authoringKey) ? authoringKey : lowerFirst(authoringKey);
  if (!ATTACK_TARGET_MODE_REGISTRY.has(key)) throw new Error(`Unknown attack target mode "${authoringKey}".`);
  return ATTACK_TARGET_MODE_REGISTRY.encode(key) as AttackTargetMode;
}

export function attackDefFromAuthoring(attack: AuthoringAttackDef | undefined): Partial<AttackDef> {
  if (attack === undefined) return {};
  const spec: Partial<AttackDef> = {};
  if (attack.minDamage !== undefined) spec.minDamage = attack.minDamage;
  if (attack.maxDamage !== undefined) spec.maxDamage = attack.maxDamage;
  if (attack.range !== undefined) spec.range = attack.range;
  if (attack.attackBonus !== undefined) spec.attackBonus = attack.attackBonus;
  if (attack.critThreshold !== undefined) spec.critThreshold = attack.critThreshold;
  if (attack.critMultiplier !== undefined) spec.critMultiplier = attack.critMultiplier;
  if (attack.pattern !== undefined) spec.pattern = attackPatternForAuthoringKey(attack.pattern);
  if (attack.targets !== undefined) spec.targets = attackTargetModeForAuthoringKey(attack.targets);
  return spec;
}
