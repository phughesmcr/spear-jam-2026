import type { TerrainTile } from "@/src/game/world/map.ts";

export const TileFlag = {
  BlocksMove: 1 << 0,
  BlocksSight: 1 << 1,
  BlocksAttack: 1 << 2,
} as const;

export type TileFlag = (typeof TileFlag)[keyof typeof TileFlag];
export type TileFlags = number;

const BLOCKS_ALL: TileFlags = TileFlag.BlocksMove | TileFlag.BlocksSight | TileFlag.BlocksAttack;

export function terrainFlags(tile: TerrainTile | undefined): TileFlags {
  switch (tile?.kind) {
    case "floor":
      return 0;
    case "wall":
      return BLOCKS_ALL;
    case "barrier":
      return TileFlag.BlocksMove | TileFlag.BlocksAttack;
    case undefined:
      return BLOCKS_ALL;
  }
}

export function flagsBlockMovement(flags: TileFlags): boolean {
  return (flags & TileFlag.BlocksMove) !== 0;
}

export function flagsBlockSight(flags: TileFlags): boolean {
  return (flags & TileFlag.BlocksSight) !== 0;
}

export function flagsBlockAttack(flags: TileFlags): boolean {
  return (flags & TileFlag.BlocksAttack) !== 0;
}
