import { createCodeRegistry } from "@/src/game/content/code_registry.ts";

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

const ATTACK_PATTERN_CODES = [AttackPattern.Line, AttackPattern.Adjacent] as const;
const ATTACK_TARGET_MODE_CODES = [AttackTargetMode.First, AttackTargetMode.All] as const;

const ATTACK_PATTERN_KEYS_BY_CODE = {
  [AttackPattern.Line]: "line",
  [AttackPattern.Adjacent]: "adjacent",
} as const satisfies Readonly<Record<AttackPattern, string>>;

const ATTACK_TARGET_MODE_KEYS_BY_CODE = {
  [AttackTargetMode.First]: "first",
  [AttackTargetMode.All]: "all",
} as const satisfies Readonly<Record<AttackTargetMode, string>>;

export const ATTACK_PATTERN_KEYS = ATTACK_PATTERN_CODES.map(
  (code) => ATTACK_PATTERN_KEYS_BY_CODE[code],
);
export const ATTACK_TARGET_MODE_KEYS = ATTACK_TARGET_MODE_CODES.map(
  (code) => ATTACK_TARGET_MODE_KEYS_BY_CODE[code],
);

export type AttackPatternKey = (typeof ATTACK_PATTERN_KEYS_BY_CODE)[AttackPattern];
export type AttackTargetModeKey = (typeof ATTACK_TARGET_MODE_KEYS_BY_CODE)[AttackTargetMode];

export type AttackOverrides = {
  readonly minDamage?: number;
  readonly maxDamage?: number;
  readonly range?: number;
  readonly attackBonus?: number;
  readonly critThreshold?: number;
  readonly critMultiplier?: number;
  readonly pattern?: AttackPatternKey;
  readonly targets?: AttackTargetModeKey;
};

const ATTACK_PATTERN_REGISTRY = createCodeRegistry("attack pattern", ATTACK_PATTERN_KEYS);
const ATTACK_TARGET_MODE_REGISTRY = createCodeRegistry("attack target mode", ATTACK_TARGET_MODE_KEYS);

export function attackPatternForKey(key: AttackPatternKey): AttackPattern {
  return ATTACK_PATTERN_REGISTRY.encode(key) as AttackPattern;
}

export function attackTargetModeForKey(key: AttackTargetModeKey): AttackTargetMode {
  return ATTACK_TARGET_MODE_REGISTRY.encode(key) as AttackTargetMode;
}

export function attackOverridesFromContent(attack: AttackOverrides | undefined): Partial<AttackDef> {
  if (attack === undefined) return {};
  const spec: Partial<AttackDef> = {};
  if (attack.minDamage !== undefined) spec.minDamage = attack.minDamage;
  if (attack.maxDamage !== undefined) spec.maxDamage = attack.maxDamage;
  if (attack.range !== undefined) spec.range = attack.range;
  if (attack.attackBonus !== undefined) spec.attackBonus = attack.attackBonus;
  if (attack.critThreshold !== undefined) spec.critThreshold = attack.critThreshold;
  if (attack.critMultiplier !== undefined) spec.critMultiplier = attack.critMultiplier;
  if (attack.pattern !== undefined) spec.pattern = attackPatternForKey(attack.pattern);
  if (attack.targets !== undefined) spec.targets = attackTargetModeForKey(attack.targets);
  return spec;
}
