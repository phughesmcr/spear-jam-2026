import { DialogueTreeId } from "@/src/game/content/dialogue/trees.ts";
import { SPRITE_ATTACK_MS, SPRITE_DEATH_MS, SPRITE_WALK_MS } from "@/src/game/simulation/components.ts";
import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import {
  type ActorDrawableEntity,
  type DrawableEntity,
  DrawableKind,
  SpriteAnimationKind,
} from "@/src/game/model/render_snapshot.ts";
import { createGameSession } from "@/tests/game/simulation/helpers.ts";
import { createSessionProjection } from "@/src/game/presentation/session_projection.ts";
import type { PlayerCommandResult } from "@/src/game/model/commands.ts";
import { DisplayName } from "@/src/game/content/names.ts";
import { type EnemyIdleSoundSource, type SoundEmitterSnapshot, SoundId } from "@/src/game/model/sound.ts";
import { StoryEventId, StoryFlag, StoryTargetId } from "@/src/game/content/story.ts";
import { Direction } from "@/src/game/world/direction.ts";
import { type EntityDef, KeyColor } from "@/src/game/content/map_entities.ts";
import { createGameMap, type GameMap } from "@/src/game/world/map.ts";
import { DEFAULT_BARS_TERRAIN_ID, DEFAULT_WALL_TERRAIN_ID } from "@/src/game/world/terrain_palette.ts";
import { flatTestMap, TEST_SESSION_CONTENT } from "@/tests/game/simulation/helpers.ts";
import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";
import type { Entity } from "turn-based-engine/ecs";

Deno.test("createGameSession synchronously initializes default progression and validates the player spawn", () => {
  const session = createGameSession(testMap([]), () => 0);
  assertEquals(session.getPlayerStatus().heldKeys, []);
  assertEquals(session.getPlayerStatus().health, { current: 10, max: 10 });
  assertEquals(Symbol.dispose in session, false);

  assertThrows(
    () => createGameSession(flatTestMap(3, 2), () => 0),
    Error,
    "exactly one player",
  );
});

Deno.test("createGameSession cheat option starts with full loadout", () => {
  const session = createGameSession(testMap([]), () => 0, { cheat: true });
  assertEquals(session.getPlayerStatus(), {
    heldKeys: [],
    selectedWeapon: 1,
    unlockedWeapons: [1, 2, 3],
    ammo: { pistol: 99, cannon: 99 },
    health: { current: 10, max: 10 },
    hasUplinkCode: false,
    hasSpear: true,
    progress: { credits: 0, score: 0, xp: 0, levelCredits: 0 },
  });
});

Deno.test("player movement collects map-authored pickups into player state", () => {
  const session = createGameSession(
    testMap([
      { prefab: "key", x: 2, y: 1, color: KeyColor.Red },
      { prefab: "uplinkCode", x: 3, y: 1 },
      { prefab: "weaponPickup", x: 4, y: 1, slot: 2 },
      { prefab: "item", x: 5, y: 1, item: "pistolAmmo", amount: 5 },
    ], 7),
    () => 0,
  );
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
});

Deno.test("full-health players leave health patches available", () => {
  const session = createGameSession(
    testMap([{ prefab: "item", x: 2, y: 1, item: "healthPatch", amount: 3 }]),
    () => 0,
  );
  const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

  assertEquals(eventTypes(result), []);
  assertEquals(session.getPlayerStatus().health, { current: 10, max: 10 });
  assertEquals(playerPosition(session), { x: 2, y: 1 });
  assertEquals(spriteAt(sessionDrawables(session), 2, 1)?.spriteId, SpriteId.HealthPatch);
});

Deno.test("picking up the spear opens the spear power dialogue", () => {
  const session = createGameSession(
    testMap([{ prefab: "spearPickup", x: 2, y: 1 }]),
    () => 0,
  );
  const result = session.handlePlayerCommand({ type: "move", direction: "forward" });
  if (result.type !== "dialogue") throw new Error(`Expected dialogue result, got ${result.type}.`);
  assertEquals(eventTypes(result), ["spearPickedUp"]);
  assertEquals(result.dialogue.title, "Spear of Destiny");
  assertEquals(
    result.dialogue.message,
    "The Spear of Destiny answers your grip. Circuit-runes flare along the blade — raw system authority, unstable and absolute.",
  );
  assertEquals(session.getPlayerStatus().hasSpear, true);
});

