import { DisplayName } from "@/src/game/names.ts";
import { createGameMap, KeyColor } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

/**
 * Level 4: The Nexus — introduces the Agentic Acolyte.
 *
 * A hub-and-ring layout: a central crossroads chamber wrapped by a square
 * ring corridor with a room off each corner, so every fight can be approached
 * from two directions. Key chain: blue key (south armory) opens the data
 * vault, which holds both the uplink code and the yellow key for the uplink
 * bay — the player crosses the acolyte's chamber on every leg of the trip.
 */
export const MAP_4: GameMap = createGameMap(
  "The Nexus",
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
    [1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1],
    [1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1],
    [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
    [1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 1],
    [1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1],
    [1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  [
    // Start room, south-east corner.
    { prefab: "player", x: 12, y: 14, dir: 0 },
    { prefab: "item", x: 15, y: 13, item: "healthPatch", amount: 4 },
    { prefab: "item", x: 10, y: 15, item: "pistolAmmo", amount: 6 },
    // South-west armory: neophyte pair, blue key, and supplies.
    { prefab: "door", x: 4, y: 12 },
    { prefab: "enemy", x: 3, y: 14, dir: 1, displayName: DisplayName.NetworkNeophyte, archetype: "networkNeophyte" },
    { prefab: "enemy", x: 5, y: 13, dir: 1, displayName: DisplayName.NetworkNeophyte, archetype: "networkNeophyte" },
    { prefab: "key", x: 1, y: 14, color: KeyColor.Blue },
    { prefab: "item", x: 1, y: 13, item: "pistolAmmo", amount: 8 },
    { prefab: "item", x: 2, y: 15, item: "cannonAmmo", amount: 4 },
    { prefab: "item", x: 6, y: 15, item: "healthPatch", amount: 4 },
    // Ring corridor patrols.
    { prefab: "enemy", x: 3, y: 11, dir: 1, displayName: DisplayName.DigitalDog, archetype: "meleeDog" },
    { prefab: "enemy", x: 13, y: 5, dir: 3, displayName: DisplayName.GigabitGunslinger, archetype: "gunslinger" },
    { prefab: "item", x: 13, y: 11, item: "pistolAmmo", amount: 6 },
    // Central chamber: the acolyte holds the crossroads.
    { prefab: "enemy", x: 8, y: 8, dir: 2, displayName: DisplayName.AgenticAcolyte, archetype: "agenticAcolyte" },
    { prefab: "enemy", x: 10, y: 9, dir: 2, displayName: DisplayName.NetworkNeophyte, archetype: "networkNeophyte" },
    { prefab: "item", x: 5, y: 7, item: "healthPatch", amount: 4 },
    // North-west data vault (blue door): uplink code AND the yellow key.
    { prefab: "door", x: 4, y: 4, locked: true, color: KeyColor.Blue },
    { prefab: "enemy", x: 3, y: 2, dir: 1, displayName: DisplayName.AgenticAcolyte, archetype: "agenticAcolyte" },
    { prefab: "uplinkCode", x: 2, y: 2 },
    { prefab: "key", x: 1, y: 1, color: KeyColor.Yellow },
    { prefab: "item", x: 6, y: 1, item: "healthPatch", amount: 4 },
    // North-east uplink bay (yellow door): gunslinger crossfire on the terminal.
    { prefab: "door", x: 12, y: 4, locked: true, color: KeyColor.Yellow },
    { prefab: "enemy", x: 11, y: 2, dir: 1, displayName: DisplayName.GigabitGunslinger, archetype: "gunslinger" },
    { prefab: "enemy", x: 15, y: 3, dir: 3, displayName: DisplayName.GigabitGunslinger, archetype: "gunslinger" },
    { prefab: "uplinkTerminal", x: 13, y: 2, goto: "Mainframe Core" },
    { prefab: "item", x: 15, y: 1, item: "cannonAmmo", amount: 5 },
  ],
);
