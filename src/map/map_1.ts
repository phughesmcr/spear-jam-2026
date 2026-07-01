import { DisplayName } from "@/src/ecs/names.ts";
import { LockId } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

export const MAP_1: GameMap = {
  name: "Map 1",
  terrain: {
    palette: [
      { id: 0, color: "#000000", ceiling_texture: "ceiling", floor_texture: "floor" },
      { id: 1, color: "#FFFFFF", wall_texture: "wall", blocking: true },
    ],
    tiles: [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 1, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 1, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 1, 0, 1, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    ],
  },
  entities: [
    { prefab: "player", x: 5, y: 5, dir: 1 },
    { prefab: "npc", x: 4, y: 5, dir: 1, displayName: DisplayName.John },
    { prefab: "enemy", x: 6, y: 5, dir: 3, displayName: DisplayName.Imp },
    { prefab: "enemy", x: 7, y: 5, dir: 3, displayName: DisplayName.Imp },
    { prefab: "enemy", x: 8, y: 5, dir: 3, displayName: DisplayName.Imp },
    { prefab: "door", x: 7, y: 3, locked: true, lockId: LockId.Door1 },
    { prefab: "key", x: 8, y: 9, lockId: LockId.Door1 },
    { prefab: "exit", x: 8, y: 1, goto: "Map 2" },
  ],
};
