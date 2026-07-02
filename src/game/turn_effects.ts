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

export class TurnEffects {
  private readonly remainingTurnsByKind = new Map<TurnEffectKind, number>();

  constructor(effects: readonly TurnEffectState[] = []) {
    for (const effect of effects) {
      this.refresh(effect.kind, effect.remainingTurns);
    }
  }

  getState(): readonly TurnEffectState[] {
    const effects: TurnEffectState[] = [];
    for (const kind of TURN_EFFECT_ORDER) {
      const remainingTurns = this.remainingTurnsByKind.get(kind);
      if (remainingTurns !== undefined) effects.push({ kind, remainingTurns });
    }
    return effects;
  }

  has(kind: TurnEffectKind): boolean {
    return this.remainingTurnsByKind.has(kind);
  }

  remainingTurns(kind: TurnEffectKind): number {
    return this.remainingTurnsByKind.get(kind) ?? 0;
  }

  refresh(kind: TurnEffectKind, remainingTurns: number): void {
    const normalizedTurns = normalizeRemainingTurns(remainingTurns);
    if (normalizedTurns <= 0) return;

    this.remainingTurnsByKind.set(kind, Math.max(this.remainingTurns(kind), normalizedTurns));
  }

  tick(): void {
    for (const kind of TURN_EFFECT_ORDER) {
      const remainingTurns = this.remainingTurnsByKind.get(kind);
      if (remainingTurns === undefined) continue;

      const nextTurns = remainingTurns - 1;
      if (nextTurns <= 0) {
        this.remainingTurnsByKind.delete(kind);
      } else {
        this.remainingTurnsByKind.set(kind, nextTurns);
      }
    }
  }
}

export function normalizeTurnEffects(effects: readonly TurnEffectState[] = []): readonly TurnEffectState[] {
  return new TurnEffects(effects).getState();
}

function normalizeRemainingTurns(remainingTurns: number): number {
  return Number.isFinite(remainingTurns) ? Math.max(0, Math.trunc(remainingTurns)) : 0;
}
