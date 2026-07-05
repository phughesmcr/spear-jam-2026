import { type AttackDef, AttackFacingRequirement, AttackPattern, AttackTargetMode } from "@/src/game/attack.ts";
import { DisplayName } from "@/src/game/names.ts";

export const EnemyArchetype = {
  MeleeDog: 1,
  Gunslinger: 2,
  NetworkNeophyte: 3,
  SystemSentinel: 4,
  AgenticAcolyte: 5,
} as const;
export type EnemyArchetype = (typeof EnemyArchetype)[keyof typeof EnemyArchetype];

export const ENEMY_ARCHETYPE_CODES = [
  EnemyArchetype.MeleeDog,
  EnemyArchetype.Gunslinger,
  EnemyArchetype.NetworkNeophyte,
  EnemyArchetype.SystemSentinel,
  EnemyArchetype.AgenticAcolyte,
] as const satisfies readonly EnemyArchetype[];

export const DEFAULT_ENEMY_ARCHETYPE = EnemyArchetype.MeleeDog;

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

export type EnemyCatalogEntry = {
  readonly authoringKey: string;
  readonly displayName: DisplayName;
  readonly health: number;
  readonly hitDc: number;
  readonly damage: number;
  readonly attack: Readonly<Partial<AttackDef>>;
  readonly behavior: EnemyBehaviorPolicy;
};

export const ENEMY_CATALOG = {
  [EnemyArchetype.MeleeDog]: {
    authoringKey: "meleeDog",
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
      investigate: { type: "move", steps: 2 },
    },
  },
  [EnemyArchetype.Gunslinger]: {
    authoringKey: "gunslinger",
    displayName: DisplayName.GigabitGunslinger,
    health: 2,
    hitDc: 10,
    damage: 1,
    attack: {
      attackBonus: 3,
      range: 4,
    },
    behavior: {
      alert: { type: "skirmish", retreatRange: 1, advanceSteps: 1 },
      investigate: { type: "move", steps: 1 },
    },
  },
  [EnemyArchetype.NetworkNeophyte]: {
    authoringKey: "networkNeophyte",
    displayName: DisplayName.NetworkNeophyte,
    health: 3,
    hitDc: 10,
    damage: 1,
    attack: {
      attackBonus: 2,
      range: 1,
    },
    behavior: DEFAULT_ENEMY_BEHAVIOR_POLICY,
  },
  [EnemyArchetype.SystemSentinel]: {
    authoringKey: "systemSentinel",
    displayName: DisplayName.SystemSentinel,
    health: 7,
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
  },
  [EnemyArchetype.AgenticAcolyte]: {
    authoringKey: "agenticAcolyte",
    displayName: DisplayName.AgenticAcolyte,
    health: 4,
    hitDc: 10,
    damage: 2,
    attack: {
      requiresFacing: AttackFacingRequirement.None,
      attackBonus: 3,
      range: 2,
      pattern: AttackPattern.Adjacent,
      targets: AttackTargetMode.All,
    },
    behavior: DEFAULT_ENEMY_BEHAVIOR_POLICY,
  },
} as const satisfies Readonly<Record<EnemyArchetype, EnemyCatalogEntry>>;

export function enemyCatalogEntry(archetype: EnemyArchetype): EnemyCatalogEntry {
  return ENEMY_CATALOG[archetype];
}

export function enemyArchetypeForCode(archetype: number): EnemyArchetype {
  if (Object.hasOwn(ENEMY_CATALOG, archetype)) return archetype as EnemyArchetype;
  throw new Error(`Unknown enemy archetype: ${archetype}`);
}
