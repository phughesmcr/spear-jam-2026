import { Component, type DynamicComponent } from "@phughesmcr/miski";
import type { CardinalDirection } from "@/src/grid/direction.ts";
import type { DisplayName } from "@/src/game/names.ts";
import { type AttackDef, AttackFacingRequirement, AttackPattern, AttackTargetMode } from "@/src/game/attack.ts";

export { AttackFacingRequirement, AttackPattern, AttackTargetMode };

export type GridPosSchema = { x: number; y: number };
export type GridPosPartitions = {
  readonly x: Int16Array;
  readonly y: Int16Array;
};

/**
 * Grid positions are stored as signed 16-bit integers so accidental
 * out-of-range writes stay visible instead of wrapping to valid tiles.
 * `SpatialIndex` is the single writer and validates bounds before writing.
 */
export const GridPos: Component<GridPosSchema> = new Component<GridPosSchema>({
  name: "gridPos",
  schema: { x: Int16Array, y: Int16Array },
});

export type FacingSchema = { dir: CardinalDirection };
export type FacingPartitions = {
  readonly dir: Uint8Array;
};

/** Cardinal heading: 0=N, 1=E, 2=S, 3=W. Drives the directional FOV cone. */
export const Facing: Component<FacingSchema> = new Component<FacingSchema>({
  name: "facing",
  schema: { dir: Uint8Array },
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

export const Player: Component<null> = new Component<null>({ name: "player", maxEntities: 1 });

export const Blocking: Component<null> = new Component<null>({ name: "blocking" });

export const Interactable: Component<null> = new Component<null>({ name: "interactable" });

export const DrawableKind = {
  Player: 1,
  Npc: 2,
  Enemy: 3,
  Door: 4,
  Key: 5,
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

export type DrawableSchema = {
  kind: DrawableKind;
  layer: DrawableLayer;
};
export type DrawablePartitions = {
  readonly kind: Uint8Array;
  readonly layer: Uint8Array;
};
export const Drawable: Component<DrawableSchema> = new Component<DrawableSchema>({
  name: "drawable",
  schema: { kind: Uint8Array, layer: Uint8Array },
});

export type DoorSchema = { open: number };
export const Door: Component<DoorSchema> = new Component<DoorSchema>({
  name: "door",
  schema: { open: Uint8Array },
});

export type LockedSchema = { lockId: number };
export const Locked: Component<LockedSchema> = new Component<LockedSchema>({
  name: "locked",
  schema: { lockId: Uint8Array },
});

export type KeySchema = { lockId: number };
export const Key: Component<KeySchema> = new Component<KeySchema>({
  name: "key",
  schema: { lockId: Uint8Array },
});

export const TurnTaker: Component<null> = new Component<null>({ name: "turnTaker" });

export const Enemy: Component<null> = new Component<null>({ name: "enemy" });

export type HealthSchema = { current: number; max: number };
export const Health: Component<HealthSchema> = new Component<HealthSchema>({
  name: "health",
  schema: { current: Uint8Array, max: Uint8Array },
});

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
  Player,
  Blocking,
  Interactable,
  Drawable,
  Door,
  Locked,
  Key,
  TurnTaker,
  Enemy,
  Health,
  Attack,
];
