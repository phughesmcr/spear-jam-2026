import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import { EnemyArchetype } from "@/src/ecs/components.ts";
import { ItemKind } from "@/src/game/items.ts";
import { ExamineTextId } from "@/src/game/examine.ts";
import { DisplayName } from "@/src/game/names.ts";
import { createGameMap, KeyColor } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

/**
 * Level 1: Boot Sector — the tutorial.
 *
 * Teaches one mechanic per room: talk (John), interact (unlocked door),
 * melee combat (a lone Digital Dog), pickups (pistol + ammo), then the
 * key/door/code/terminal loop. The uplink terminal sits just off the first
 * corridor so the player finds the locked red door — and the goal — long
 * before they find the key.
 */
export const MAP_1: GameMap = createGameMap(
  "Boot Sector",
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1],
    [1, 0, 0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 1],
    [1, 1, 0, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 0, 0, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
    [1, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  [
    // Start room: John briefs the player before the first door.
    { prefab: "player", x: 2, y: 2, dir: 1 },
    { prefab: "npc", x: 2, y: 1, dir: 2, displayName: DisplayName.John, dialogueTreeId: DialogueTreeId.JohnIntro },
    { prefab: "door", x: 4, y: 2 },
    // Armory: first fight (one dog), then the pistol as the reward.
    { prefab: "enemy", x: 6, y: 6, dir: 0, displayName: DisplayName.DigitalDog, archetype: EnemyArchetype.MeleeDog },
    { prefab: "weaponPickup", x: 6, y: 7, slot: 2 },
    { prefab: "item", x: 5, y: 7, item: ItemKind.PistolAmmo, amount: 6 },
    { prefab: "item", x: 7, y: 7, item: ItemKind.HealthPatch, amount: 3 },
    // Storeroom: the red key, with a dog ambush waiting in the south corridor.
    { prefab: "key", x: 1, y: 6, color: KeyColor.Red },
    { prefab: "item", x: 2, y: 7, item: ItemKind.PistolAmmo, amount: 4 },
    { prefab: "enemy", x: 6, y: 9, dir: 3, displayName: DisplayName.DigitalDog, archetype: EnemyArchetype.MeleeDog },
    // Uplink bay: terminal is visible early; the red door below it guards the code.
    {
      prefab: "uplinkTerminal",
      x: 10,
      y: 2,
      goto: "Data Conduit",
      examineTextId: ExamineTextId.BootSectorUplinkTerminal,
    },
    { prefab: "door", x: 11, y: 4, locked: true, color: KeyColor.Red, slide: "up", openMs: 600 },
    { prefab: "enemy", x: 9, y: 6, dir: 0, displayName: DisplayName.DigitalDog, archetype: EnemyArchetype.MeleeDog },
    { prefab: "uplinkCode", x: 9, y: 7 },
    { prefab: "item", x: 11, y: 7, item: ItemKind.HealthPatch, amount: 4 },
  ],
);
