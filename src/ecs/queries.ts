import { Query } from "@phughesmcr/miski";
import { Blocking, Facing, GridPos, Player } from "./components.ts";

/** All blocking entities with a grid position */
export const blockingQuery: Query = new Query({
  all: { gridPos: GridPos, blocking: Blocking },
});

/** All player entities with a grid position and facing */
export const playerQuery: Query = new Query({
  all: { player: Player, gridPos: GridPos, facing: Facing, blocking: Blocking },
});

/** All entities with a grid position that are not players */
export const notPlayerQuery: Query = new Query({
  all: { gridPos: GridPos },
  none: { player: Player },
});
