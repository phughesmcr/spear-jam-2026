import { assertEquals, assertRejects } from "@std/assert";
import { EnemyArchetype } from "@/src/ecs/components.ts";
import { createGameSession } from "@/src/ecs/session.ts";
import { ItemKind } from "@/src/game/items.ts";
import type { PlayerCommandResult } from "@/src/game/commands.ts";
import { TurnEffectKind } from "@/src/game/turn_effects.ts";
import { DisplayName } from "@/src/game/names.ts";
import { Direction } from "@/src/grid/direction.ts";
import { KeyColor, VICTORY_GOTO } from "@/src/map/map.ts";
import type { EntityDef, GameMap } from "@/src/map/map.ts";
import { flatTestMap } from "@/tests/ecs/helpers.ts";

Deno.test("createGameSession applies carried player state and requires a player spawn", async () => {
  const session = await createGameSession(testMap([]), () => 0, {
    heldKeys: [KeyColor.Red],
    health: { current: 4, max: 9 },
  });
  try {
    assertEquals(session.getPlayerState().heldKeys, [KeyColor.Red]);
    assertEquals(session.getPlayerState().health, { current: 4, max: 9 });
  } finally {
    session[Symbol.dispose]();
  }

  await assertRejects(
    () => createGameSession(flatTestMap(3, 2), () => 0),
    Error,
    "player spawn",
  );
});

Deno.test("player movement collects map-authored pickups into player state", async () => {
  const session = await createGameSession(
    testMap([
      { prefab: "key", x: 2, y: 1, color: KeyColor.Red },
      { prefab: "uplinkCode", x: 3, y: 1 },
      { prefab: "weaponPickup", x: 4, y: 1, slot: 2 },
      { prefab: "item", x: 5, y: 1, item: ItemKind.PistolAmmo, amount: 5 },
    ], 7),
    () => 0,
  );
  try {
    assertEquals(eventTypes(session.handlePlayerCommand({ type: "move", direction: "forward" })), ["keyPickedUp"]);
    assertEquals(eventTypes(session.handlePlayerCommand({ type: "move", direction: "forward" })), [
      "uplinkCodePickedUp",
    ]);
    assertEquals(eventTypes(session.handlePlayerCommand({ type: "move", direction: "forward" })), ["weaponPickedUp"]);
    assertEquals(eventTypes(session.handlePlayerCommand({ type: "move", direction: "forward" })), ["ammoPickedUp"]);

    assertEquals(session.getPlayerState().heldKeys, [KeyColor.Red]);
    assertEquals(session.getPlayerState().hasUplinkCode, true);
    assertEquals(session.getPlayerState().unlockedWeapons, [1, 2]);
    assertEquals(session.getPlayerState().ammo.pistol, 5);
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("opening a door consumes a turn and refreshes visibility through it", async () => {
  const session = await createGameSession(
    testMap([
      { prefab: "door", x: 2, y: 1 },
      { prefab: "item", x: 3, y: 1, item: ItemKind.HealthPatch, amount: 1 },
    ], 5),
    () => 0,
  );
  try {
    assertEquals(session.getVisibility().isVisible(3, 1), false);

    const result = session.handlePlayerCommand({ type: "interact" });

    assertEquals(eventTypes(result), ["doorOpened"]);
    assertEquals(session.getVisibility().isVisible(3, 1), true);
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("activating an uplink terminal completes the level and clears transient state", async () => {
  const session = await createGameSession(
    testMap([{ prefab: "uplinkTerminal", x: 2, y: 1, goto: "Next Map" }]),
    () => 0,
    {
      hasUplinkCode: true,
      heldKeys: [KeyColor.Blue],
      progress: { xp: 5, levelCredits: 13 },
    },
  );
  try {
    const result = session.handlePlayerCommand({ type: "interact" });

    assertEquals(eventTypes(result), ["uplinkTerminalActivated", "xpGained"]);
    assertEquals(result.mapChange, { goto: "Next Map" });
    assertEquals(session.getPlayerState().hasUplinkCode, false);
    assertEquals(session.getPlayerState().heldKeys, []);
    assertEquals(session.getPlayerState().progress, {
      credits: 0,
      score: 0,
      xp: 18,
      levelCredits: 0,
    });
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("activating a victory uplink terminal reports the victory outcome", async () => {
  const session = await createGameSession(
    testMap([{ prefab: "uplinkTerminal", x: 2, y: 1, goto: VICTORY_GOTO }]),
    () => 0,
    { hasUplinkCode: true },
  );
  try {
    const result = session.handlePlayerCommand({ type: "interact" });

    assertEquals(eventTypes(result), ["uplinkTerminalActivated"]);
    assertEquals(result.outcome, "victory");
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("ranged attacks spend ammo before resolving combat and level credit", async () => {
  const session = await createGameSession(
    testMap([{
      prefab: "enemy",
      x: 2,
      y: 1,
      dir: Direction.West,
      displayName: DisplayName.Imp,
      archetype: EnemyArchetype.NetworkNeophyte,
    }]),
    sequenceRandom([0.999, 0]),
    {
      selectedWeapon: 2,
      unlockedWeapons: [2],
      ammo: { pistol: 1 },
    },
  );
  try {
    const result = session.handlePlayerCommand({ type: "attack" });

    assertEquals(eventTypes(result), ["ammoSpent", "damageDealt", "entityDefeated", "creditsEarned"]);
    assertEquals(session.getPlayerState().ammo.pistol, 0);
    assertEquals(session.getPlayerState().progress, {
      credits: 10,
      score: 10,
      xp: 0,
      levelCredits: 10,
    });
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("only consumed player turns tick active turn effects", async () => {
  const session = await createGameSession(
    testMap([]),
    () => 0,
    {
      turnEffects: [{ kind: TurnEffectKind.Invisibility, remainingTurns: 2 }],
    },
  );
  try {
    session.handlePlayerCommand({ type: "turn", direction: "left" });
    assertEquals(session.getPlayerState().turnEffects, [
      { kind: TurnEffectKind.Invisibility, remainingTurns: 2 },
    ]);

    session.handlePlayerCommand({ type: "wait" });
    assertEquals(session.getPlayerState().turnEffects, [
      { kind: TurnEffectKind.Invisibility, remainingTurns: 1 },
    ]);
  } finally {
    session[Symbol.dispose]();
  }
});

function testMap(entities: readonly EntityDef[], width = 5): GameMap {
  return flatTestMap(width, 3, [
    { prefab: "player", x: 1, y: 1, dir: Direction.East },
    ...entities,
  ]);
}

function eventTypes(result: PlayerCommandResult): readonly string[] {
  return result.events.map((event) => event.type);
}

function sequenceRandom(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    index++;
    return value ?? 0;
  };
}
