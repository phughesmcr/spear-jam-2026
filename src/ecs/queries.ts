import { Query } from "@phughesmcr/miski";
import {
  DisplayNameComponent,
  Door,
  Drawable,
  Enemy,
  EnemyArchetypeComponent,
  EnemyAwareness,
  Facing,
  GridPos,
  Health,
  Item,
  Locked,
  TurnTaker,
  UplinkTerminal,
} from "./components.ts";

/** All entities with a grid position */
export const positionedQuery = new Query({
  all: { gridPos: GridPos },
});

/** All entities that can be drawn by the renderer */
export const drawableRenderQuery = new Query({
  all: { gridPos: GridPos, drawable: Drawable },
  include: {
    facing: Facing,
    displayName: DisplayNameComponent,
    enemyArchetype: EnemyArchetypeComponent,
    health: Health,
    door: Door,
    locked: Locked,
    uplinkTerminal: UplinkTerminal,
    item: Item,
  },
});

/** All enemies that participate in the turn loop */
export const enemyTurnQuery = new Query({
  all: { enemy: Enemy, turnTaker: TurnTaker, gridPos: GridPos, facing: Facing, enemyAwareness: EnemyAwareness },
});
