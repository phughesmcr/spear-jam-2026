import { Component, type ComponentPartitions, type DynamicComponent, type Entity, type World } from "@phughesmcr/miski";
import type { CardinalDirection } from "@/src/grid/direction.ts";
import type { DisplayName } from "@/src/game/names.ts";
import { type AttackDef, AttackFacingRequirement, AttackPattern, AttackTargetMode } from "@/src/game/attack.ts";
import type { CommandSlot } from "@/src/game/state.ts";

export { AttackFacingRequirement, AttackPattern, AttackTargetMode };

export type GridPosSchema = { x: number; y: number };
const GRID_POS_STORAGE = { x: Int16Array, y: Int16Array };
export type GridPosPartitions = ComponentPartitions<typeof GRID_POS_STORAGE>;

/**
 * Grid positions are stored as signed 16-bit integers so accidental
 * out-of-range writes stay visible instead of wrapping to valid tiles.
 * `SpatialIndex` is the single writer and validates bounds before writing.
 */
export const GridPos: Component<typeof GRID_POS_STORAGE> = new Component<typeof GRID_POS_STORAGE>({
  name: "gridPos",
  schema: GRID_POS_STORAGE,
});

export type FacingSchema = { dir: CardinalDirection };
const FACING_STORAGE = { dir: Uint8Array };
export type FacingPartitions = ComponentPartitions<typeof FACING_STORAGE>;

/** Cardinal heading: 0=N, 1=E, 2=S, 3=W. */
export const Facing: Component<typeof FACING_STORAGE> = new Component<typeof FACING_STORAGE>({
  name: "facing",
  schema: FACING_STORAGE,
});

export type DisplayNameSchema = { displayName: DisplayName };
export const DisplayNameComponent: Component<DisplayNameSchema> = new Component<DisplayNameSchema>({
  name: "displayName",
  schema: { displayName: Uint8Array },
});

export const Npc: Component<null> = new Component<null>({ name: "npc" });

export type DialogueSchema = { dialogueTreeId: number };
export const Dialogue: Component<DialogueSchema> = new Component<DialogueSchema>({
  name: "dialogue",
  schema: { dialogueTreeId: Uint8Array },
});

export type ExamineSchema = { examineTextId: number };
export const Examine: Component<ExamineSchema> = new Component<ExamineSchema>({
  name: "examine",
  schema: { examineTextId: Uint8Array },
});

export const Player: Component<null> = new Component<null>({ name: "player", maxEntities: 1 });

export const Blocking: Component<null> = new Component<null>({ name: "blocking" });

export const Interactable: Component<null> = new Component<null>({ name: "interactable" });

export const DrawableKind = {
  Player: 1,
  Npc: 2,
  Enemy: 3,
  Door: 4,
  Key: 5,
  UplinkCode: 6,
  UplinkTerminal: 7,
  WeaponPickup: 8,
  Item: 9,
} as const;
export type DrawableKind = (typeof DrawableKind)[keyof typeof DrawableKind];

export const DrawableLayer = {
  Item: 10,
  Structure: 20,
  Npc: 30,
  Enemy: 31,
  Player: 40,
} as const;
export type DrawableLayer = (typeof DrawableLayer)[keyof typeof DrawableLayer];

const DRAWABLE_STORAGE = { kind: Uint8Array, layer: Uint8Array };
export const Drawable: Component<typeof DRAWABLE_STORAGE> = new Component<typeof DRAWABLE_STORAGE>({
  name: "drawable",
  schema: DRAWABLE_STORAGE,
});

export type DoorSchema = { open: number };
export const Door: Component<DoorSchema> = new Component<DoorSchema>({
  name: "door",
  schema: { open: Uint8Array },
});

export type LockedSchema = { color: number };
export const Locked: Component<LockedSchema> = new Component<LockedSchema>({
  name: "locked",
  schema: { color: Uint8Array },
});

export const UplinkTerminal: Component<null> = new Component<null>({ name: "uplinkTerminal" });

export const ItemKind = {
  HealthPatch: 1,
  PistolAmmo: 2,
  CannonAmmo: 3,
  Key: 4,
  UplinkCode: 5,
  Weapon: 6,
} as const;
export type ItemKind = (typeof ItemKind)[keyof typeof ItemKind];

export type ItemSchema = { kind: number; value: number };
export const Item: Component<ItemSchema> = new Component<ItemSchema>({
  name: "item",
  schema: { kind: Uint8Array, value: Uint8Array },
});