Deno.test("opening a door consumes a turn and refreshes visibility through it", () => {
  const session = createGameSession(
    testMap([
      { prefab: "door", x: 2, y: 1 },
      { prefab: "item", x: 3, y: 1, item: "healthPatch", amount: 1 },
    ], 5),
    () => 0,
  );
  assertEquals(session.getVisibility().isVisible(3, 1), false);
  assertEquals(session.getVisibility().isExplored(3, 1), false);

  const result = session.handlePlayerCommand({ type: "interact" });

  assertEquals(eventTypes(result), ["doorOpened"]);
  assertEquals(session.getVisibility().isVisible(3, 1), true);
  assertEquals(session.getVisibility().isExplored(3, 1), true);
  assertEquals(eventTypes(session.handlePlayerCommand({ type: "interact", verb: "open" })), ["doorAlreadyOpen"]);
});

Deno.test("faced mask-zero items remain examinable", () => {
  const session = createGameSession(
    testMap([{ prefab: "item", x: 2, y: 1, item: "healthPatch", amount: 1 }], 4),
    () => 0,
  );
  const result = session.handlePlayerCommand({ type: "examine" });
  assertEquals(result.events[0]?.type, "examined");
  if (result.events[0]?.type !== "examined") throw new Error("Expected examined event.");
  assertEquals(result.events[0].entity === undefined, false);
});

Deno.test("talking to John once opens dialogue and moves him off the entrance", () => {
  const session = createGameSession(storyTestMap(), () => 0, { now: () => 100 });
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
  assertEquals(john?.animation?.durationMs, SPRITE_WALK_MS);
});

Deno.test("John's talk story event is one-shot", () => {
  const session = createGameSession(storyTestMap(), () => 0);
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
});

