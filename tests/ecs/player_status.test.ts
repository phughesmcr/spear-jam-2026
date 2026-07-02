import { assertEquals } from "@std/assert";
import { PlayerStatus } from "@/src/ecs/player_status.ts";
import { createPlayerState } from "@/src/game/state.ts";
import { KeyColor } from "@/src/map/map.ts";

Deno.test("PlayerStatus defaults to melee with empty carried resources", () => {
  const status = new PlayerStatus(createPlayerState());

  assertEquals(status.getState(), {
    heldKeys: [],
    selectedWeapon: 1,
    unlockedWeapons: [1],
    ammo: { pistol: 0, cannon: 0 },
    hasUplinkCode: false,
    progress: { credits: 0, score: 0, xp: 0, levelCredits: 0 },
  });
});

Deno.test("PlayerStatus starts from a normalized selected weapon", () => {
  const status = new PlayerStatus(createPlayerState({
    heldKeys: [],
    selectedWeapon: 3,
    unlockedWeapons: [1, 2],
  }));

  assertEquals(status.selectedWeapon, 1);
  assertEquals(status.getState().unlockedWeapons, [1, 2]);
});

Deno.test("PlayerStatus tracks weapons and ammo", () => {
  const status = new PlayerStatus(createPlayerState({
    heldKeys: [],
    selectedWeapon: 1,
    unlockedWeapons: [3, 2],
    ammo: { pistol: 1, cannon: 0 },
  }));

  assertEquals(status.getState().unlockedWeapons, [1, 2, 3]);
  assertEquals(status.spendAmmo("pistol"), true);
  assertEquals(status.spendAmmo("pistol"), false);
  assertEquals(status.getState().ammo, { pistol: 0, cannon: 0 });
});

Deno.test("PlayerStatus tracks credits and converts level credits to XP", () => {
  const status = new PlayerStatus(createPlayerState({
    progress: { credits: 5, score: 7, xp: 11, levelCredits: 3 },
  }));

  assertEquals(status.addCredits(10), { credits: 15, score: 17 });
  assertEquals(status.getState().progress, { credits: 15, score: 17, xp: 11, levelCredits: 13 });
  assertEquals(status.convertLevelCreditsToXp(), { amount: 13, xp: 24 });
  assertEquals(status.convertLevelCreditsToXp(), undefined);
  assertEquals(status.getState().progress, { credits: 15, score: 17, xp: 24, levelCredits: 0 });
});

Deno.test("PlayerStatus clears transient key and uplink state", () => {
  const status = new PlayerStatus(createPlayerState({
    heldKeys: [KeyColor.Red],
    selectedWeapon: 1,
    hasUplinkCode: true,
  }));

  status.clearTransient();

  assertEquals(status.getState().heldKeys, []);
  assertEquals(status.getState().hasUplinkCode, false);
});
