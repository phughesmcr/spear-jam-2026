type TopDownShape = "actor" | "badge" | "corpse" | "key" | "none" | "player" | "terminal" | "uplinkCode" | "weapon";

export type TopDownSpriteAppearance = {
  readonly shape: TopDownShape;
  readonly color: string;
  readonly symbol?: string;
};
