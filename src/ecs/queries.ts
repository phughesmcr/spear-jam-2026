import { Query } from "@phughesmcr/miski";
import { Blocking, Drawable, GridPos, Key, Player, TurnTaker } from "./components.ts";

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

/** All non-player entities that participate in the turn loop */
export const nonPlayerTurnTakerQuery: Query = new Query({
  all: { turnTaker: TurnTaker },
  none: { player: Player },
});
