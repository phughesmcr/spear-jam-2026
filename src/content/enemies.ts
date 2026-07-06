import { createCodeRegistry } from "@/src/utils/code_registry.ts";
import { lowerFirst } from "@/src/utils/strings.ts";

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

export const ENEMY_ARCHETYPE_AUTHORING_KEYS = ENEMY_ARCHETYPE_CODES.map(enemyArchetypeAuthoringKey);

// Authoring keys are ordered by archetype, so each key's registry code equals its archetype value.
const ENEMY_ARCHETYPE_REGISTRY = createCodeRegistry("enemy archetype", ENEMY_ARCHETYPE_AUTHORING_KEYS);

export function enemyArchetypeAuthoringKey(archetype: EnemyArchetype): string {
  return ENEMY_ARCHETYPE_AUTHORING_KEYS_BY_CODE[archetype];
}

export function enemyArchetypeForAuthoringKey(authoringKey: string): EnemyArchetype {
  const key = ENEMY_ARCHETYPE_REGISTRY.has(authoringKey) ? authoringKey : lowerFirst(authoringKey);
  if (!ENEMY_ARCHETYPE_REGISTRY.has(key)) throw new Error(`Unknown enemy archetype "${authoringKey}".`);
  return ENEMY_ARCHETYPE_REGISTRY.encode(key) as EnemyArchetype;
}

export function enemyArchetypeForCode(archetype: number): EnemyArchetype {
  // Codes are the archetype values themselves; decode throws consistently for unknown codes.
  ENEMY_ARCHETYPE_REGISTRY.decode(archetype);
  return archetype as EnemyArchetype;
}
