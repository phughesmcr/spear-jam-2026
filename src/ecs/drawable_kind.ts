/**
 * Render classification for drawable entities. Lives outside the component registry so
 * content/render can depend on it without importing the full ECS component module.
 */
export const DrawableKind = {
  Player: 1,
  Actor: 2,
  Door: 3,
  Sprite: 4,
} as const;
export type DrawableKind = (typeof DrawableKind)[keyof typeof DrawableKind];
