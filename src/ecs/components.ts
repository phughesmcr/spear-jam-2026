import { Component, type DynamicComponent } from "@phughesmcr/miski";
import type { CardinalDirection } from "@/src/map/direction.ts";

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

export const Player: Component<null> = new Component<null>({ name: "player", maxEntities: 1 });

export const Blocking: Component<null> = new Component<null>({ name: "blocking" });

export const ALL_COMPONENTS: DynamicComponent[] = [GridPos, Facing, Player, Blocking];
