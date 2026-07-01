import { Query } from "@phughesmcr/miski";
import { Drawable, Enemy, Facing, GridPos, TurnTaker } from "./components.ts";

/** All entities with a grid position */
export const positionedQuery: Query = new Query({
  all: { gridPos: GridPos },
});

/** All entities that can be drawn by the renderer */
export const drawableRenderQuery: Query = new Query({
  all: { gridPos: GridPos, drawable: Drawable },
});

/** All enemies that participate in the turn loop */
export const enemyTurnQuery: Query = new Query({
  all: { enemy: Enemy, turnTaker: TurnTaker, gridPos: GridPos, facing: Facing },
});
