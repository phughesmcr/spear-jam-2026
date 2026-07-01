import { Query } from "@phughesmcr/miski";
import { Blocking, Drawable, Enemy, Facing, GridPos, Key, TurnTaker } from "./components.ts";

/** All entities with a grid position */
export const positionedQuery: Query = new Query({
  all: { gridPos: GridPos },
});

/** All blocking entities with a grid position */
export const blockingQuery: Query = new Query({
  all: { gridPos: GridPos, blocking: Blocking },
});

/** All keys available on the map */
export const keyQuery: Query = new Query({
  all: { key: Key, gridPos: GridPos },
});

/** All entities that can be drawn by the renderer */
export const drawableRenderQuery = new Query({
  all: { gridPos: GridPos, drawable: Drawable },
});

/** All enemies that participate in the turn loop */
export const enemyTurnQuery = new Query({
  all: { enemy: Enemy, turnTaker: TurnTaker, gridPos: GridPos, facing: Facing },
});
