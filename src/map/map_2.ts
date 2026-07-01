import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import { DisplayName } from "@/src/game/names.ts";
import { createGameMap, LockId } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

export const MAP_2: GameMap = createGameMap(
  "Map 2",
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 1],
    [1, 1, 0, 1, 0, 0, 1, 0, 0, 1],
    [1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  [
    { prefab: "player", x: 5, y: 5, dir: 1 },
    { prefab: "npc", x: 4, y: 5, dir: 1, displayName: DisplayName.John, dialogueTreeId: DialogueTreeId.JohnIntro },
    { prefab: "enemy", x: 2, y: 5, dir: 3, displayName: DisplayName.Imp },
    { prefab: "enemy", x: 8, y: 5, dir: 3, displayName: DisplayName.Imp },
    { prefab: "door", x: 7, y: 3, locked: true, lockId: LockId.Door1 },
    { prefab: "key", x: 8, y: 9, lockId: LockId.Door1 },
  ],
);
