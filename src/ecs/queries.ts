import { Query } from "@phughesmcr/miski";
import {
  Door,
  Drawable,
  Enemy,
  EnemyAwareness,
  Facing,
  GridPos,
  Health,
  LightEmitter,
  Locked,
  Secret,
  Sprite,
  TurnTaker,
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
    health: Health,
    door: Door,
    locked: Locked,
    secret: Secret,
    sprite: Sprite,
  },
});

/** All map-authored light emitters */
export const lightRenderQuery = new Query({
  all: { gridPos: GridPos, lightEmitter: LightEmitter },
});

/** All enemies that participate in the turn loop */
export const enemyTurnQuery = new Query({
  all: { enemy: Enemy, turnTaker: TurnTaker, gridPos: GridPos, facing: Facing, enemyAwareness: EnemyAwareness },
});