export function itemKindForCode(kind: number): ItemKind {
  switch (kind) {
    case ItemKind.HealthPatch:
    case ItemKind.PistolAmmo:
    case ItemKind.CannonAmmo:
    case ItemKind.Key:
    case ItemKind.UplinkCode:
    case ItemKind.Weapon:
      return kind;
    default:
      throw new Error(`Unknown item kind: ${kind}`);
  }
}

export const TurnTaker: Component<null> = new Component<null>({ name: "turnTaker" });

export const Enemy: Component<null> = new Component<null>({ name: "enemy" });

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
const UNKNOWN_LAST_KNOWN_POSITION = -1;
export const IDLE_AWARENESS = {
  state: AwarenessState.Idle,
  lastKnownX: UNKNOWN_LAST_KNOWN_POSITION,
  lastKnownY: UNKNOWN_LAST_KNOWN_POSITION,
  turnsSinceSeen: 0,
} as const satisfies EnemyAwarenessSchema;
const ENEMY_AWARENESS_STORAGE = {
  state: Uint8Array,
  lastKnownX: Int16Array,
  lastKnownY: Int16Array,
  turnsSinceSeen: Uint8Array,
};
export type EnemyAwarenessPartitions = ComponentPartitions<typeof ENEMY_AWARENESS_STORAGE>;
export const EnemyAwareness: Component<typeof ENEMY_AWARENESS_STORAGE> = new Component<
  typeof ENEMY_AWARENESS_STORAGE
>({
  name: "enemyAwareness",
  schema: ENEMY_AWARENESS_STORAGE,
});

export const EnemyArchetype = {
  MeleeDog: 1,
  Gunslinger: 2,
  NetworkNeophyte: 3,
  SystemSentinel: 4,
  AgenticAcolyte: 5,
} as const;
export type EnemyArchetype = (typeof EnemyArchetype)[keyof typeof EnemyArchetype];

export type EnemyArchetypeSchema = { archetype: number };
export const EnemyArchetypeComponent: Component<EnemyArchetypeSchema> = new Component<EnemyArchetypeSchema>({
  name: "enemyArchetype",
  schema: { archetype: Uint8Array },
});

export function enemyArchetypeForCode(archetype: number): EnemyArchetype {
  switch (archetype) {
    case EnemyArchetype.MeleeDog:
    case EnemyArchetype.Gunslinger:
    case EnemyArchetype.NetworkNeophyte:
    case EnemyArchetype.SystemSentinel:
    case EnemyArchetype.AgenticAcolyte:
      return archetype;
    default:
      throw new Error(`Unknown enemy archetype: ${archetype}`);
  }
}

export function enemyArchetypeFor(world: World, entity: Entity): EnemyArchetype | undefined {
  const archetype = world.components.readEntityData(EnemyArchetypeComponent, entity)?.archetype;
  return archetype === undefined ? undefined : enemyArchetypeForCode(archetype);
}

export function commandSlotForCode(slot: number): CommandSlot {
  switch (slot) {
    case 1:
    case 2:
    case 3:
      return slot;
    default:
      throw new Error(`Unknown weapon slot: ${slot}`);
  }
}

export type HealthSchema = { current: number; max: number };
export const Health: Component<HealthSchema> = new Component<HealthSchema>({
  name: "health",
  schema: { current: Uint8Array, max: Uint8Array },
});

export function healthFor(world: World, entity: Entity): HealthSchema | undefined {
  const health = world.components.readEntityData(Health, entity);
  if (health === undefined) return undefined;

  return {
    current: health.current,
    max: health.max,
  };
}

export type AttackSchema = AttackDef;
export const Attack: Component<AttackSchema> = new Component<AttackSchema>({
  name: "attack",
  schema: {
    minDamage: Uint8Array,
    maxDamage: Uint8Array,
    range: Uint8Array,
    requiresFacing: Uint8Array,
    attackBonus: Uint8Array,
    critThreshold: Uint8Array,
    critMultiplier: Uint8Array,
    pattern: Uint8Array,
    targets: Uint8Array,
  },
});

export const ALL_COMPONENTS: DynamicComponent[] = [
  GridPos,
  Facing,
  DisplayNameComponent,
  Npc,
  Dialogue,
  Examine,
  Player,
  Blocking,
  Interactable,
  Drawable,
  Door,
  Locked,
  UplinkTerminal,
  Item,
  TurnTaker,
  Enemy,
  EnemyAwareness,
  EnemyArchetypeComponent,
  Health,
  Attack,
];
