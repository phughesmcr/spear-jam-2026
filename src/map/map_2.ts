import { EnemyArchetype } from "@/src/ecs/components.ts";
import { ItemKind } from "@/src/game/items.ts";
import { DisplayName } from "@/src/game/names.ts";
import { createGameMap, KeyColor } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

/**
 * Level 2: Data Conduit — introduces the Gigabit Gunslinger.
 *
 * The north gallery is a long shooting lane with pillar cover so the player
 * learns to break line of sight against ranged enemies. Two stairways on each
 * side form a figure-eight loop, and the blue vault door is visible from the
 * moment the player leaves the start room.
 */
export const MAP_2: GameMap = createGameMap(
  "Data Conduit",
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  [
    // Start room, bottom-left; the blue door is in view down the south hall.
    { prefab: "player", x: 2, y: 11, dir: 0 },
    // Gallery: gunslinger holds the long lane; pillars give the player cover.
    {
      prefab: "enemy",
      x: 12,
      y: 1,
      dir: 3,
      displayName: DisplayName.GigabitGunslinger,
      archetype: EnemyArchetype.Gunslinger,
    },
    { prefab: "item", x: 1, y: 1, item: ItemKind.PistolAmmo, amount: 4 },
    // West storeroom: blue key guarded by a dog.
    { prefab: "enemy", x: 2, y: 5, dir: 2, displayName: DisplayName.DigitalDog, archetype: EnemyArchetype.MeleeDog },
    { prefab: "key", x: 1, y: 4, color: KeyColor.Blue },
    { prefab: "item", x: 1, y: 6, item: ItemKind.HealthPatch, amount: 4 },
    { prefab: "item", x: 4, y: 6, item: ItemKind.PistolAmmo, amount: 4 },
    // East room: uplink terminal with a dog on patrol.
    { prefab: "uplinkTerminal", x: 13, y: 4, goto: "Firewall" },
    { prefab: "enemy", x: 10, y: 5, dir: 3, displayName: DisplayName.DigitalDog, archetype: EnemyArchetype.MeleeDog },
    { prefab: "item", x: 13, y: 6, item: ItemKind.PistolAmmo, amount: 6 },
    // Mid supply closet: opening the door springs a dog ambush.
    { prefab: "door", x: 6, y: 9 },
    { prefab: "enemy", x: 7, y: 10, dir: 0, displayName: DisplayName.DigitalDog, archetype: EnemyArchetype.MeleeDog },
    { prefab: "item", x: 5, y: 11, item: ItemKind.PistolAmmo, amount: 6 },
    { prefab: "item", x: 8, y: 11, item: ItemKind.HealthPatch, amount: 3 },
    // South-east vault: blue door, gunslinger overwatch, uplink code.
    { prefab: "door", x: 12, y: 9, locked: true, color: KeyColor.Blue },
    {
      prefab: "enemy",
      x: 10,
      y: 10,
      dir: 1,
      displayName: DisplayName.GigabitGunslinger,
      archetype: EnemyArchetype.Gunslinger,
    },
    { prefab: "uplinkCode", x: 13, y: 11 },
    { prefab: "item", x: 13, y: 10, item: ItemKind.HealthPatch, amount: 4 },
  ],
);
