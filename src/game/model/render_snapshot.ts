import type { DoorSlide, KeyColor } from "@/src/game/content/map_entities.ts";
import type { SpriteId } from "@/src/game/content/sprite_ids.ts";
import type { Entity } from "turn-based-engine/ecs";

export const DrawableKind = {
  Player: 1,
  Actor: 2,
  Door: 3,
  Sprite: 4,
} as const;
export type DrawableKind = (typeof DrawableKind)[keyof typeof DrawableKind];

export const SpriteAnimationKind = {
  Walk: 1,
  Attack: 2,
  Death: 3,
} as const;
export type SpriteAnimationKind = (typeof SpriteAnimationKind)[keyof typeof SpriteAnimationKind];

export type SpriteAnimationSnapshot = {
  readonly kind: SpriteAnimationKind;
  readonly startedAtMs: number;
  readonly durationMs: number;
};

type DrawableBase = {
  readonly entity: Entity;
  readonly x: number;
  readonly y: number;
};

export type PlayerDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Player;
  readonly dir: number;
  readonly spriteId: SpriteId;
};

export type ActorDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Actor;
  readonly dir: number;
  readonly spriteId: SpriteId;
  readonly animation?: SpriteAnimationSnapshot;
  readonly health?: { readonly current: number; readonly max: number };
};

export type DoorDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Door;
  readonly open: boolean;
  readonly locked: boolean;
  readonly secret: boolean;
  readonly glass: boolean;
  readonly color?: KeyColor;
  readonly slide?: DoorSlide;
  readonly openMs: number;
};

export type SpriteDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Sprite;
  readonly spriteId: SpriteId;
  readonly animation?: SpriteAnimationSnapshot;
};

export type DrawableEntity =
  | ActorDrawableEntity
  | DoorDrawableEntity
  | PlayerDrawableEntity
  | SpriteDrawableEntity;

export type LightEntity = DrawableBase & {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly radius: number;
  readonly flickerAmount: number;
  readonly flickerSpeed: number;
};

export type DrawableEntityVisitor = (drawable: DrawableEntity) => void;
export type LightEntityVisitor = (light: LightEntity) => void;
