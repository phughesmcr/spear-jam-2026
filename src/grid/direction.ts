export type CardinalDirection = 0 | 1 | 2 | 3;
export type GridDelta = { dx: number; dy: number };
export type GridPoint = { readonly x: number; readonly y: number };

export const Direction = {
  North: 0,
  East: 1,
  South: 2,
  West: 3,
} as const satisfies Record<string, CardinalDirection>;

const CARDINAL_DIRECTION_COUNT = 4;
export const CARDINAL_DELTAS = [
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

export function manhattanDistance(a: GridPoint, b: GridPoint): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
