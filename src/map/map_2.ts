import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import { DisplayName } from "@/src/game/names.ts";
import { createGameMap, KeyColor, VICTORY_GOTO } from "@/src/map/map.ts";
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
    { prefab: "weaponPickup", x: 5, y: 7, slot: 3 },
    { prefab: "door", x: 7, y: 3, locked: true, color: KeyColor.Blue },
    { prefab: "key", x: 8, y: 9, color: KeyColor.Blue },
    { prefab: "uplinkCode", x: 1, y: 10 },
    { prefab: "uplinkTerminal", x: 8, y: 1, goto: VICTORY_GOTO },
  ],
);
