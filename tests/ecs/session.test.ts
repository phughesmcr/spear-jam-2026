import { dialogueTreeCode, DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import { SPRITE_ATTACK_MS, SPRITE_DEATH_MS, SPRITE_WALK_MS, SpriteAnimationKind } from "@/src/ecs/components.ts";
import type { ActorDrawableEntity, DrawableEntity } from "@/src/ecs/drawables.ts";
import { DrawableKind, SpriteId } from "@/src/ecs/drawables.ts";
import { createGameSession } from "@/src/ecs/session.ts";
import type { PlayerCommandResult } from "@/src/game/commands.ts";
import { DisplayName, displayNameCode } from "@/src/game/names.ts";
import { type EnemyIdleSoundSource, type SoundEmitterSnapshot, SoundId } from "@/src/game/sound.ts";
import { storyEventCode, StoryEventId, StoryFlag, storyTargetCode, StoryTargetId } from "@/src/game/story.ts";
import { Direction } from "@/src/grid/direction.ts";
import type { EntityDef, GameMap } from "@/src/map/map.ts";
import { createGameMap, KeyColor, VICTORY_GOTO } from "@/src/map/map.ts";
import { terminalDestinationCode } from "@/src/map/maps.ts";
import { DEFAULT_BARS_TERRAIN_ID, DEFAULT_WALL_TERRAIN_ID } from "@/src/map/terrain_palettes.ts";
import { flatTestMap } from "@/tests/ecs/helpers.ts";
import { assert, assertEquals, assertRejects } from "@std/assert";

Deno.test("createGameSession initializes default player progression and requires a player spawn", async () => {
  const session = await createGameSession(testMap([]), () => 0);
  try {
    assertEquals(session.getPlayerStatus().heldKeys, []);
    assertEquals(session.getPlayerStatus().health, { current: 10, max: 10 });
  } finally {
    session[Symbol.dispose]();
  }

  await assertRejects(
    () => createGameSession(flatTestMap(3, 2), () => 0),
    Error,
    "player spawn",
  );
});

Deno.test("createGameSession cheat option starts with full loadout", async () => {
  const session = await createGameSession(testMap([]), () => 0, { cheat: true });
  try {
    assertEquals(session.getPlayerStatus(), {
      heldKeys: [],
      selectedWeapon: 1,
      unlockedWeapons: [1, 2, 3],
      ammo: { pistol: 99, cannon: 99 },
      health: { current: 10, max: 10 },
      hasUplinkCode: false,
      progress: { credits: 0, score: 0, xp: 0, levelCredits: 0 },
    });
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("cheat resetRun restores the cheat loadout", async () => {
  const session = await createGameSession(testMap([]), () => 0, { cheat: true });
  try {
    session.resetRun(flatTestMap(5, 3, [{ prefab: "player", x: 2, y: 1, dir: Direction.South }]));

    assertEquals(session.getPlayerStatus(), {
      heldKeys: [],
      selectedWeapon: 1,
      unlockedWeapons: [1, 2, 3],
      ammo: { pistol: 99, cannon: 99 },
      health: { current: 10, max: 10 },
      hasUplinkCode: false,
      progress: { credits: 0, score: 0, xp: 0, levelCredits: 0 },
    });
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("player movement collects map-authored pickups into player state", async () => {
  const session = await createGameSession(
    testMap([
      { prefab: "key", x: 2, y: 1, color: KeyColor.Red },
      { prefab: "uplinkCode", x: 3, y: 1 },
      { prefab: "weaponPickup", x: 4, y: 1, slot: 2 },
      { prefab: "item", x: 5, y: 1, item: "pistolAmmo", amount: 5 },
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

    assertEquals(session.getPlayerStatus().heldKeys, [KeyColor.Red]);
    assertEquals(session.getPlayerStatus().hasUplinkCode, true);
    assertEquals(session.getPlayerStatus().unlockedWeapons, [1, 2]);
    assertEquals(session.getPlayerStatus().ammo.pistol, 5);
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("opening a door consumes a turn and refreshes visibility through it", async () => {
  const session = await createGameSession(
    testMap([
      { prefab: "door", x: 2, y: 1 },
      { prefab: "item", x: 3, y: 1, item: "healthPatch", amount: 1 },
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

Deno.test("talking to John once opens dialogue and moves him off the entrance", async () => {
  await withFakePerformanceNow(100, async () => {
    const session = await createGameSession(storyTestMap(), () => 0);
    try {
      const result = session.handlePlayerCommand({ type: "interact" });

      if (result.type !== "dialogue") throw new Error(`Expected dialogue result, got ${result.type}.`);
      assertEquals(result.dialogue.title, "John");
      assertEquals(session.getStoryFlags(), []);
      assertEquals(actorAt(sessionDrawables(session), 2, 1)?.x, 2);

      session.closeDialogue();

      assertEquals(session.getStoryFlags(), [StoryFlag.JohnSpoken]);
      assertEquals(actorAt(sessionDrawables(session), 2, 1), undefined);

      session.handlePlayerCommand({ type: "move", direction: "forward" });
      assertEquals(playerPosition(session), { x: 2, y: 1 });
      session.handlePlayerCommand({ type: "turn", direction: "right" });
      session.handlePlayerCommand({ type: "move", direction: "forward" });
      session.handlePlayerCommand({ type: "move", direction: "forward" });
      session.handlePlayerCommand({ type: "turn", direction: "right" });

      const john = actorAt(sessionDrawables(session), 1, 3);
      assertEquals(john?.x, 1);
      assertEquals(john?.animation?.kind, SpriteAnimationKind.Walk);
      assertEquals(john?.animation?.startedAtMs, 100);
      assert((john?.animation?.durationMs ?? 0) > SPRITE_WALK_MS);
    } finally {
      session[Symbol.dispose]();
    }
  });
});

Deno.test("John's talk story event is one-shot", async () => {
  const session = await createGameSession(storyTestMap(), () => 0);
  try {
    session.handlePlayerCommand({ type: "interact" });
    session.closeDialogue();
    session.handlePlayerCommand({ type: "move", direction: "forward" });
    session.handlePlayerCommand({ type: "turn", direction: "right" });
    session.handlePlayerCommand({ type: "move", direction: "forward" });
    session.handlePlayerCommand({ type: "move", direction: "forward" });
    session.handlePlayerCommand({ type: "turn", direction: "right" });

    const secondTalk = session.handlePlayerCommand({ type: "interact" });

    if (secondTalk.type !== "dialogue") throw new Error(`Expected dialogue result, got ${secondTalk.type}.`);
    assertEquals(secondTalk.dialogue.title, "John");
    session.closeDialogue();
    assertEquals(session.getStoryFlags(), [StoryFlag.JohnSpoken]);
    assertEquals(actorAt(sessionDrawables(session), 1, 3)?.x, 1);
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("createGameSession rejects duplicate content-backed story targets", async () => {
  await assertRejects(
    () =>
      createGameSession(
        storyTestMap([{
          prefab: "npc",
          x: 3,
          y: 1,
          dir: Direction.South,
          displayName: DisplayName.John,
          storyId: StoryTargetId.John,
        }]),
        () => 0,
      ),
    Error,
    'Duplicate story target "john".',
  );
});

Deno.test("blocked story destination leaves John in place and does not set the flag", async () => {
  const session = await createGameSession(storyTestMap([{ prefab: "door", x: 1, y: 3 }]), () => 0);
  try {
    const result = session.handlePlayerCommand({ type: "interact" });

    if (result.type !== "dialogue") throw new Error(`Expected dialogue result, got ${result.type}.`);
    assertEquals(result.dialogue.title, "John");
    assertEquals(session.getStoryFlags(), []);
    assertEquals(actorAt(sessionDrawables(session), 2, 1)?.x, 2);

    session.closeDialogue();

    assertEquals(session.getStoryFlags(), []);
    assertEquals(actorAt(sessionDrawables(session), 2, 1)?.x, 2);

    session.handlePlayerCommand({ type: "move", direction: "forward" });
    assertEquals(playerPosition(session), { x: 1, y: 1 });
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
      { prefab: "item", x: 3, y: 1, item: "healthPatch", amount: 1 },
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

Deno.test("blocked movement results include positional sound cues", async () => {
  const session = await createGameSession(
    createGameMap("Blocked", [
      [0, 0, 0],
      [0, 0, DEFAULT_WALL_TERRAIN_ID],
      [0, 0, 0],
    ], [
      { prefab: "player", x: 1, y: 1, dir: Direction.East },
    ]),
    () => 0,
  );
  try {
    const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

    assertEquals(eventTypes(result), []);
    assertEquals(result.soundCues, [
      { soundId: SoundId.BlockedMove, position: { x: 1, y: 1 }, radius: 2 },
    ]);
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("pickup results include positional sound cues", async () => {
  const session = await createGameSession(
    testMap([{ prefab: "key", x: 2, y: 1, color: KeyColor.Red }]),
    () => 0,
  );
  try {
    const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

    assertEquals(eventTypes(result), ["keyPickedUp"]);
    assertEquals(result.soundCues, [
      { soundId: SoundId.PickupKey, position: { x: 2, y: 1 }, radius: 3 },
    ]);
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("sessions expose ambient emitters and enemy idle sound sources", async () => {
  const session = await createGameSession(
    testMap([
      {
        prefab: "sound",
        x: 2,
        y: 1,
        soundId: SoundId.AmbientLightBuzz,
        radius: 4,
        volume: 0.25,
      },
      {
        prefab: "enemy",
        x: 3,
        y: 1,
        dir: Direction.West,
        displayName: DisplayName.DigitalDog,
        archetype: "meleeDog",
      },
    ]),
    () => 0,
  );
  try {
    assertEquals(sessionSoundEmitters(session).map(withoutEntity), [{
      soundId: SoundId.AmbientLightBuzz,
      x: 2,
      y: 1,
      radius: 4,
      volume: 0.25,
    }]);
    assertEquals(sessionEnemyIdleSoundSources(session).map(withoutEntity), [{
      soundId: SoundId.EnemyIdle,
      x: 3,
      y: 1,
      radius: 5,
      volume: 0.42,
      minDelayMs: 7000,
      maxDelayMs: 14000,
    }]);
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("a secret door stays hidden from smart actions but reveals and opens when bumped", async () => {
  const session = await createGameSession(
    testMap([
      { prefab: "door", x: 2, y: 1, secret: true },
      { prefab: "item", x: 3, y: 1, item: "healthPatch", amount: 1 },
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

Deno.test("glass doors reject OPEN and shatter on attack to allow passage", async () => {
  const session = await createGameSession(
    testMap([
      { prefab: "door", x: 2, y: 1, glass: true },
      { prefab: "item", x: 3, y: 1, item: "healthPatch", amount: 1 },
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
  const doorState = (): { readonly glass: boolean; readonly open: boolean } | undefined => {
    let state: { readonly glass: boolean; readonly open: boolean } | undefined;
    session.forEachDrawable((drawable) => {
      if (drawable.kind === DrawableKind.Door) state = { glass: drawable.glass, open: drawable.open };
    });
    return state;
  };
  try {
    // Glass is see-through while closed, but still blocks movement.
    assertEquals(session.getVisibility().isVisible(3, 1), true);
    assertEquals(doorState(), { glass: true, open: false });
    assertEquals(eventTypes(session.handlePlayerCommand({ type: "interact", verb: "open" })), ["doorCannotOpen"]);
    assertEquals(doorState(), { glass: true, open: false });
    assertEquals(playerPosition(), { x: 1, y: 1 });

    // Smart action falls through to attack and shatters the pane.
    assertEquals(eventTypes(session.handlePlayerCommand({ type: "smartAction" })), ["doorShattered"]);
    assertEquals(doorState(), { glass: true, open: true });

    session.handlePlayerCommand({ type: "move", direction: "forward" });
    assertEquals(playerPosition(), { x: 2, y: 1 });
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("consumed player actions run enemy phase and visibility refresh", async () => {
  const session = await createGameSession(
    testMap([
      { prefab: "door", x: 2, y: 1 },
      {
        prefab: "enemy",
        x: 5,
        y: 1,
        dir: Direction.West,
        displayName: DisplayName.NetworkNeophyte,
        archetype: "networkNeophyte",
      },
    ], 7),
    () => 0,
  );
  try {
    const result = session.handlePlayerCommand({ type: "interact" });
    const enemies: { readonly x: number; readonly y: number }[] = [];
    session.forEachDrawable((drawable) => {
      if (drawable.kind === DrawableKind.Actor) enemies.push({ x: drawable.x, y: drawable.y });
    });

    assertEquals(eventTypes(result), ["doorOpened"]);
    assertEquals(enemies, [{ x: 4, y: 1 }]);
    assertEquals(session.getVisibility().isVisible(4, 1), true);
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("activating an uplink terminal completes the level and clears transient state", async () => {
  const session = await createGameSession(
    testMap([
      {
        prefab: "enemy",
        x: 2,
        y: 1,
        dir: Direction.West,
        displayName: DisplayName.DigitalDog,
        archetype: "meleeDog",
        health: 1,
      },
      { prefab: "uplinkCode", x: 2, y: 1 },
      { prefab: "uplinkTerminal", x: 3, y: 1, goto: "Data Conduit" },
    ]),
    sequenceRandom([0.999, 0]),
  );
  try {
    assertEquals(eventTypes(session.handlePlayerCommand({ type: "attack" })), [
      "damageDealt",
      "entityDefeated",
      "creditsEarned",
    ]);
    assertEquals(eventTypes(session.handlePlayerCommand({ type: "move", direction: "forward" })), [
      "uplinkCodePickedUp",
    ]);

    const result = session.handlePlayerCommand({ type: "interact" });

    assertEquals(eventTypes(result), ["uplinkTerminalActivated", "xpGained"]);
    if (result.type !== "mapChange") throw new Error(`Expected map change result, got ${result.type}.`);
    assertEquals(result.mapChange, { goto: "Data Conduit" });
    assertEquals(session.getPlayerStatus().hasUplinkCode, false);
    assertEquals(session.getPlayerStatus().heldKeys, []);
    assertEquals(session.getPlayerStatus().progress, {
      credits: 10,
      score: 10,
      xp: 10,
      levelCredits: 0,
    });
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("activating a victory uplink terminal reports the victory outcome", async () => {
  const session = await createGameSession(
    testMap([
      { prefab: "uplinkCode", x: 2, y: 1 },
      { prefab: "uplinkTerminal", x: 3, y: 1, goto: VICTORY_GOTO },
    ]),
    () => 0,
  );
  try {
    assertEquals(eventTypes(session.handlePlayerCommand({ type: "move", direction: "forward" })), [
      "uplinkCodePickedUp",
    ]);

    const result = session.handlePlayerCommand({ type: "interact" });

    assertEquals(eventTypes(result), ["uplinkTerminalActivated"]);
    if (result.type !== "outcome") throw new Error(`Expected outcome result, got ${result.type}.`);
    assertEquals(result.outcome, "victory");
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("normal map loads keep the same player entity and durable progression", async () => {
  const session = await createGameSession(
    testMap([
      { prefab: "key", x: 2, y: 1, color: KeyColor.Red },
      { prefab: "uplinkCode", x: 3, y: 1 },
      { prefab: "weaponPickup", x: 4, y: 1, slot: 2 },
      { prefab: "item", x: 5, y: 1, item: "pistolAmmo", amount: 5 },
    ], 7),
    () => 0,
  );
  try {
    const playerEntity = session.getPlayerEntity();
    session.handlePlayerCommand({ type: "move", direction: "forward" });
    session.handlePlayerCommand({ type: "move", direction: "forward" });
    session.handlePlayerCommand({ type: "move", direction: "forward" });
    session.handlePlayerCommand({ type: "move", direction: "forward" });

    session.loadMap(flatTestMap(5, 3, [{ prefab: "player", x: 3, y: 1, dir: Direction.West }]));

    assertEquals(session.getPlayerEntity(), playerEntity);
    assertEquals(playerPosition(session), { x: 3, y: 1 });
    assertEquals(session.getPlayerFacing(), { dir: Direction.West });
    assertEquals(session.getPlayerStatus(), {
      heldKeys: [KeyColor.Red],
      selectedWeapon: 1,
      unlockedWeapons: [1, 2],
      ammo: { pistol: 5, cannon: 0 },
      health: { current: 10, max: 10 },
      hasUplinkCode: true,
      progress: { credits: 0, score: 0, xp: 0, levelCredits: 0 },
    });
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("normal map loads preserve durable story flags", async () => {
  const session = await createGameSession(storyTestMap(), () => 0);
  try {
    session.handlePlayerCommand({ type: "interact" });
    session.closeDialogue();
    assertEquals(session.getStoryFlags(), [StoryFlag.JohnSpoken]);

    session.loadMap(testMap([]));

    assertEquals(session.getStoryFlags(), [StoryFlag.JohnSpoken]);
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("normal map loads clear old metadata components and write new map metadata", async () => {
  const session = await createGameSession(storyTestMap(), () => 0);
  try {
    assertEquals(session.getMapScopedMetadata(), [{
      displayName: displayNameCode(DisplayName.John),
      dialogueTreeId: dialogueTreeCode(DialogueTreeId.JohnIntro),
      storyId: storyTargetCode(StoryTargetId.John),
      onTalkEvent: storyEventCode(StoryEventId.JohnSpoken),
    }]);

    session.loadMap(testMap([{ prefab: "uplinkTerminal", x: 2, y: 1, goto: "Data Conduit" }]));

    assertEquals(session.getMapScopedMetadata(), [{
      terminalDestination: terminalDestinationCode("Data Conduit"),
    }]);
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("map-scoped entities, death effects, and corpses do not survive map loads", async () => {
  await withFakePerformanceNow(200, async () => {
    const session = await createGameSession(
      testMap([
        { prefab: "key", x: 4, y: 1, color: KeyColor.Red },
        {
          prefab: "enemy",
          x: 2,
          y: 1,
          dir: Direction.West,
          displayName: DisplayName.DigitalDog,
          archetype: "meleeDog",
          health: 1,
        },
      ], 5),
      sequenceRandom([0.999, 0]),
    );
    try {
      assertEquals(spriteAt(sessionDrawables(session), 4, 1)?.spriteId, SpriteId.RedKey);
      session.handlePlayerCommand({ type: "attack" });
      assertEquals(spriteAt(sessionDrawables(session), 2, 1)?.spriteId, SpriteId.DigitalDog);
      assertEquals(session.tick(200 + SPRITE_DEATH_MS), { needsFrame: false });
      assertEquals(spriteAt(sessionDrawables(session), 2, 1)?.spriteId, SpriteId.Corpse);

      session.loadMap(flatTestMap(5, 3, [{ prefab: "player", x: 1, y: 1, dir: Direction.East }]));

      const sprites = sessionDrawables(session).filter((drawable) => drawable.kind === DrawableKind.Sprite);
      assertEquals(sprites, []);
    } finally {
      session[Symbol.dispose]();
    }
  });
});

Deno.test("retryMap restores the current level-entry checkpoint and map content", async () => {
  const level = testMap([
    { prefab: "key", x: 2, y: 1, color: KeyColor.Red },
    { prefab: "item", x: 3, y: 1, item: "pistolAmmo", amount: 4 },
  ], 5);
  const session = await createGameSession(level, () => 0);
  try {
    session.handlePlayerCommand({ type: "move", direction: "forward" });
    session.handlePlayerCommand({ type: "move", direction: "forward" });

    session.retryMap(level);

    assertEquals(playerPosition(session), { x: 1, y: 1 });
    assertEquals(session.getPlayerStatus().heldKeys, []);
    assertEquals(session.getPlayerStatus().ammo.pistol, 0);
    assertEquals(session.getPlayerStatus().health, { current: 10, max: 10 });
    assertEquals(spriteAt(sessionDrawables(session), 2, 1)?.spriteId, SpriteId.RedKey);
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("resetRun clears durable state and returns to the start map spawn", async () => {
  const session = await createGameSession(
    testMap([
      { prefab: "key", x: 2, y: 1, color: KeyColor.Red },
      { prefab: "uplinkCode", x: 3, y: 1 },
      { prefab: "weaponPickup", x: 4, y: 1, slot: 2 },
      { prefab: "item", x: 5, y: 1, item: "pistolAmmo", amount: 5 },
    ], 7),
    () => 0,
  );
  try {
    session.handlePlayerCommand({ type: "move", direction: "forward" });
    session.handlePlayerCommand({ type: "move", direction: "forward" });
    session.handlePlayerCommand({ type: "move", direction: "forward" });
    session.handlePlayerCommand({ type: "move", direction: "forward" });

    session.resetRun(flatTestMap(5, 3, [{ prefab: "player", x: 2, y: 1, dir: Direction.South }]));

    assertEquals(playerPosition(session), { x: 2, y: 1 });
    assertEquals(session.getPlayerFacing(), { dir: Direction.South });
    assertEquals(session.getStoryFlags(), []);
    assertEquals(session.getPlayerStatus(), {
      heldKeys: [],
      selectedWeapon: 1,
      unlockedWeapons: [1],
      ammo: { pistol: 0, cannon: 0 },
      health: { current: 10, max: 10 },
      hasUplinkCode: false,
      progress: { credits: 0, score: 0, xp: 0, levelCredits: 0 },
    });
  } finally {
    session[Symbol.dispose]();
  }
});

Deno.test("ranged attacks spend ammo before resolving combat and level credit", async () => {
  const session = await createGameSession(
    testMap([
      { prefab: "weaponPickup", x: 2, y: 1, slot: 2 },
      { prefab: "item", x: 3, y: 1, item: "pistolAmmo", amount: 1 },
    ], 5),
    sequenceRandom([0.999, 0]),
  );
  try {
    assertEquals(eventTypes(session.handlePlayerCommand({ type: "move", direction: "forward" })), ["weaponPickedUp"]);
    assertEquals(eventTypes(session.handlePlayerCommand({ type: "move", direction: "forward" })), ["ammoPickedUp"]);
    assertEquals(eventTypes(session.handlePlayerCommand({ type: "selectWeapon", slot: 2 })), ["weaponSelected"]);

    session.loadMap(testMap([
      {
        prefab: "enemy",
        x: 3,
        y: 1,
        dir: Direction.West,
        displayName: DisplayName.DigitalDog,
        archetype: "meleeDog",
      },
    ]));

    const result = session.handlePlayerCommand({ type: "attack" });

    assertEquals(eventTypes(result), ["ammoSpent", "damageDealt", "entityDefeated", "creditsEarned"]);
    assertEquals(session.getPlayerStatus().ammo.pistol, 0);
    assertEquals(session.getPlayerStatus().progress, {
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
        archetype: "meleeDog",
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

      assertEquals(session.tick(100 + SPRITE_ATTACK_MS), { needsFrame: false });
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
        x: 5,
        y: 1,
        dir: Direction.West,
        displayName: DisplayName.NetworkNeophyte,
        archetype: "networkNeophyte",
      }], 7),
      sequenceRandom([]),
    );
    try {
      const result = session.handlePlayerCommand({ type: "wait" });
      assertEquals(eventTypes(result), []);

      assertEquals(actorAt(sessionDrawables(session), 4, 1)?.animation, {
        kind: SpriteAnimationKind.Walk,
        startedAtMs: 100,
        durationMs: SPRITE_WALK_MS,
      });

      assertEquals(session.tick(100 + SPRITE_WALK_MS), { needsFrame: false });
      assertEquals(actorAt(sessionDrawables(session), 4, 1)?.animation, undefined);
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
        archetype: "meleeDog",
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

      assertEquals(session.tick(200 + SPRITE_DEATH_MS), { needsFrame: false });
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

function testMap(entities: readonly EntityDef[], width = 5): GameMap {
  return flatTestMap(width, 3, [
    { prefab: "player", x: 1, y: 1, dir: Direction.East },
    ...entities,
  ]);
}

function storyTestMap(entities: readonly EntityDef[] = []): GameMap {
  return flatTestMap(5, 6, [
    { prefab: "player", x: 1, y: 1, dir: Direction.East },
    {
      prefab: "npc",
      x: 2,
      y: 1,
      dir: Direction.South,
      displayName: DisplayName.John,
      dialogueTreeId: DialogueTreeId.JohnIntro,
      storyId: StoryTargetId.John,
      onTalkEvent: StoryEventId.JohnSpoken,
    },
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

function sessionSoundEmitters(session: { forEachSoundEmitter(visit: (emitter: SoundEmitterSnapshot) => void): void }) {
  const emitters: SoundEmitterSnapshot[] = [];
  session.forEachSoundEmitter((emitter) => emitters.push({ ...emitter }));
  return emitters;
}

function sessionEnemyIdleSoundSources(
  session: { forEachEnemyIdleSoundSource(visit: (source: EnemyIdleSoundSource) => void): void },
) {
  const sources: EnemyIdleSoundSource[] = [];
  session.forEachEnemyIdleSoundSource((source) => sources.push({ ...source }));
  return sources;
}

function withoutEntity<T extends SoundEmitterSnapshot>(source: T): Omit<T, "entity"> {
  const { entity: _entity, ...snapshot } = source;
  return snapshot;
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
