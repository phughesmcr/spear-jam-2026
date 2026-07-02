import { assertEquals } from "@std/assert";
import type { Entity } from "@phughesmcr/miski";
import { PlayerProgression } from "@/src/game/progression.ts";
import { createPlayerState } from "@/src/game/state.ts";
import { TurnEffectKind } from "@/src/game/turn_effects.ts";
import { KeyColor } from "@/src/map/map.ts";

Deno.test("PlayerProgression defaults to melee with empty carried resources", () => {
  const progression = new PlayerProgression(createPlayerState());

  assertEquals(progression.getState(), {
    heldKeys: [],
    selectedWeapon: 1,
    unlockedWeapons: [1],
    ammo: { pistol: 0, cannon: 0 },
    hasUplinkCode: false,
    progress: { credits: 0, score: 0, xp: 0, levelCredits: 0 },
    turnEffects: [],
  });
});

Deno.test("PlayerProgression starts from a normalized selected weapon", () => {
  const progression = new PlayerProgression(createPlayerState({
    heldKeys: [],
    selectedWeapon: 3,
    unlockedWeapons: [1, 2],
  }));

  assertEquals(progression.selectedWeapon, 1);
  assertEquals(progression.getState().unlockedWeapons, [1, 2]);
});

Deno.test("PlayerProgression tracks weapons and ammo", () => {
  const progression = new PlayerProgression(createPlayerState({
    heldKeys: [],
    selectedWeapon: 1,
    unlockedWeapons: [3, 2],
    ammo: { pistol: 1, cannon: 0 },
  }));

  assertEquals(progression.getState().unlockedWeapons, [1, 2, 3]);
  assertEquals(progression.spendAmmo("pistol"), true);
  assertEquals(progression.spendAmmo("pistol"), false);
  assertEquals(progression.getState().ammo, { pistol: 0, cannon: 0 });
});

Deno.test("PlayerProgression ticks active turn effects", () => {
  const progression = new PlayerProgression(createPlayerState({
    turnEffects: [{ kind: TurnEffectKind.Invisibility, remainingTurns: 2 }],
  }));

  assertEquals(progression.getState().turnEffects, [
    { kind: TurnEffectKind.Invisibility, remainingTurns: 2 },
  ]);

  progression.tickTurnEffects();
  assertEquals(progression.getState().turnEffects, [
    { kind: TurnEffectKind.Invisibility, remainingTurns: 1 },
  ]);

  progression.tickTurnEffects();
  assertEquals(progression.getState().turnEffects, []);
});

Deno.test("PlayerProgression returns credit and XP events", () => {
  const player = 1 as Entity;
  const enemy = 2 as Entity;
  const progression = new PlayerProgression(createPlayerState({
    progress: { credits: 5, score: 7, xp: 11, levelCredits: 3 },
  }));

  assertEquals(
    progression.awardCreditsForDefeats(
      [{
        type: "entityDefeated",
        actor: player,
        entity: enemy,
        entityName: "Imp",
      }],
      player,
    ),
    [
      {
        type: "entityDefeated",
        actor: player,
        entity: enemy,
        entityName: "Imp",
      },
      {
        type: "creditsEarned",
        amount: 10,
        credits: 15,
        score: 17,
      },
    ],
  );
  assertEquals(progression.getState().progress, { credits: 15, score: 17, xp: 11, levelCredits: 13 });
  assertEquals(progression.completeLevel([]), [{ type: "xpGained", amount: 13, xp: 24 }]);
  assertEquals(progression.completeLevel([]), []);
  assertEquals(progression.getState().progress, { credits: 15, score: 17, xp: 24, levelCredits: 0 });
});

Deno.test("PlayerProgression clears transient key and uplink state", () => {
  const progression = new PlayerProgression(createPlayerState({
    heldKeys: [KeyColor.Red],
    selectedWeapon: 1,
    hasUplinkCode: true,
  }));

  progression.clearTransient();

  assertEquals(progression.getState().heldKeys, []);
  assertEquals(progression.getState().hasUplinkCode, false);
});
