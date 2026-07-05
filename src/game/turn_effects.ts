export const TurnEffectKind = {
  Invisibility: "invisibility",
  Overclock: "overclock",
  Toughness: "toughness",
  HealthRegen: "healthRegen",
} as const;
export type TurnEffectKind = (typeof TurnEffectKind)[keyof typeof TurnEffectKind];

export type TurnEffectState = {
  readonly kind: TurnEffectKind;
  readonly remainingTurns: number;
};

const TURN_EFFECT_ORDER: readonly TurnEffectKind[] = [
  TurnEffectKind.Invisibility,
  TurnEffectKind.Overclock,
  TurnEffectKind.Toughness,
  TurnEffectKind.HealthRegen,
];

export function normalizeTurnEffects(effects: readonly TurnEffectState[] = []): readonly TurnEffectState[] {
  const remainingTurnsByKind = new Map<TurnEffectKind, number>();
  for (const effect of effects) {
    const remainingTurns = normalizeRemainingTurns(effect.remainingTurns);
    if (remainingTurns <= 0) continue;
    remainingTurnsByKind.set(effect.kind, Math.max(remainingTurnsByKind.get(effect.kind) ?? 0, remainingTurns));
  }

  const normalized: TurnEffectState[] = [];
  for (const kind of TURN_EFFECT_ORDER) {
    const remainingTurns = remainingTurnsByKind.get(kind);
    if (remainingTurns !== undefined) normalized.push({ kind, remainingTurns });
  }
  return normalized;
}

function normalizeRemainingTurns(remainingTurns: number): number {
  return Number.isFinite(remainingTurns) ? Math.max(0, Math.trunc(remainingTurns)) : 0;
}
