import { createCodeRegistry } from "@/src/utils/code_registry.ts";

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

const ENEMY_ARCHETYPE_AUTHORING_KEYS_BY_CODE = {
  [EnemyArchetype.MeleeDog]: "meleeDog",
  [EnemyArchetype.Gunslinger]: "gunslinger",
  [EnemyArchetype.NetworkNeophyte]: "networkNeophyte",
  [EnemyArchetype.SystemSentinel]: "systemSentinel",
  [EnemyArchetype.AgenticAcolyte]: "agenticAcolyte",
} as const satisfies Readonly<Record<EnemyArchetype, string>>;

export type EnemyArchetypeAuthoringKey = (typeof ENEMY_ARCHETYPE_AUTHORING_KEYS_BY_CODE)[EnemyArchetype];

export const ENEMY_ARCHETYPE_AUTHORING_KEYS = ENEMY_ARCHETYPE_CODES.map(
  enemyArchetypeAuthoringKey,
) as readonly EnemyArchetypeAuthoringKey[];

// Authoring keys are ordered by archetype, so each key's registry code equals its archetype value.
const ENEMY_ARCHETYPE_REGISTRY = createCodeRegistry("enemy archetype", ENEMY_ARCHETYPE_AUTHORING_KEYS);

export function enemyArchetypeAuthoringKey(archetype: EnemyArchetype): EnemyArchetypeAuthoringKey {
  return ENEMY_ARCHETYPE_AUTHORING_KEYS_BY_CODE[archetype];
}

export function enemyArchetypeForAuthoringKey(authoringKey: EnemyArchetypeAuthoringKey): EnemyArchetype {
  return ENEMY_ARCHETYPE_REGISTRY.encode(authoringKey) as EnemyArchetype;
}

export function enemyArchetypeForCode(archetype: number): EnemyArchetype {
  // Codes are the archetype values themselves; decode throws consistently for unknown codes.
  ENEMY_ARCHETYPE_REGISTRY.decode(archetype);
  return archetype as EnemyArchetype;
}
