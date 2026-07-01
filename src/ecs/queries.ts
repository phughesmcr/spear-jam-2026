import { Query } from "@phughesmcr/miski";
import { Blocking, Facing, GridPos, Npc, Player, TurnTaker } from "./components.ts";

/** All entities with a grid position */
export const positionedQuery: Query = new Query({
  all: { gridPos: GridPos },
});

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

/** All NPCs with a grid position and facing */
export const npcRenderQuery: Query = new Query({
  all: { npc: Npc, gridPos: GridPos, facing: Facing },
});

/** All non-player entities that participate in the turn loop */
export const nonPlayerTurnTakerQuery: Query = new Query({
  all: { turnTaker: TurnTaker },
  none: { player: Player },
});
