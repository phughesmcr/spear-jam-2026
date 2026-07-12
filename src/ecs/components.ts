import { type EnemyArchetypeCode, enemyArchetypeForCode } from "@/src/content/enemies.ts";
import { type ItemKind as ItemKindType, ItemKind as ItemKindValues } from "@/src/content/items.ts";
import type { SpriteId } from "@/src/content/sprite_ids.ts";
import type { DrawableKind } from "@/src/ecs/drawable_kind.ts";
import { type AttackDef, AttackPattern, AttackTargetMode } from "@/src/game/attack.ts";
import type { CrawlerGame } from "turn-based-engine/crawler";
import type { ComponentMap, Entity } from "turn-based-engine/ecs";

export { AttackPattern, AttackTargetMode };
export const ItemKind = ItemKindValues;
export type ItemKind = ItemKindType;
export type { DrawableKind, SpriteId };

export type PlayerInventorySchema = {
  keyMask: number;
  hasUplinkCode: number;
  hasSpear: number;
  pistolAmmo: number;
  cannonAmmo: number;
};
export type PlayerEquipmentSchema = { selectedWeapon: number; unlockedWeaponMask: number };
export type PlayerProgressSchema = { credits: number; score: number; xp: number; levelCredits: number };
export type StoryFlagsSchema = { mask: number };

export const DrawableLayer = {
  Item: 10,
  Structure: 20,
  Npc: 30,
  Enemy: 31,
  Player: 40,
} as const;
export type DrawableLayer = (typeof DrawableLayer)[keyof typeof DrawableLayer];
export type DrawableSchema = { kind: DrawableKind; layer: DrawableLayer };
export type SpriteSchema = { id: SpriteId };

export const SpriteAnimationKind = {
  Walk: 1,
  Attack: 2,
  Death: 3,
} as const;
export type SpriteAnimationKind = (typeof SpriteAnimationKind)[keyof typeof SpriteAnimationKind];
export const SPRITE_WALK_MS = 170;
export const SPRITE_ATTACK_MS = 380;
export const SPRITE_DEATH_MS = 560;
export const PENDING_SPRITE_ANIMATION_START_MS = -1;
export type SpriteAnimationSchema = { kind: SpriteAnimationKind; startedAtMs: number; durationMs: number };

export type DoorSchema = { open: number; slide: number; openMs: number };
export type LockedSchema = { color: number };
export type DisplayNameSchema = { displayName: number };
export type DialogueTreeRefSchema = { dialogueTreeId: number };
export type ExamineTextRefSchema = { examineTextId: number };
export type StoryTargetSchema = { storyId: number };
export type OnTalkEventSchema = { onTalkEvent: number };
export type TerminalDestinationSchema = { destination: number };
export type ItemSchema = { kind: ItemKindType; value: number };
export type LightEmitterSchema = {
  red: number;
  green: number;
  blue: number;
  radius: number;
  flickerAmount: number;
  flickerSpeed: number;
};
export type SoundEmitterSchema = { soundId: number; radius: number; volume: number };

export const AwarenessState = {
  Idle: 0,
  Investigating: 1,
  Alert: 2,
} as const;
export type AwarenessState = (typeof AwarenessState)[keyof typeof AwarenessState];
export type EnemyAwarenessSchema = {
  state: AwarenessState;
  lastKnownX: number;
  lastKnownY: number;
  turnsSinceSeen: number;
};
export const IDLE_AWARENESS = {
  state: AwarenessState.Idle,
  lastKnownX: -1,
  lastKnownY: -1,
  turnsSinceSeen: 0,
} as const satisfies EnemyAwarenessSchema;
export type EnemyArchetypeSchema = { archetype: EnemyArchetypeCode };
export type HealthSchema = { current: number; max: number };
export type DefenseSchema = { hitDc: number };
export type AttackSchema = AttackDef;

