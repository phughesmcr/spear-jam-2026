export type CardinalDirection = 0 | 1 | 2 | 3;
export type GridDelta = { dx: number; dy: number };

const CARDINAL_DIRECTION_COUNT = 4;
const CARDINAL_DELTAS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
] as const satisfies readonly [GridDelta, GridDelta, GridDelta, GridDelta];

export function normalizeDirection(dir: number): CardinalDirection {
  return ((dir % CARDINAL_DIRECTION_COUNT + CARDINAL_DIRECTION_COUNT) % CARDINAL_DIRECTION_COUNT) as CardinalDirection;
}

export function directionDelta(dir: number): GridDelta {
  return CARDINAL_DELTAS[normalizeDirection(dir)];
}
