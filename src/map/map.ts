import type { DisplayName } from "@/src/ecs/names.ts";
import type { AttackSchema } from "@/src/ecs/components.ts";
import type { DialogueTreeId } from "@/src/dialogue/dialogue.ts";

export type WallTile = {
  id: number;
  color: string;
  wall_texture?: string;
  blocking: boolean;
};

export type FloorTile = {
  id: number;
  color: string;
  floor_texture: string;
  ceiling_texture: string;
  blocking?: boolean;
};

export type TerrainTile = WallTile | FloorTile;

export const LockId = {
  Door1: 1,
} as const;

export type LockId = (typeof LockId)[keyof typeof LockId];

export type PlayerDef = {
  prefab: "player";
  x: number;
  y: number;
  dir: number;
};

export type NpcDef = {
  prefab: "npc";
  x: number;
  y: number;
  dir: number;
  displayName: DisplayName;
  dialogueTreeId?: DialogueTreeId;
};

export type EnemyDef = {
  prefab: "enemy";
  x: number;
  y: number;
  dir: number;
  displayName: DisplayName;
  health?: number;
  damage?: number;
  attack?: Partial<AttackSchema>;
};

export type DoorDef = {
  prefab: "door";
  x: number;
  y: number;
  locked?: boolean;
  lockId?: LockId;
};

export type KeyDef = {
  prefab: "key";
  x: number;
  y: number;
  lockId: LockId;
};

export type ExitDef = {
  prefab: "exit";
  x: number;
  y: number;
  goto: string;
};

export type MapEntityDef = PlayerDef | NpcDef | EnemyDef | DoorDef | KeyDef;

export type EntityDef = MapEntityDef | ExitDef;

export type GameMap = {
  name: string;
  terrain: {
    palette: TerrainTile[];
    tiles: number[][];
  };
  entities: EntityDef[];
};

export type MapDimensions = {
  readonly width: number;
  readonly height: number;
};

export function mapDimensions(map: GameMap): MapDimensions {
  return {
    width: Math.max(...map.terrain.tiles.map((row) => row.length)),
    height: map.terrain.tiles.length,
  };
}

export function terrainAt(map: GameMap, x: number, y: number): TerrainTile | undefined {
  const tile = map.terrain.tiles[y]?.[x];
  if (tile === undefined) return undefined;
  return map.terrain.palette.find((entry) => entry.id === tile);
}
