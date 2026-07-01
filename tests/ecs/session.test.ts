import { assertEquals } from "@std/assert";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import {
  Attack,
  AttackFacingRequirement,
  AttackPattern,
  AttackTargetMode,
  Blocking,
  Dialogue,
  DisplayNameComponent,
  Door,
  Enemy,
  Facing,
  GridPos,
  Health,
  Interactable,
  Key,
  Locked,
  Npc,
  Player as PlayerTag,
  TurnTaker,
} from "@/src/ecs/components.ts";
import { DisplayName } from "@/src/game/names.ts";
import { Player } from "@/src/ecs/player.ts";
import { GameSession } from "@/src/ecs/session.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { LockId, scopedLockId, VICTORY_GOTO } from "@/src/map/map.ts";
import { createEntity, flatTestMap } from "@/tests/ecs/helpers.ts";

Deno.test("interacting with an NPC enters dialogue without consuming a turn", async () => {
  const world = await createWorld();
  const playerEntity = createEntity(world);
  const npc = createEntity(world);

  world.components.addToEntity(GridPos, playerEntity, { x: 1, y: 1 });
  world.components.addToEntity(Facing, playerEntity, { dir: 1 });
  world.components.addToEntity(GridPos, npc, { x: 2, y: 1 });
  world.components.addToEntity(DisplayNameComponent, npc, { displayName: DisplayName.John });
  world.components.addToEntity(Npc, npc);
  world.components.addToEntity(Dialogue, npc, { dialogueTreeId: DialogueTreeId.JohnIntro });
  world.components.addToEntity(Interactable, npc);
  world.refresh();

  const session = new GameSession(world, new Player(world, playerEntity), TEST_MAP, () => 0);
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
  const playerEntity = createEntity(world);
  const npc = createEntity(world);

  world.components.addToEntity(GridPos, playerEntity, { x: 1, y: 1 });
  world.components.addToEntity(Facing, playerEntity, { dir: 1 });
  world.components.addToEntity(GridPos, npc, { x: 2, y: 1 });
  world.components.addToEntity(DisplayNameComponent, npc, { displayName: DisplayName.John });
  world.components.addToEntity(Npc, npc);
  world.components.addToEntity(Interactable, npc);
  world.refresh();

  const session = new GameSession(world, new Player(world, playerEntity), TEST_MAP, () => 0);
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
  const playerEntity = createEntity(world);
  const key = createEntity(world);

  world.components.addToEntity(GridPos, playerEntity, { x: 1, y: 1 });
  world.components.addToEntity(Facing, playerEntity, { dir: 1 });
  world.components.addToEntity(GridPos, key, { x: 2, y: 1 });
  world.components.addToEntity(Key, key, { lockId: LockId.Door1 });
  world.refresh();

  const session = new GameSession(world, new Player(world, playerEntity), TEST_MAP, () => 0);
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
  const playerEntity = createEntity(world);
  const door = createEntity(world);

  world.components.addToEntity(GridPos, playerEntity, { x: 1, y: 1 });
  world.components.addToEntity(Facing, playerEntity, { dir: 1 });
  world.components.addToEntity(GridPos, door, { x: 2, y: 1 });
  world.components.addToEntity(Door, door, { open: 0 });
  world.components.addToEntity(Locked, door, { lockId: LockId.Door1 });
  world.components.addToEntity(Blocking, door);
  world.components.addToEntity(Interactable, door);
  world.refresh();

  const session = new GameSession(world, new Player(world, playerEntity), TEST_MAP, () => 0);
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
  const playerEntity = createEntity(world);
  const door = createEntity(world);

  world.components.addToEntity(GridPos, playerEntity, { x: 1, y: 1 });
  world.components.addToEntity(Facing, playerEntity, { dir: 1 });
  world.components.addToEntity(GridPos, door, { x: 2, y: 1 });
  world.components.addToEntity(Door, door, { open: 0 });
  world.components.addToEntity(Locked, door, { lockId: LockId.Door1 });
  world.components.addToEntity(Blocking, door);
  world.components.addToEntity(Interactable, door);
  world.refresh();

  const session = new GameSession(
    world,
    new Player(world, playerEntity),
    TEST_MAP,
    () => 0,
    { heldKeys: [scopedLockId("Another Map", LockId.Door1)], selectedWeapon: 1 },
  );

  const result = session.handlePlayerCommand({ type: "interact" });
  assertEquals(result.events, [{ type: "doorLocked", entity: door }]);
  assertEquals(world.components.entityHas(Locked, door), true);
});

