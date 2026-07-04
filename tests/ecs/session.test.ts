import { assertEquals, assertRejects } from "@std/assert";
import {
  ItemKind,
  SPRITE_ATTACK_MS,
  SPRITE_DEATH_MS,
  SPRITE_WALK_MS,
  SpriteAnimationKind,
} from "@/src/ecs/components.ts";
import { DrawableKind, SpriteId } from "@/src/ecs/drawables.ts";
import type { ActorDrawableEntity, DrawableEntity } from "@/src/ecs/drawables.ts";
import { EnemyArchetype } from "@/src/ecs/enemy_catalog.ts";
import { createGameSession } from "@/src/ecs/session.ts";
import type { PlayerCommandResult } from "@/src/game/commands.ts";
import { TurnEffectKind } from "@/src/game/turn_effects.ts";
import { DisplayName } from "@/src/game/names.ts";
import { Direction } from "@/src/grid/direction.ts";
import { createGameMap, KeyColor, VICTORY_GOTO } from "@/src/map/map.ts";
import type { EntityDef, GameMap } from "@/src/map/map.ts";
import { DEFAULT_BARS_TERRAIN_ID, DEFAULT_WALL_TERRAIN_ID } from "@/src/map/terrain_palettes.ts";
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

Deno.test("terrain barriers block movement but not visibility", async () => {
  const session = await createGameSession(
    createGameMap("Barrier", [
      [0, 0, DEFAULT_WALL_TERRAIN_ID, 0, 0],
      [0, 0, DEFAULT_BARS_TERRAIN_ID, 0, 0],
      [0, 0, DEFAULT_WALL_TERRAIN_ID, 0, 0],
    ], [
      { prefab: "player", x: 1, y: 1, dir: Direction.East },
      { prefab: "item", x: 3, y: 1, item: ItemKind.HealthPatch, amount: 1 },
    ]),
    () => 0,
  );
  try {
    assertEquals(session.getVisibility().isVisible(3, 1), true);

    const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

    assertEquals(eventTypes(result), []);
    assertEquals(playerPosition(session), { x: 1, y: 1 });
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("a secret door stays hidden from smart actions but reveals and opens when bumped", async () => {
  const session = await createGameSession(
    testMap([
      { prefab: "door", x: 2, y: 1, secret: true },
      { prefab: "item", x: 3, y: 1, item: ItemKind.HealthPatch, amount: 1 },
    ], 5),
    () => 0,
  );
  const playerPosition = (): { readonly x: number; readonly y: number } => {
    let position = { x: -1, y: -1 };
    session.forEachDrawable((drawable) => {
      if (drawable.kind === DrawableKind.Player) position = { x: drawable.x, y: drawable.y };
    });
    return position;
  };
  const doorState = (): { readonly secret: boolean; readonly open: boolean } | undefined => {
    let state: { readonly secret: boolean; readonly open: boolean } | undefined;
    session.forEachDrawable((drawable) => {
      if (drawable.kind === DrawableKind.Door) state = { secret: drawable.secret, open: drawable.open };
    });
    return state;
  };
  try {
    // Disguised as a wall: blocks sight, and a smart action toward it never
    // reveals or opens it (it falls through to a no-op attack instead).
    assertEquals(session.getVisibility().isVisible(3, 1), false);
    assertEquals(doorState(), { secret: true, open: false });
    assertEquals(eventTypes(session.handlePlayerCommand({ type: "smartAction" })).includes("doorOpened"), false);
    assertEquals(session.getVisibility().isVisible(3, 1), false);
    assertEquals(doorState(), { secret: true, open: false });
    assertEquals(playerPosition(), { x: 1, y: 1 });

    // Walking into it reveals and opens it in one turn (the player holds position).
    const revealed = session.handlePlayerCommand({ type: "move", direction: "forward" });
    assertEquals(eventTypes(revealed), ["doorOpened"]);
    // Opened, but still flagged secret so it keeps sliding as a wall panel
    // (wall texture, no jambs) rather than snapping into a regular door.
    assertEquals(doorState(), { secret: true, open: true });
    assertEquals(playerPosition(), { x: 1, y: 1 });
    assertEquals(session.getVisibility().isVisible(3, 1), true);

    // Once open it behaves like any door: the player can step through.
    session.handlePlayerCommand({ type: "move", direction: "forward" });
    assertEquals(playerPosition(), { x: 2, y: 1 });
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("explicitly opening a secret door opens it while keeping the wall disguise", async () => {
  const session = await createGameSession(
    testMap([{ prefab: "door", x: 2, y: 1, secret: true }], 5),
    () => 0,
  );
  const doorState = (): { readonly secret: boolean; readonly open: boolean } | undefined => {
    let state: { readonly secret: boolean; readonly open: boolean } | undefined;
    session.forEachDrawable((drawable) => {
      if (drawable.kind === DrawableKind.Door) state = { secret: drawable.secret, open: drawable.open };
    });
    return state;
  };
  try {
    assertEquals(doorState(), { secret: true, open: false });

    // The verb-menu OPEN path must open the door (previously it stayed a solid
    // wall even though the player could walk through).
    const result = session.handlePlayerCommand({ type: "interact", verb: "open" });

    assertEquals(eventTypes(result), ["doorOpened"]);
    assertEquals(doorState(), { secret: true, open: true });
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("consumed player actions run enemy phase, turn effects, and visibility refresh", async () => {
  const session = await createGameSession(
    testMap([
      { prefab: "door", x: 2, y: 1 },
      {
        prefab: "enemy",
        x: 4,
        y: 1,
        dir: Direction.West,
        displayName: DisplayName.NetworkNeophyte,
        archetype: EnemyArchetype.NetworkNeophyte,
      },
    ], 6),
    () => 0,
    {
      turnEffects: [{ kind: TurnEffectKind.Invisibility, remainingTurns: 2 }],
    },
  );
  try {
    const result = session.handlePlayerCommand({ type: "interact" });
    const enemies: { readonly x: number; readonly y: number }[] = [];
    session.forEachDrawable((drawable) => {
      if (drawable.kind === DrawableKind.Actor) enemies.push({ x: drawable.x, y: drawable.y });
    });

    assertEquals(eventTypes(result), ["doorOpened"]);
    assertEquals(enemies, [{ x: 3, y: 1 }]);
    assertEquals(session.getPlayerState().turnEffects, [
      { kind: TurnEffectKind.Invisibility, remainingTurns: 1 },
    ]);
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
      displayName: DisplayName.DigitalDog,
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

Deno.test("enemy attacks expose short-lived ECS sprite animation state", async () => {
  await withFakePerformanceNow(100, async () => {
    const session = await createGameSession(
      testMap([{
        prefab: "enemy",
        x: 2,
        y: 1,
        dir: Direction.West,
        displayName: DisplayName.DigitalDog,
        archetype: EnemyArchetype.MeleeDog,
      }]),
      sequenceRandom([0.999, 0]),
    );
    try {
      const result = session.handlePlayerCommand({ type: "wait" });
      assertEquals(eventTypes(result), ["damageDealt"]);

      assertEquals(actorAt(sessionDrawables(session), 2, 1)?.animation, {
        kind: SpriteAnimationKind.Attack,
        startedAtMs: 100,
        durationMs: SPRITE_ATTACK_MS,
      });

      session.advanceSpriteAnimations(100 + SPRITE_ATTACK_MS);
      assertEquals(actorAt(sessionDrawables(session), 2, 1)?.animation, undefined);
    } finally {
      session[Symbol.dispose]();
    }
  });
});

Deno.test("moving enemies expose short-lived ECS walk animation state", async () => {
  await withFakePerformanceNow(100, async () => {
    const session = await createGameSession(
      testMap([{
        prefab: "enemy",
        x: 4,
        y: 1,
        dir: Direction.West,
        displayName: DisplayName.NetworkNeophyte,
        archetype: EnemyArchetype.NetworkNeophyte,
      }], 6),
      sequenceRandom([]),
    );
    try {
      const result = session.handlePlayerCommand({ type: "wait" });
      assertEquals(eventTypes(result), []);

      assertEquals(actorAt(sessionDrawables(session), 3, 1)?.animation, {
        kind: SpriteAnimationKind.Walk,
        startedAtMs: 100,
        durationMs: SPRITE_WALK_MS,
      });

      session.advanceSpriteAnimations(100 + SPRITE_WALK_MS);
      assertEquals(actorAt(sessionDrawables(session), 3, 1)?.animation, undefined);
    } finally {
      session[Symbol.dispose]();
    }
  });
});

Deno.test("defeated enemies render as ECS death effects before becoming corpses", async () => {
  await withFakePerformanceNow(200, async () => {
    const session = await createGameSession(
      testMap([{
        prefab: "enemy",
        x: 2,
        y: 1,
        dir: Direction.West,
        displayName: DisplayName.DigitalDog,
        archetype: EnemyArchetype.MeleeDog,
        health: 1,
      }]),
      sequenceRandom([0.999, 0]),
    );
    try {
      const result = session.handlePlayerCommand({ type: "attack" });
      assertEquals(eventTypes(result), ["damageDealt", "entityDefeated", "creditsEarned"]);

      assertEquals(spriteAt(sessionDrawables(session), 2, 1), {
        kind: DrawableKind.Sprite,
        x: 2,
        y: 1,
        spriteId: SpriteId.DigitalDog,
        animation: {
          kind: SpriteAnimationKind.Death,
          startedAtMs: 200,
          durationMs: SPRITE_DEATH_MS,
        },
      });

      session.advanceSpriteAnimations(200 + SPRITE_DEATH_MS);
      assertEquals(spriteAt(sessionDrawables(session), 2, 1), {
        kind: DrawableKind.Sprite,
        x: 2,
        y: 1,
        spriteId: SpriteId.Corpse,
        animation: undefined,
      });
    } finally {
      session[Symbol.dispose]();
    }
  });
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

function sessionDrawables(session: { forEachDrawable(visit: (drawable: DrawableEntity) => void): void }) {
  const drawables: DrawableEntity[] = [];
  session.forEachDrawable((drawable) => drawables.push({ ...drawable }));
  return drawables;
}

function playerPosition(session: { forEachDrawable(visit: (drawable: DrawableEntity) => void): void }) {
  let position = { x: -1, y: -1 };
  session.forEachDrawable((drawable) => {
    if (drawable.kind === DrawableKind.Player) position = { x: drawable.x, y: drawable.y };
  });
  return position;
}

function actorAt(drawables: readonly DrawableEntity[], x: number, y: number): ActorDrawableEntity | undefined {
  return drawables.find((drawable): drawable is ActorDrawableEntity =>
    drawable.kind === DrawableKind.Actor && drawable.x === x && drawable.y === y
  );
}

function spriteAt(drawables: readonly DrawableEntity[], x: number, y: number) {
  const sprite = drawables.find((drawable) =>
    drawable.kind === DrawableKind.Sprite && drawable.x === x && drawable.y === y
  );
  if (sprite?.kind !== DrawableKind.Sprite) return undefined;
  return {
    kind: sprite.kind,
    x: sprite.x,
    y: sprite.y,
    spriteId: sprite.spriteId,
    animation: sprite.animation,
  };
}

async function withFakePerformanceNow(nowMs: number, run: () => Promise<void>): Promise<void> {
  const hadOwnNow = Object.hasOwn(performance, "now");
  const ownNow = Object.getOwnPropertyDescriptor(performance, "now");
  Object.defineProperty(performance, "now", {
    configurable: true,
    writable: true,
    value: (): number => nowMs,
  });
  try {
    await run();
  } finally {
    if (hadOwnNow && ownNow !== undefined) {
      Object.defineProperty(performance, "now", ownNow);
    } else {
      delete (performance as { now?: () => number }).now;
    }
  }
}

function sequenceRandom(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    index++;
    return value ?? 0;
  };
}
