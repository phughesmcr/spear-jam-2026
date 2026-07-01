import { Component, type DynamicComponent } from "@phughesmcr/miski";
import type { CardinalDirection } from "@/src/grid/direction.ts";
import type { DisplayName } from "@/src/ecs/names.ts";

export type GridPosSchema = { x: number; y: number };
export type GridPosPartitions = {
  readonly x: Uint8Array;
  readonly y: Uint8Array;
};

/** Grid positions are stored as bytes, so map dimensions must stay below 256. */
export const GridPos: Component<GridPosSchema> = new Component<GridPosSchema>({
  name: "gridPos",
  schema: { x: Uint8Array, y: Uint8Array },
});

export type FacingSchema = { dir: CardinalDirection };
/** Cardinal heading: 0=N, 1=E, 2=S, 3=W. Drives the directional FOV cone. */
export const Facing: Component<FacingSchema> = new Component<FacingSchema>({
  name: "facing",
  schema: { dir: Uint8Array },
});

export type NpcSchema = { displayName: DisplayName };
export const Npc = new Component<NpcSchema>({
  name: "npc",
  schema: { displayName: Uint8Array },
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
export const Drawable = new Component<DrawableSchema>({
  name: "drawable",
  schema: { kind: Uint8Array, layer: Uint8Array },
});

export type DoorSchema = { open: number };
export const Door = new Component<DoorSchema>({
  name: "door",
  schema: { open: Uint8Array },
});

export type LockedSchema = { lockId: number };
export const Locked = new Component<LockedSchema>({
  name: "locked",
  schema: { lockId: Uint8Array },
});

export type KeySchema = { lockId: number };
export const Key = new Component<KeySchema>({
  name: "key",
  schema: { lockId: Uint8Array },
});

export const TurnTaker: Component<null> = new Component<null>({ name: "turnTaker" });

export const Enemy: Component<null> = new Component<null>({ name: "enemy" });

export type HealthSchema = { current: number; max: number };
export const Health = new Component<HealthSchema>({
  name: "health",
  schema: { current: Uint8Array, max: Uint8Array },
});

export const AttackPattern = {
  Line: 1,
  Adjacent: 2,
} as const;
export type AttackPattern = (typeof AttackPattern)[keyof typeof AttackPattern];

export const AttackTargetMode = {
  First: 1,
  All: 2,
} as const;
export type AttackTargetMode = (typeof AttackTargetMode)[keyof typeof AttackTargetMode];

export type AttackSchema = {
  minDamage: number;
  maxDamage: number;
  range: number;
  requiresFacing: number;
  attackBonus: number;
  critThreshold: number;
  critMultiplier: number;
  pattern: AttackPattern;
  targets: AttackTargetMode;
};
export const Attack = new Component<AttackSchema>({
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
  Npc,
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