Deno.test("opening a locked door consumes the key and unblocks movement", async () => {
  const world = await createWorld();
  const playerEntity = createEntity(world);
  const door = createEntity(world);

  world.components.addToEntity(GridPos, playerEntity, { x: 1, y: 1 });
  world.components.addToEntity(Facing, playerEntity, { dir: 1 });
  world.components.addToEntity(GridPos, door, { x: 2, y: 1 });
  world.components.addToEntity(Door, door, { open: 0 });
  world.components.addToEntity(Locked, door, { lockId: LockId.Door1 });
  world.components.addToEntity(Blocking, door);
  world.components.addToEntity(Interactable, door);
  world.refresh();

  const session = new GameSession(
    world,
    new Player(world, playerEntity),
    TEST_MAP,
    () => 0,
    { heldKeys: [scopedLockId(TEST_MAP.name, LockId.Door1)], selectedWeapon: 1 },
  );

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
  const playerEntity = createEntity(world);

  world.components.addToEntity(GridPos, playerEntity, { x: 1, y: 1 });
  world.components.addToEntity(Facing, playerEntity, { dir: 1 });
  world.refresh();

  const session = new GameSession(world, new Player(world, playerEntity), TEST_MAP, () => 0);
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
  const playerEntity = createEntity(world);

  world.components.addToEntity(GridPos, playerEntity, { x: 1, y: 1 });
  world.components.addToEntity(Facing, playerEntity, { dir: 1 });
  world.refresh();

  const map = flatTestMap(3, 2, [{ prefab: "exit", x: 2, y: 1, goto: VICTORY_GOTO }]);
  const session = new GameSession(world, new Player(world, playerEntity), map, () => 0);
  const result = session.handlePlayerCommand({ type: "move", direction: "forward" });

  assertEquals(result, { events: [], outcome: "victory" });
});

Deno.test("an enemy reducing the player to zero health reports a defeat outcome", async () => {
  const world = await createWorld();
  const playerEntity = createEntity(world);
  const enemy = createEntity(world);

  world.components.addToEntity(GridPos, playerEntity, { x: 1, y: 1 });
  world.components.addToEntity(Facing, playerEntity, { dir: 1 });
  world.components.addToEntity(Blocking, playerEntity);
  world.components.addToEntity(PlayerTag, playerEntity);
  world.components.addToEntity(Health, playerEntity, { current: 1, max: 1 });

  world.components.addToEntity(GridPos, enemy, { x: 2, y: 1 });
  world.components.addToEntity(Facing, enemy, { dir: 3 });
  world.components.addToEntity(Blocking, enemy);
  world.components.addToEntity(Enemy, enemy);
  world.components.addToEntity(TurnTaker, enemy);
  world.components.addToEntity(DisplayNameComponent, enemy, { displayName: DisplayName.Imp });
  world.components.addToEntity(Attack, enemy, {
    minDamage: 1,
    maxDamage: 1,
    range: 1,
    requiresFacing: AttackFacingRequirement.Required,
    attackBonus: 20,
    critThreshold: 0,
    critMultiplier: 1,
    pattern: AttackPattern.Line,
    targets: AttackTargetMode.First,
  });
  world.refresh();

  const session = new GameSession(world, new Player(world, playerEntity), TEST_MAP, () => 0);
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
