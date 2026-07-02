import { assertEquals } from "@std/assert";
import { PlayerInventory } from "@/src/ecs/player_inventory.ts";
import { KeyColor } from "@/src/map/map.ts";

Deno.test("PlayerInventory defaults to melee with empty carried resources", () => {
  const inventory = new PlayerInventory();

  assertEquals(inventory.getState(), {
    heldKeys: [],
    selectedWeapon: 1,
    unlockedWeapons: [1],
    ammo: { pistol: 0, cannon: 0 },
    hasUplinkCode: false,
  });
});

Deno.test("PlayerInventory ignores a carried selected weapon that is not unlocked", () => {
  const inventory = new PlayerInventory({
    heldKeys: [],
    selectedWeapon: 3,
    unlockedWeapons: [1, 2],
  });

  assertEquals(inventory.selectedWeapon, 1);
  assertEquals(inventory.getState().unlockedWeapons, [1, 2]);
});

Deno.test("PlayerInventory sorts unlocked weapons and tracks ammo spending", () => {
  const inventory = new PlayerInventory({
    heldKeys: [],
    selectedWeapon: 1,
    unlockedWeapons: [3, 2],
    ammo: { pistol: 1, cannon: 0 },
  });

  assertEquals(inventory.getState().unlockedWeapons, [1, 2, 3]);
  assertEquals(inventory.spendAmmo("pistol"), true);
  assertEquals(inventory.spendAmmo("pistol"), false);
  assertEquals(inventory.getState().ammo, { pistol: 0, cannon: 0 });
});

Deno.test("PlayerInventory clears transient key and uplink state", () => {
  const inventory = new PlayerInventory({
    heldKeys: [KeyColor.Red],
    selectedWeapon: 1,
    hasUplinkCode: true,
  });

  inventory.clearTransient();

  assertEquals(inventory.getState().heldKeys, []);
  assertEquals(inventory.getState().hasUplinkCode, false);
});