export const GAME_COMPONENTS = {
  Npc: {},
  Player: {},
  PlayerInventory: {
    keyMask: Uint8Array,
    hasUplinkCode: Uint8Array,
    hasSpear: Uint8Array,
    pistolAmmo: Uint16Array,
    cannonAmmo: Uint16Array,
  },
  PlayerEquipment: { selectedWeapon: Uint8Array, unlockedWeaponMask: Uint8Array },
  PlayerProgress: { credits: Uint32Array, score: Uint32Array, xp: Uint32Array, levelCredits: Uint32Array },
  StoryFlags: { mask: Uint32Array },
  Interactable: {},
  Drawable: { kind: Uint8Array, layer: Uint8Array },
  Sprite: { id: Uint8Array },
  SpriteAnimation: { kind: Uint8Array, startedAtMs: Float64Array, durationMs: Uint16Array },
  Door: { open: Uint8Array, slide: Uint8Array, openMs: Uint16Array },
  Locked: { color: Uint8Array },
  Secret: {},
  Glass: {},
  UplinkTerminal: { requiresSpear: Uint8Array },
  DisplayName: { displayName: Uint8Array },
  DialogueTreeRef: { dialogueTreeId: Uint8Array },
  ExamineTextRef: { examineTextId: Uint8Array },
  StoryTarget: { storyId: Uint8Array },
  OnTalkEvent: { onTalkEvent: Uint8Array },
  TerminalDestination: { destination: Uint32Array },
  Item: { kind: Uint8Array, value: Uint8Array },
  LightEmitter: {
    red: Uint8Array,
    green: Uint8Array,
    blue: Uint8Array,
    radius: Uint8Array,
    flickerAmount: Float32Array,
    flickerSpeed: Float32Array,
  },
  SoundEmitter: { soundId: Uint8Array, radius: Uint8Array, volume: Float32Array },
  TurnTaker: {},
  Enemy: {},
  EnemyAwareness: {
    state: Uint8Array,
    lastKnownX: Int16Array,
    lastKnownY: Int16Array,
    turnsSinceSeen: Uint8Array,
  },
  EnemyArchetype: { archetype: Uint8Array },
  Health: { current: Uint8Array, max: Uint8Array },
  Defense: { hitDc: Uint8Array },
  Attack: {
    minDamage: Uint8Array,
    maxDamage: Uint8Array,
    range: Uint8Array,
    attackBonus: Int8Array,
    critThreshold: Uint8Array,
    critMultiplier: Uint8Array,
    pattern: Uint8Array,
    targets: Uint8Array,
  },
} as const satisfies ComponentMap;

export type GameComponentMap = typeof GAME_COMPONENTS;
export type GameComponentName = keyof GameComponentMap;
export type GameComponentValue<Name extends GameComponentName> = {
  [Key in keyof GameComponentMap[Name]]: number;
};
export type GameEcs = CrawlerGame<GameComponentMap>;

export function hasComponent<Name extends GameComponentName>(game: GameEcs, entity: Entity, name: Name): boolean {
  return game.entityHasComponent(entity, game.components[name]);
}

export function readComponent<Name extends GameComponentName>(
  game: GameEcs,
  entity: Entity,
  name: Name,
): GameComponentValue<Name> | undefined {
  if (!hasComponent(game, entity, name)) return undefined;
  return requireComponent(game, entity, name);
}

export function requireComponent<Name extends GameComponentName>(
  game: GameEcs,
  entity: Entity,
  name: Name,
): GameComponentValue<Name> {
  const value: Record<string, number> = {};
  const storage = game.storage[name];
  for (const key of Object.keys(GAME_COMPONENTS[name])) {
    value[key] = storage.get(entity, key as never);
  }
  return value as GameComponentValue<Name>;
}

export function writeComponent<Name extends GameComponentName>(
  game: GameEcs,
  entity: Entity,
  name: Name,
  value: Partial<GameComponentValue<Name>>,
): void {
  game.storage[name].patch(entity, value);
}

export function enemyArchetypeFor(game: GameEcs, entity: Entity): EnemyArchetypeCode | undefined {
  const archetype = readComponent(game, entity, "EnemyArchetype")?.archetype;
  return archetype === undefined ? undefined : enemyArchetypeForCode(archetype);
}
