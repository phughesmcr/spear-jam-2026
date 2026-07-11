import { type CardinalDirection, type GridPoint } from "@/src/grid/direction.ts";
import { canSeePoint as engineCanSeePoint } from "turn-based-engine/crawler";

export type BlocksSight = (x: number, y: number) => boolean;

export type SightSpec = {
  readonly radius: number;
  readonly facing?: CardinalDirection;
  readonly blocksSight: BlocksSight;
};

export type NoiseStimulus = GridPoint & {
  readonly radius: number;
};

export function canSeePoint(origin: GridPoint, target: GridPoint, sight: SightSpec): boolean {
  return canSeeTile(origin.x, origin.y, target.x, target.y, sight);
}

export function canSeeTile(
  originX: number,
  originY: number,
  targetX: number,
  targetY: number,
  sight: SightSpec,
): boolean {
  return engineCanSeePoint(originX, originY, targetX, targetY, {
    radius: Math.max(0, Math.floor(sight.radius)),
    distanceMetric: "euclidean",
    facing: sight.facing,
    blocksSight: sight.blocksSight,
  });
}
