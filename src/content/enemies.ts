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

const ENEMY_ARCHETYPES_BY_AUTHORING_KEY: Readonly<Record<string, EnemyArchetype>> = Object.fromEntries(
  ENEMY_ARCHETYPE_CODES.map((archetype) => [enemyArchetypeAuthoringKey(archetype), archetype]),
);

export function enemyArchetypeAuthoringKey(archetype: EnemyArchetype): string {
  return ENEMY_ARCHETYPE_AUTHORING_KEYS_BY_CODE[archetype];
}

export function enemyArchetypeForAuthoringKey(authoringKey: string): EnemyArchetype {
  const archetype = ENEMY_ARCHETYPES_BY_AUTHORING_KEY[authoringKey] ??
    ENEMY_ARCHETYPES_BY_AUTHORING_KEY[lowerFirst(authoringKey)];
  if (archetype === undefined) throw new Error(`Unknown enemy archetype "${authoringKey}".`);
  return archetype;
}

export function enemyArchetypeForCode(archetype: number): EnemyArchetype {
  if (Object.hasOwn(ENEMY_ARCHETYPE_AUTHORING_KEYS_BY_CODE, archetype)) return archetype as EnemyArchetype;
  throw new Error(`Unknown enemy archetype: ${archetype}`);
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toLowerCase()}${value.slice(1)}`;
}
