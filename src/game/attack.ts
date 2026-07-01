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

export const AttackFacingRequirement = {
  None: 0,
  Required: 1,
} as const;
export type AttackFacingRequirement = (typeof AttackFacingRequirement)[keyof typeof AttackFacingRequirement];

export type AttackDef = {
  minDamage: number;
  maxDamage: number;
  range: number;
  requiresFacing: AttackFacingRequirement;
  attackBonus: number;
  critThreshold: number;
  critMultiplier: number;
  pattern: AttackPattern;
  targets: AttackTargetMode;
};
