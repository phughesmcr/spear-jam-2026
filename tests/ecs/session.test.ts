import { assertEquals, assertRejects } from "@std/assert";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import { AttackFacingRequirement, AttackPattern, AttackTargetMode, Blocking, Health, Locked } from "@/src/ecs/components.ts";
import { GridPos } from "@/src/ecs/components.ts";
import { DisplayName } from "@/src/game/names.ts";
import { createGameSession } from "@/src/ecs/session.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { LockId, scopedLockId, VICTORY_GOTO } from "@/src/map/map.ts";
import {
  createTestDoor,
  createTestEnemy,
  createTestKey,
  createTestNpc,
  createTestPlayer,
  createTestSession,
  flatTestMap,
} from "@/tests/ecs/helpers.ts";

Deno.test("interacting with an NPC enters dialogue without consuming a turn", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  createTestNpc(world, {
    x: 2,
    y: 1,
    displayName: DisplayName.John,
    dialogueTreeId: DialogueTreeId.JohnIntro,
    interactable: true,
  });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "interact" });

  assertEquals(result, {
    events: [],
    dialogue: {
      title: "John",
      message: "Stay sharp. Space to continue.",
    },
  });
});

Deno.test("interacting with an NPC without dialogue data falls back to silence", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  createTestNpc(world, {
    x: 2,
    y: 1,
    displayName: DisplayName.John,
    interactable: true,
  });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "interact" });

  assertEquals(result, {
    events: [],
    dialogue: {
      title: "John",
      message: "John stayed silent. Space to continue.",
    },
  });
});

Deno.test("moving onto a key emits a pickup event and stores a map-scoped key", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const key = createTestKey(world, { x: 2, y: 1, lockId: LockId.Door1 });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

  assertEquals(result.events, [
    {
      type: "keyPickedUp",
      entity: key,
    },
  ]);
  assertEquals(world.entities.isActive(key), false);
  assertEquals(session.getPlayerState().heldKeys, [scopedLockId(TEST_MAP.name, LockId.Door1)]);
});

Deno.test("interacting with a locked door emits an event without consuming a turn", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const door = createTestDoor(world, {
    x: 2,
    y: 1,
    lockId: LockId.Door1,
    blocking: true,
    interactable: true,
  });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "interact" });

  assertEquals(result, {
    events: [
      {
        type: "doorLocked",
        entity: door,
      },
    ],
  });
  assertEquals(world.components.entityHas(Blocking, door), true);
});

Deno.test("a key from another map does not open this map's lock", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const door = createTestDoor(world, {
    x: 2,
    y: 1,
    lockId: LockId.Door1,
    blocking: true,
    interactable: true,
  });

  const session = createTestSession(world, playerEntity, TEST_MAP, {
    playerState: { heldKeys: [scopedLockId("Another Map", LockId.Door1)], selectedWeapon: 1 },
  });

  const result = session.handlePlayerCommand({ type: "interact" });
  assertEquals(result.events, [{ type: "doorLocked", entity: door }]);
  assertEquals(world.components.entityHas(Locked, door), true);
});

Deno.test("opening a locked door consumes the key and unblocks movement", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);
  const door = createTestDoor(world, {
    x: 2,
    y: 1,
    lockId: LockId.Door1,
    blocking: true,
    interactable: true,
  });

  const session = createTestSession(world, playerEntity, TEST_MAP, {
    playerState: { heldKeys: [scopedLockId(TEST_MAP.name, LockId.Door1)], selectedWeapon: 1 },
  });

  const openResult = session.handlePlayerCommand({ type: "interact" });
  assertEquals(openResult.events, [
    {
      type: "doorOpened",
      entity: door,
    },
  ]);
  assertEquals(world.components.entityHas(Blocking, door), false);
  assertEquals(session.getPlayerState().heldKeys, []);

  const moveResult = session.handlePlayerCommand({ type: "move", direction: "forward" });
  assertEquals(moveResult.events, []);
  assertEquals(world.components.getEntityData(GridPos, playerEntity), { x: 2, y: 1 });
});

Deno.test("selecting a weapon emits a player-facing event without consuming a turn", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "selectWeapon", slot: 2 });

  assertEquals(result, {
    events: [
      {
        type: "weaponSelected",
        slot: 2,
        label: "Pistol",
      },
    ],
  });
  assertEquals(session.getPlayerState().selectedWeapon, 2);
});

Deno.test("moving onto a victory exit reports a victory outcome", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world);

  const map = flatTestMap(3, 2, [{ prefab: "exit", x: 2, y: 1, goto: VICTORY_GOTO }]);
  const session = createTestSession(world, playerEntity, map);
  const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

  assertEquals(result, { events: [], outcome: "victory" });
});

Deno.test("an enemy reducing the player to zero health reports a defeat outcome", async () => {
  const world = await createWorld();
  const playerEntity = createTestPlayer(world, {
    blocking: true,
    tag: true,
    health: { current: 1, max: 1 },
  });
  const enemy = createTestEnemy(world, {
    x: 2,
    y: 1,
    dir: 3,
    displayName: DisplayName.Imp,
    attack: {
      minDamage: 1,
      maxDamage: 1,
      range: 1,
      requiresFacing: AttackFacingRequirement.Required,
      attackBonus: 20,
      critThreshold: 0,
      critMultiplier: 1,
      pattern: AttackPattern.Line,
      targets: AttackTargetMode.First,
    },
  });

  const session = createTestSession(world, playerEntity);
  const result = session.handlePlayerCommand({ type: "wait" });

  assertEquals(result.outcome, "defeat");
  assertEquals(result.events, [
    {
      type: "damageDealt",
      actor: enemy,
      actorName: "Imp",
      target: playerEntity,
      targetName: "You",
      amount: 1,
      critical: false,
    },
    {
      type: "entityDefeated",
      actor: enemy,
      entity: playerEntity,
      entityName: "You",
    },
  ]);
  assertEquals(world.entities.isActive(playerEntity), true);
  assertEquals(session.getPlayerState().health, { current: 0, max: 1 });
});

const TEST_MAP = flatTestMap(3, 2);

Deno.test("createGameSession applies carried-over player health", async () => {
  const map = flatTestMap(3, 2, [{ prefab: "player", x: 1, y: 1, dir: 1 }]);
  const session = await createGameSession(map, () => 0, {
    heldKeys: [],
    selectedWeapon: 1,
    health: { current: 3, max: 10 },
  });

  assertEquals(
    session.world.components.getEntityData(Health, session.player.getEntity()),
    { current: 3, max: 10 },
  );
  assertEquals(session.getPlayerState().health, { current: 3, max: 10 });
});

Deno.test("createGameSession spawns the player at full health without carried state", async () => {
  const map = flatTestMap(3, 2, [{ prefab: "player", x: 1, y: 1, dir: 1 }]);
  const session = await createGameSession(map, () => 0);

  assertEquals(session.getPlayerState().health, { current: 10, max: 10 });
});

Deno.test("createGameSession rejects maps without a player spawn", async () => {
  await assertRejects(() => createGameSession(flatTestMap(3, 2), () => 0), Error, "player spawn");
});
