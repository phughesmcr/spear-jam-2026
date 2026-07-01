import type { Entity, World } from "@phughesmcr/miski";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import { Dialogue, DisplayNameComponent, Facing, GridPos, Interactable, Npc } from "@/src/ecs/components.ts";
import { DisplayName } from "@/src/ecs/names.ts";
import { Player } from "@/src/ecs/player.ts";
import { GameSession } from "@/src/ecs/session.ts";
import { createWorld } from "@/src/ecs/world.ts";
import type { GameMap } from "@/src/map/map.ts";

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
    changedWorld: false,
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
    changedWorld: false,
    dialogue: {
      title: "John",
      message: "John stayed silent. Space to continue.",
    },
  });
});

const TEST_MAP: GameMap = {
  name: "Test Map",
  terrain: {
    palette: [
      {
        id: 0,
        color: "#000",
        floor_texture: "",
        ceiling_texture: "",
      },
    ],
    tiles: [[0, 0, 0]],
  },
  entities: [],
};

function createEntity(world: World): Entity {
  const entity = world.entities.create();
  if (entity === undefined) throw new Error("Failed to create test entity");
  return entity;
}

function assertEquals<T>(actual: T, expected: T): void {
  if (!Object.is(actual, expected) && JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}
