import { DisplayName } from "@/src/game/names.ts";
import { createGameMap, KeyColor, VICTORY_GOTO } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

/**
 * Level 5: Mainframe Core — the finale.
 *
 * A symmetric temple: three parallel north-south routes through three mid
 * chambers, a crossfire hall in front of the core, and the System Sentinel
 * standing guard on the only door to the mainframe terminal. The red-key
 * armory is an optional mercy cache (spare weapons, ammo, patches) for
 * players arriving battered.
 */
export const MAP_5: GameMap = createGameMap(
  "Mainframe Core",
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    [1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  [
    // Start room at the foot of the nave.
    { prefab: "player", x: 9, y: 12, dir: 0 },
    { prefab: "item", x: 8, y: 13, item: "pistolAmmo", amount: 4 },
    { prefab: "item", x: 10, y: 13, item: "healthPatch", amount: 3 },
    // South hall: dogs rush from both flanks the moment the player steps out.
    { prefab: "enemy", x: 2, y: 10, dir: 1, displayName: DisplayName.DigitalDog, archetype: "meleeDog" },
    { prefab: "enemy", x: 16, y: 10, dir: 3, displayName: DisplayName.DigitalDog, archetype: "meleeDog" },
    // South-east supply room: neophytes guard the red key.
    { prefab: "door", x: 14, y: 11 },
    { prefab: "enemy", x: 13, y: 12, dir: 0, displayName: DisplayName.NetworkNeophyte, archetype: "networkNeophyte" },
    { prefab: "enemy", x: 15, y: 13, dir: 0, displayName: DisplayName.NetworkNeophyte, archetype: "networkNeophyte" },
    { prefab: "key", x: 16, y: 12, color: KeyColor.Red },
    { prefab: "item", x: 12, y: 13, item: "pistolAmmo", amount: 8 },
    { prefab: "item", x: 16, y: 13, item: "cannonAmmo", amount: 4 },
    // South-west armory (red door): mercy cache before the final push.
    { prefab: "door", x: 4, y: 11, locked: true, color: KeyColor.Red },
    { prefab: "weaponPickup", x: 2, y: 12, slot: 2 },
    { prefab: "weaponPickup", x: 3, y: 13, slot: 3 },
    { prefab: "item", x: 3, y: 12, item: "cannonAmmo", amount: 6 },
    { prefab: "item", x: 5, y: 13, item: "pistolAmmo", amount: 10 },
    { prefab: "item", x: 5, y: 12, item: "healthPatch", amount: 6 },
    { prefab: "item", x: 2, y: 13, item: "healthPatch", amount: 4 },
    // West sanctum: the uplink code, held by an acolyte and its acolyte-in-training.
    { prefab: "enemy", x: 3, y: 7, dir: 1, displayName: DisplayName.AgenticAcolyte, archetype: "agenticAcolyte" },
    { prefab: "enemy", x: 4, y: 6, dir: 1, displayName: DisplayName.NetworkNeophyte, archetype: "networkNeophyte" },
    { prefab: "uplinkCode", x: 2, y: 7 },
    { prefab: "item", x: 1, y: 6, item: "healthPatch", amount: 4 },
    // Central chamber: neophyte swarm between the pillars.
    { prefab: "enemy", x: 8, y: 6, dir: 2, displayName: DisplayName.NetworkNeophyte, archetype: "networkNeophyte" },
    { prefab: "enemy", x: 9, y: 7, dir: 2, displayName: DisplayName.NetworkNeophyte, archetype: "networkNeophyte" },
    { prefab: "enemy", x: 10, y: 8, dir: 2, displayName: DisplayName.NetworkNeophyte, archetype: "networkNeophyte" },
    { prefab: "item", x: 7, y: 8, item: "healthPatch", amount: 3 },
    // East sanctum: yellow key behind an acolyte and gunslinger.
    { prefab: "enemy", x: 15, y: 7, dir: 3, displayName: DisplayName.AgenticAcolyte, archetype: "agenticAcolyte" },
    { prefab: "enemy", x: 17, y: 6, dir: 3, displayName: DisplayName.GigabitGunslinger, archetype: "gunslinger" },
    { prefab: "key", x: 16, y: 7, color: KeyColor.Yellow },
    { prefab: "item", x: 17, y: 8, item: "healthPatch", amount: 4 },
    // North hall: gunslinger crossfire, and the Sentinel guarding the core door.
    { prefab: "enemy", x: 1, y: 4, dir: 1, displayName: DisplayName.GigabitGunslinger, archetype: "gunslinger" },
    { prefab: "enemy", x: 17, y: 4, dir: 3, displayName: DisplayName.GigabitGunslinger, archetype: "gunslinger" },
    { prefab: "enemy", x: 9, y: 4, dir: 2, displayName: DisplayName.SystemSentinel, archetype: "systemSentinel" },
    { prefab: "item", x: 5, y: 4, item: "cannonAmmo", amount: 3 },
    { prefab: "item", x: 13, y: 4, item: "pistolAmmo", amount: 6 },
    // The core: yellow door, then the mainframe uplink. Destroy the System.
    { prefab: "door", x: 9, y: 3, locked: true, color: KeyColor.Yellow },
    { prefab: "uplinkTerminal", x: 9, y: 1, goto: VICTORY_GOTO },
  ],
);
