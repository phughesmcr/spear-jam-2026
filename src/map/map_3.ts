import { EnemyArchetype } from "@/src/ecs/components.ts";
import { ItemKind } from "@/src/game/items.ts";
import { DisplayName } from "@/src/game/names.ts";
import { createGameMap, KeyColor } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

/**
 * Level 3: Firewall — introduces the Network Neophyte and the Current Cannon.
 *
 * The spine of the level is a fifteen-tile firing lane: the player walks in
 * staring straight down it at charging neophytes, and once they claim the
 * cannon from the red-key armory the same lane becomes their playground.
 * Two-stage key hunt: red key (north barracks) opens the armory, yellow key
 * (south hall) opens the code vault.
 */
export const MAP_3: GameMap = createGameMap(
  "Firewall",
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1],
    [1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  [
    // Start at the west mouth of the firing lane.
    { prefab: "player", x: 1, y: 6, dir: 1 },
    // The lane: neophytes charge head-on, a gunslinger anchors the far end.
    {
      prefab: "enemy",
      x: 8,
      y: 5,
      dir: 3,
      displayName: DisplayName.NetworkNeophyte,
      archetype: EnemyArchetype.NetworkNeophyte,
    },
    {
      prefab: "enemy",
      x: 10,
      y: 6,
      dir: 3,
      displayName: DisplayName.NetworkNeophyte,
      archetype: EnemyArchetype.NetworkNeophyte,
    },
    {
      prefab: "enemy",
      x: 15,
      y: 6,
      dir: 3,
      displayName: DisplayName.GigabitGunslinger,
      archetype: EnemyArchetype.Gunslinger,
    },
    { prefab: "item", x: 15, y: 5, item: ItemKind.HealthPatch, amount: 3 },
    // North barracks: neophyte pair guarding the red key.
    {
      prefab: "enemy",
      x: 3,
      y: 2,
      dir: 2,
      displayName: DisplayName.NetworkNeophyte,
      archetype: EnemyArchetype.NetworkNeophyte,
    },
    {
      prefab: "enemy",
      x: 1,
      y: 3,
      dir: 1,
      displayName: DisplayName.NetworkNeophyte,
      archetype: EnemyArchetype.NetworkNeophyte,
    },
    { prefab: "key", x: 5, y: 1, color: KeyColor.Red },
    { prefab: "item", x: 1, y: 1, item: ItemKind.PistolAmmo, amount: 6 },
    // Armory behind the red door: the Current Cannon and its ammo.
    { prefab: "door", x: 4, y: 7, locked: true, color: KeyColor.Red },
    { prefab: "weaponPickup", x: 3, y: 9, slot: 3 },
    { prefab: "item", x: 2, y: 9, item: ItemKind.CannonAmmo, amount: 4 },
    { prefab: "item", x: 2, y: 10, item: ItemKind.CannonAmmo, amount: 3 },
    { prefab: "item", x: 4, y: 10, item: ItemKind.HealthPatch, amount: 4 },
    // South hall: door-ambush neophyte, gunslinger cover, yellow key at the back.
    { prefab: "door", x: 8, y: 7 },
    {
      prefab: "enemy",
      x: 8,
      y: 9,
      dir: 0,
      displayName: DisplayName.NetworkNeophyte,
      archetype: EnemyArchetype.NetworkNeophyte,
    },
    {
      prefab: "enemy",
      x: 10,
      y: 10,
      dir: 0,
      displayName: DisplayName.GigabitGunslinger,
      archetype: EnemyArchetype.Gunslinger,
    },
    { prefab: "key", x: 9, y: 11, color: KeyColor.Yellow },
    { prefab: "item", x: 7, y: 11, item: ItemKind.PistolAmmo, amount: 6 },
    // Yellow vault: the uplink code under gunslinger guard.
    { prefab: "door", x: 14, y: 7, locked: true, color: KeyColor.Yellow },
    {
      prefab: "enemy",
      x: 14,
      y: 9,
      dir: 0,
      displayName: DisplayName.GigabitGunslinger,
      archetype: EnemyArchetype.Gunslinger,
    },
    { prefab: "uplinkCode", x: 14, y: 11 },
    { prefab: "item", x: 15, y: 8, item: ItemKind.HealthPatch, amount: 3 },
    // North-east uplink chamber, terminal flanked by pillars.
    { prefab: "uplinkTerminal", x: 13, y: 2, goto: "The Nexus" },
  ],
);
