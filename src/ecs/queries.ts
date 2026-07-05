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
  MapScoped,
  Player,
  Secret,
  Sprite,
  SpriteAnimation,
  StoryTarget,
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
    spriteAnimation: SpriteAnimation,
  },
});

/** All short-lived sprite presentation animations */
export const spriteAnimationQuery = new Query({
  all: { spriteAnimation: SpriteAnimation },
  include: { gridPos: GridPos },
});

/** Map-authored entities that story actions can target by id */
export const storyTargetQuery = new Query({
  all: { storyTarget: StoryTarget },
});

/** All map-authored light emitters */
export const lightRenderQuery = new Query({
  all: { gridPos: GridPos, lightEmitter: LightEmitter },
});

/** The singleton player command actor */
export const playerTurnQuery = new Query({
  all: { player: Player, gridPos: GridPos, facing: Facing },
});

/** All enemies that participate in the turn loop */
export const enemyTurnQuery = new Query({
  all: { enemy: Enemy, turnTaker: TurnTaker, gridPos: GridPos, facing: Facing, enemyAwareness: EnemyAwareness },
});

/** Entities whose lifetime is bound to the currently loaded map. */
export const mapScopedQuery = new Query({
  all: { mapScoped: MapScoped },
});
