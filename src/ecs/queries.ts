import { Query } from "@phughesmcr/miski";
import { Blocking, Door, Enemy, Facing, GridPos, Key, Npc, Player, TurnTaker } from "./components.ts";

/** All entities with a grid position */
export const positionedQuery: Query = new Query({
  all: { gridPos: GridPos },
});

/** All blocking entities with a grid position */
export const blockingQuery: Query = new Query({
  all: { gridPos: GridPos, blocking: Blocking },
});

/** All NPCs with a grid position and facing */
export const npcRenderQuery: Query = new Query({
  all: { npc: Npc, gridPos: GridPos, facing: Facing },
  none: { enemy: Enemy },
});

/** All enemies with a grid position and facing */
export const enemyRenderQuery: Query = new Query({
  all: { enemy: Enemy, gridPos: GridPos, facing: Facing },
});

/** All doors with a grid position */
export const doorRenderQuery: Query = new Query({
  all: { door: Door, gridPos: GridPos },
});

/** All keys available on the map */
export const keyQuery: Query = new Query({
  all: { key: Key, gridPos: GridPos },
});

/** All non-player entities that participate in the turn loop */
export const nonPlayerTurnTakerQuery: Query = new Query({
  all: { turnTaker: TurnTaker },
  none: { player: Player },
});
