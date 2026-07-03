import { AttackFacingRequirement, AttackPattern, AttackTargetMode } from "@/src/game/attack.ts";
import type { AttackDef } from "@/src/game/attack.ts";
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

export const EnemyBehavior = {
  Pursuer: "pursuer",
  Pouncer: "pouncer",
  Skirmisher: "skirmisher",
  Sentinel: "sentinel",
} as const;
export type EnemyBehavior = (typeof EnemyBehavior)[keyof typeof EnemyBehavior];

export const DEFAULT_ENEMY_BEHAVIOR = EnemyBehavior.Pursuer;

export type EnemyCatalogEntry = {
  readonly authoringKey: string;
  readonly displayName: DisplayName;
  readonly health: number;
  readonly hitDc: number;
  readonly damage: number;
  readonly attack: Readonly<Partial<AttackDef>>;
  readonly behavior: EnemyBehavior;
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
    behavior: EnemyBehavior.Pouncer,
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
    behavior: EnemyBehavior.Skirmisher,
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
    behavior: EnemyBehavior.Pursuer,
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
    behavior: EnemyBehavior.Sentinel,
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
    behavior: EnemyBehavior.Pursuer,
  },
} as const satisfies Readonly<Record<EnemyArchetype, EnemyCatalogEntry>>;

export function enemyCatalogEntry(archetype: EnemyArchetype): EnemyCatalogEntry {
  return ENEMY_CATALOG[archetype];
}

export function enemyArchetypeForCode(archetype: number): EnemyArchetype {
  if (Object.hasOwn(ENEMY_CATALOG, archetype)) return archetype as EnemyArchetype;
  throw new Error(`Unknown enemy archetype: ${archetype}`);
}
