import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import {
  Blocking,
  Dialogue,
  DisplayNameComponent,
  Door,
  Facing,
  GridPos,
  Interactable,
  Key,
  Locked,
  Npc,
} from "@/src/ecs/components.ts";
import { DisplayName } from "@/src/game/names.ts";
import { Player } from "@/src/ecs/player.ts";
import { GameSession } from "@/src/ecs/session.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { LockId } from "@/src/map/map.ts";
import { assertEquals, createEntity, flatTestMap } from "@/tests/ecs/helpers.ts";

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

Deno.test("moving onto a key emits a pickup event and removes the key", async () => {
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
      message: "Picked up a key.",
    },
  ]);
  assertEquals(world.entities.isActive(key), false);
  assertEquals(session.getPlayerState().heldKeys, [LockId.Door1]);
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
        message: "The door is locked.",
      },
    ],
  });
  assertEquals(world.components.entityHas(Blocking, door), true);
});

Deno.test("opening a door emits an event and updates spatial blocking for later movement", async () => {
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
    { heldKeys: [LockId.Door1], selectedWeapon: 1 },
  );

  const openResult = session.handlePlayerCommand({ type: "interact" });
  assertEquals(openResult.events, [
    {
      type: "doorOpened",
      entity: door,
      message: "Opened the door.",
    },
  ]);
  assertEquals(world.components.entityHas(Blocking, door), false);

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
        message: "Selected weapon 2: Pistol.",
      },
    ],
  });
  assertEquals(session.getPlayerState().selectedWeapon, 2);
});

const TEST_MAP = flatTestMap(3, 2);