Deno.test("createGameSession rejects duplicate content-backed story targets", () => {
  assertThrows(
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

Deno.test("blocked story destination leaves John in place and does not set the flag", () => {
  const session = createGameSession(storyTestMap([{ prefab: "door", x: 1, y: 3 }]), () => 0);
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
});

Deno.test("terrain barriers block movement but not visibility", () => {
  const session = createGameSession(
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
  assertEquals(session.getVisibility().isVisible(3, 1), true);

  const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

  assertEquals(eventTypes(result), []);
  assertEquals(playerPosition(session), { x: 1, y: 1 });
});

Deno.test("blocked movement results include positional sound cues", () => {
  const session = createGameSession(
    createGameMap("Blocked", [
      [0, 0, 0],
      [0, 0, DEFAULT_WALL_TERRAIN_ID],
      [0, 0, 0],
    ], [
      { prefab: "player", x: 1, y: 1, dir: Direction.East },
    ]),
    () => 0,
  );
  const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

  assertEquals(eventTypes(result), []);
  assertEquals(result.soundCues, [
    { soundId: SoundId.BlockedMove, position: { x: 1, y: 1 }, radius: 2 },
  ]);
});

Deno.test("pickup results include positional sound cues", () => {
  const session = createGameSession(
    testMap([{ prefab: "key", x: 2, y: 1, color: KeyColor.Red }]),
    () => 0,
  );
  const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

  assertEquals(eventTypes(result), ["keyPickedUp"]);
  assertEquals(result.soundCues, [
    { soundId: SoundId.PickupKey, position: { x: 2, y: 1 }, radius: 3 },
  ]);
});

Deno.test("sessions expose ambient emitters and enemy idle sound sources", () => {
  const session = createGameSession(
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
  assertEquals(sessionSoundEmitters(session).map(withoutEntity), [{
    soundId: SoundId.AmbientLightBuzz,
    x: 2,
    y: 1,
    radius: 4,
    volume: 0.25,
  }]);
  assertEquals(sessionEnemyIdleSoundSources(session).map(withoutEntity), [{
    soundId: SoundId.DogIdle,
    x: 3,
    y: 1,
    radius: 5,
    volume: 0.42,
    minDelayMs: 7000,
    maxDelayMs: 14000,
  }]);
});

Deno.test("a secret door stays hidden from smart actions but reveals and opens when bumped", () => {
  const session = createGameSession(
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
});

Deno.test("explicitly opening a secret door opens it while keeping the wall disguise", () => {
  const session = createGameSession(
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
  assertEquals(doorState(), { secret: true, open: false });

  // The verb-menu OPEN path must open the door (previously it stayed a solid
  // wall even though the player could walk through).
  const result = session.handlePlayerCommand({ type: "interact", verb: "open" });

  assertEquals(eventTypes(result), ["doorOpened"]);
  assertEquals(doorState(), { secret: true, open: true });
});

Deno.test("glass doors reject OPEN and shatter on attack to allow passage", () => {
  const session = createGameSession(
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
});

Deno.test("consumed player actions run enemy phase and visibility refresh", () => {
  const session = createGameSession(
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
  const result = session.handlePlayerCommand({ type: "interact" });
  const enemies: { readonly x: number; readonly y: number }[] = [];
  session.forEachDrawable((drawable) => {
    if (drawable.kind === DrawableKind.Actor) enemies.push({ x: drawable.x, y: drawable.y });
  });

  assertEquals(eventTypes(result), ["doorOpened", "enemyAlerted"]);
  assertEquals(enemies, [{ x: 4, y: 1 }]);
  assertEquals(session.getVisibility().isVisible(4, 1), true);
});

Deno.test("activating an uplink terminal completes the level and clears transient state", () => {
  let nowMs = 1_000;
  const session = createGameSession(
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
    { now: () => nowMs },
  );
  assertEquals(eventTypes(session.handlePlayerCommand({ type: "move", direction: "forward" })), []);
  assertEquals(eventTypes(session.handlePlayerCommand({ type: "attack" })), [
    "damageDealt",
    "entityDefeated",
    "creditsEarned",
  ]);
  assertEquals(eventTypes(session.handlePlayerCommand({ type: "move", direction: "forward" })), [
    "uplinkCodePickedUp",
  ]);

  nowMs = 126_500;
  const result = session.handlePlayerCommand({ type: "interact" });

  assertEquals(eventTypes(result), ["uplinkTerminalActivated", "xpGained"]);
  if (result.type !== "mapChange") throw new Error(`Expected map change result, got ${result.type}.`);
  assertEquals(result.mapChange, { goto: "Data Conduit" });
  assertEquals(result.levelStats, {
    elapsedMs: 125_500,
    moves: 1,
    monstersKilled: 1,
    totalMonsters: 1,
  });
  assertEquals(session.getPlayerStatus().hasUplinkCode, false);
  assertEquals(session.getPlayerStatus().heldKeys, []);
  assertEquals(session.getPlayerStatus().progress, {
    credits: 10,
    score: 10,
    xp: 10,
    levelCredits: 0,
  });
});

Deno.test("activating a victory uplink terminal reports the victory outcome", () => {
  let nowMs = 500;
  const session = createGameSession(
    testMap([
      { prefab: "uplinkCode", x: 2, y: 1 },
      { prefab: "uplinkTerminal", x: 3, y: 1, goto: "victory" },
    ]),
    () => 0,
    { now: () => nowMs },
  );
  assertEquals(eventTypes(session.handlePlayerCommand({ type: "move", direction: "forward" })), [
    "uplinkCodePickedUp",
  ]);

  nowMs = 2_000;
  const result = session.handlePlayerCommand({ type: "interact" });

  assertEquals(eventTypes(result), ["uplinkTerminalActivated"]);
  if (result.type !== "outcome") throw new Error(`Expected outcome result, got ${result.type}.`);
  assertEquals(result.outcome, "victory");
  if (result.outcome !== "victory") throw new Error("Expected victory stats.");
  assertEquals(result.levelStats, {
    elapsedMs: 1_500,
    moves: 1,
    monstersKilled: 0,
    totalMonsters: 0,
  });
});

Deno.test("Nexus-style terminals reject use until the spear is held", () => {
  const session = createGameSession(
    testMap([
      { prefab: "uplinkCode", x: 2, y: 1 },
      { prefab: "spearPickup", x: 1, y: 0 },
      { prefab: "uplinkTerminal", x: 3, y: 1, goto: "Data Conduit", requiresSpear: true },
    ]),
    () => 0,
  );
  assertEquals(eventTypes(session.handlePlayerCommand({ type: "move", direction: "forward" })), [
    "uplinkCodePickedUp",
  ]);
  assertEquals(eventTypes(session.handlePlayerCommand({ type: "interact" })), ["uplinkTerminalNeedsSpear"]);

  session.handlePlayerCommand({ type: "move", direction: "backward" });
  const spear = session.handlePlayerCommand({ type: "move", direction: "left" });
  if (spear.type !== "dialogue") throw new Error(`Expected spear dialogue, got ${spear.type}.`);
  assertEquals(eventTypes(spear), ["spearPickedUp"]);

  session.handlePlayerCommand({ type: "move", direction: "right" });
  session.handlePlayerCommand({ type: "move", direction: "forward" });
  const result = session.handlePlayerCommand({ type: "interact" });
  assertEquals(eventTypes(result), ["uplinkTerminalActivated"]);
  if (result.type !== "mapChange") throw new Error(`Expected map change result, got ${result.type}.`);
  assertEquals(result.mapChange, { goto: "Data Conduit" });
  assertEquals(session.getPlayerStatus().hasSpear, true);
});

Deno.test("loading the spear turret reports the victory outcome", () => {
  const session = createGameSession(
    testMap([
      { prefab: "spearPickup", x: 2, y: 1 },
      { prefab: "spearTurret", x: 3, y: 1 },
    ]),
    () => 0,
  );
  assertEquals(spriteAt(sessionDrawables(session), 3, 1)?.spriteId, SpriteId.SpearTurret);
  assertEquals(eventTypes(session.handlePlayerCommand({ type: "move", direction: "forward" })), [
    "spearPickedUp",
  ]);

  const result = session.handlePlayerCommand({ type: "interact", verb: "use" });
  assertEquals(eventTypes(result), ["spearTurretLoaded"]);
  if (result.type !== "outcome") throw new Error(`Expected victory outcome, got ${result.type}.`);
  assertEquals(result.outcome, "victory");
  assertEquals(spriteAt(sessionDrawables(session), 3, 1)?.spriteId, SpriteId.SpearTurretLoaded);
});

Deno.test("normal map loads keep durable progression and use the destination spawn pose", () => {
  const session = createGameSession(
    testMap([
      { prefab: "key", x: 2, y: 1, color: KeyColor.Red },
      { prefab: "uplinkCode", x: 3, y: 1 },
      { prefab: "weaponPickup", x: 4, y: 1, slot: 2 },
      { prefab: "item", x: 5, y: 1, item: "pistolAmmo", amount: 5 },
    ], 7),
    () => 0,
  );
  session.handlePlayerCommand({ type: "move", direction: "forward" });
  session.handlePlayerCommand({ type: "move", direction: "forward" });
  session.handlePlayerCommand({ type: "move", direction: "forward" });
  session.handlePlayerCommand({ type: "move", direction: "forward" });

  session.loadMap(flatTestMap(5, 3, [{ prefab: "player", x: 3, y: 1, dir: Direction.West }]));

  assertEquals(playerPosition(session), { x: 3, y: 1 });
  assertEquals(session.getPlayerFacing(), { dir: Direction.West });
  assertEquals(session.getPlayerStatus(), {
    heldKeys: [KeyColor.Red],
    selectedWeapon: 2,
    unlockedWeapons: [1, 2],
    ammo: { pistol: 5, cannon: 0 },
    health: { current: 10, max: 10 },
    hasUplinkCode: true,
    hasSpear: false,
    progress: { credits: 0, score: 0, xp: 0, levelCredits: 0 },
  });
});

Deno.test("map replacement keeps the visibility reader identity and retargets it to the next runtime", () => {
  const session = createGameSession(testMap([]), () => 0);
  const visibility = session.getVisibility();
  assertEquals(visibility.isVisible(6, 1), false);

  session.loadMap(flatTestMap(8, 3, [{ prefab: "player", x: 6, y: 1, dir: Direction.West }]));

  assertStrictEquals(session.getVisibility(), visibility);
  assertEquals(visibility.isVisible(6, 1), true);
});

Deno.test("failed map replacement leaves the current session state untouched", () => {
  const currentMap = testMap([]);
  const session = createGameSession(currentMap, () => 0);
  const visibility = session.getVisibility();
  const player = session.getPlayerEntity();

  assertThrows(
    () =>
      session.loadMap(storyTestMap([{
        prefab: "npc",
        x: 3,
        y: 1,
        dir: Direction.South,
        displayName: DisplayName.John,
        storyId: StoryTargetId.John,
      }])),
    Error,
    'Duplicate story target "john".',
  );

  assertStrictEquals(session.getMap(), currentMap);
  assertStrictEquals(session.getVisibility(), visibility);
  assertStrictEquals(session.getPlayerEntity(), player);
  assertEquals(playerPosition(session), { x: 1, y: 1 });
});

Deno.test("map replacement remains atomic when destination statistics fail to start", () => {
  const currentMap = testMap([]);
  let clockCalls = 0;
  const session = createGameSession(currentMap, () => 0, {
    now: () => {
      clockCalls++;
      if (clockCalls === 2) throw new Error("clock failed");
      return 0;
    },
  });
  const visibility = session.getVisibility();
  const player = session.getPlayerEntity();
  const position = session.getPlayerPosition();
  const facing = session.getPlayerFacing();

  assertThrows(
    () => session.loadMap(flatTestMap(8, 3, [{ prefab: "player", x: 6, y: 1, dir: Direction.West }])),
    Error,
    "clock failed",
  );

  assertStrictEquals(session.getMap(), currentMap);
  assertStrictEquals(session.getVisibility(), visibility);
  assertStrictEquals(session.getPlayerEntity(), player);
  assertEquals(session.getPlayerPosition(), position);
  assertEquals(session.getPlayerFacing(), facing);
});

Deno.test("normal map loads preserve durable story flags", () => {
  const session = createGameSession(storyTestMap(), () => 0);
  session.handlePlayerCommand({ type: "interact" });
  session.closeDialogue();
  assertEquals(session.getStoryFlags(), [StoryFlag.JohnSpoken]);

  session.loadMap(testMap([]));

  assertEquals(session.getStoryFlags(), [StoryFlag.JohnSpoken]);
});

Deno.test("normal map loads clear old metadata components and write new map metadata", () => {
  const session = createGameSession(storyTestMap(), () => 0);
  assertEquals(session.getMapScopedMetadata(), [{
    displayName: TEST_SESSION_CONTENT.simulation.displayNameCode(DisplayName.John),
    dialogueTreeId: TEST_SESSION_CONTENT.dialogue.code(DialogueTreeId.JohnIntro),
    storyId: TEST_SESSION_CONTENT.simulation.storyTargetCode(StoryTargetId.John),
    onTalkEvent: TEST_SESSION_CONTENT.simulation.storyEventCode(StoryEventId.JohnSpoken),
  }]);

  session.loadMap(testMap([{ prefab: "uplinkTerminal", x: 2, y: 1, goto: "Data Conduit" }]));

  assertEquals(session.getMapScopedMetadata(), [{
    terminalDestination: TEST_SESSION_CONTENT.levels.codeForDestination("Data Conduit"),
  }]);
});

Deno.test("map-scoped entities and projected death overlays do not survive map loads", () => {
  const session = createGameSession(
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
    { now: () => 200 },
  );
  assertEquals(spriteAt(sessionDrawables(session), 4, 1)?.spriteId, SpriteId.RedKey);
  session.handlePlayerCommand({ type: "attack" });
  assertEquals(spriteAt(sessionDrawables(session), 2, 1)?.spriteId, SpriteId.DigitalDog);
  assertEquals(session.tick(200 + SPRITE_DEATH_MS), { needsFrame: false });
  assertEquals(spriteAt(sessionDrawables(session), 2, 1)?.spriteId, SpriteId.Corpse);

  session.loadMap(flatTestMap(5, 3, [{ prefab: "player", x: 1, y: 1, dir: Direction.East }]));

  const sprites = sessionDrawables(session).filter((drawable) => drawable.kind === DrawableKind.Sprite);
  assertEquals(sprites, []);
});

Deno.test("retryMap restores the current level-entry checkpoint and map content", () => {
  const level = testMap([
    { prefab: "key", x: 2, y: 1, color: KeyColor.Red },
    { prefab: "item", x: 3, y: 1, item: "pistolAmmo", amount: 4 },
  ], 5);
  const session = createGameSession(level, () => 0);
  session.handlePlayerCommand({ type: "move", direction: "forward" });
  session.handlePlayerCommand({ type: "move", direction: "forward" });

  session.retryMap(level);

  assertEquals(playerPosition(session), { x: 1, y: 1 });
  assertEquals(session.getPlayerStatus().heldKeys, []);
  assertEquals(session.getPlayerStatus().ammo.pistol, 0);
  assertEquals(session.getPlayerStatus().health, { current: 10, max: 10 });
  assertEquals(spriteAt(sessionDrawables(session), 2, 1)?.spriteId, SpriteId.RedKey);
});

Deno.test("retryMap restarts level statistics for the new attempt", () => {
  let nowMs = 1_000;
  const level = testMap([
    { prefab: "uplinkCode", x: 2, y: 1 },
    { prefab: "uplinkTerminal", x: 3, y: 1, goto: "Data Conduit" },
  ]);
  const session = createGameSession(level, () => 0, { now: () => nowMs });
  session.handlePlayerCommand({ type: "move", direction: "forward" });

  nowMs = 5_000;
  session.retryMap(level);
  session.handlePlayerCommand({ type: "move", direction: "forward" });

  nowMs = 6_500;
  const result = session.handlePlayerCommand({ type: "interact" });
  if (result.type !== "mapChange") throw new Error(`Expected map change result, got ${result.type}.`);
  assertEquals(result.levelStats, {
    elapsedMs: 1_500,
    moves: 1,
    monstersKilled: 0,
    totalMonsters: 0,
  });
});

Deno.test("ranged attacks spend ammo before resolving combat and level credit", () => {
  const session = createGameSession(
    testMap([
      { prefab: "weaponPickup", x: 2, y: 1, slot: 2 },
      { prefab: "item", x: 3, y: 1, item: "pistolAmmo", amount: 1 },
    ], 5),
    sequenceRandom([0.999, 0]),
  );
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
});

Deno.test("enemy attacks expose short-lived projected sprite animation state", () => {
  const session = createGameSession(
    testMap([{
      prefab: "enemy",
      x: 2,
      y: 1,
      dir: Direction.West,
      displayName: DisplayName.DigitalDog,
      archetype: "meleeDog",
    }]),
    sequenceRandom([0.999, 0]),
    { now: () => 100 },
  );
  const result = session.handlePlayerCommand({ type: "wait" });
  assertEquals(eventTypes(result), ["enemyAlerted", "damageDealt"]);

  assertEquals(actorAt(sessionDrawables(session), 2, 1)?.animation, {
    kind: SpriteAnimationKind.Attack,
    startedAtMs: 100,
    durationMs: SPRITE_ATTACK_MS,
  });

  assertEquals(session.tick(100 + SPRITE_ATTACK_MS), { needsFrame: false });
  assertEquals(actorAt(sessionDrawables(session), 2, 1)?.animation, undefined);
});

Deno.test("moving enemies expose short-lived projected walk animation state", () => {
  const session = createGameSession(
    testMap([{
      prefab: "enemy",
      x: 5,
      y: 1,
      dir: Direction.West,
      displayName: DisplayName.NetworkNeophyte,
      archetype: "networkNeophyte",
    }], 7),
    sequenceRandom([]),
    { now: () => 100 },
  );
  const result = session.handlePlayerCommand({ type: "wait" });
  assertEquals(eventTypes(result), ["enemyAlerted"]);

  assertEquals(actorAt(sessionDrawables(session), 4, 1)?.animation, {
    kind: SpriteAnimationKind.Walk,
    startedAtMs: 100,
    durationMs: SPRITE_WALK_MS,
  });

  assertEquals(session.tick(100 + SPRITE_WALK_MS), { needsFrame: false });
  assertEquals(actorAt(sessionDrawables(session), 4, 1)?.animation, undefined);
});

Deno.test("defeated enemies render as projected death effects before becoming projected corpses", () => {
  const session = createGameSession(
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
    { now: () => 200 },
  );
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
});

Deno.test("projection expiry converts every simultaneous death overlay into a corpse", () => {
  const projection = createSessionProjection();
  const player = 1 as Entity;
  const first = 2 as Entity;
  const second = 3 as Entity;
  projection.consume(player, [], [
    {
      type: "entityDefeated",
      actor: player,
      entity: first,
      entityName: "First",
      stableId: 2,
      position: { x: 1, y: 1 },
      sprite: SpriteId.DigitalDog,
    },
    {
      type: "entityDefeated",
      actor: player,
      entity: second,
      entityName: "Second",
      stableId: 3,
      position: { x: 2, y: 1 },
      sprite: SpriteId.DigitalDog,
    },
  ], 100);

  assertEquals(projection.advance(100), true);
  assertEquals(projection.advance(100 + SPRITE_DEATH_MS), false);
  assertEquals(
    projection.overlays().map((drawable) => ({
      x: drawable.x,
      y: drawable.y,
      kind: drawable.kind,
      spriteId: drawable.kind === DrawableKind.Sprite ? drawable.spriteId : undefined,
    })),
    [
      { x: 1, y: 1, kind: DrawableKind.Sprite, spriteId: SpriteId.Corpse },
      { x: 2, y: 1, kind: DrawableKind.Sprite, spriteId: SpriteId.Corpse },
    ],
  );
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

function sequenceRandom(values: readonly number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index];
    index++;
    return value ?? 0;
  };
}
