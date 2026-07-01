import { Component, type DynamicComponent } from "@phughesmcr/miski";
import type { CardinalDirection } from "@/src/grid/direction.ts";
import type { DisplayName } from "@/src/ecs/names.ts";

export type GridPosSchema = { x: number; y: number };

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

export type AttackSchema = { damage: number };
export const Attack = new Component<AttackSchema>({
  name: "attack",
  schema: { damage: Uint8Array },
});

export const ALL_COMPONENTS: DynamicComponent[] = [
  GridPos,
  Facing,
  Npc,
  Player,
  Blocking,
  Interactable,
  Door,
  Locked,
  Key,
  TurnTaker,
  Enemy,
  Health,
  Attack,
];
