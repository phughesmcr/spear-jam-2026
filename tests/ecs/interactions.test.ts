import { assertEquals } from "@std/assert";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import { GridPos, Interactable, Locked } from "@/src/ecs/components.ts";
import { createEntityContentStore } from "@/src/ecs/entity_content.ts";
import { collectItemAt, interactWithEntity } from "@/src/ecs/interactions.ts";
import { createDoor, createKey, createNpc, createUplinkTerminal } from "@/src/ecs/prefabs.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { DisplayName } from "@/src/game/names.ts";
import { KeyColor } from "@/src/map/map.ts";
import { createEntity, flatTestMap } from "@/tests/ecs/helpers.ts";

Deno.test("interactWithEntity applies default verbs for doors, NPCs, and terminals", async () => {
  const world = await createWorld();
  const contentStore = createEntityContentStore();
  const door = createDoor(world, contentStore, { x: 1, y: 1 });
  const npc = createNpc(world, contentStore, {
    x: 2,
    y: 1,
    dir: 1,
    displayName: DisplayName.John,
    dialogueTreeId: DialogueTreeId.JohnIntro,
  });
  const terminal = createUplinkTerminal(world, contentStore, { x: 3, y: 1, goto: "Next Map" });
  const generic = createEntity(world);
  world.components.addToEntity(GridPos, generic, { x: 4, y: 1 });
  world.components.addToEntity(Interactable, generic);
  world.refresh();

  const spatial = new SpatialIndex(world, flatTestMap(6, 3));
  assertEquals(interactWithEntity(world, contentStore, spatial, door, new Set(), false), {
    type: "consumeTurn",
    events: [{ type: "doorOpened", entity: door }],
  });
  assertEquals(interactWithEntity(world, contentStore, spatial, npc, new Set(), false), {
    type: "dialogue",
    target: npc,
    events: [],
    dialogue: {
      title: "John",
      speaker: DisplayName.John,
      treeKey: "john_intro",
      message: "Stay sharp.",
      choices: [
        { label: "WHAT'S GOING ON?", next: "briefing" },
        { label: "BYE!" },
      ],
    },
  });
  assertEquals(interactWithEntity(world, contentStore, spatial, terminal, new Set(), false), {
    type: "unchanged",
    events: [{ type: "uplinkTerminalLocked", entity: terminal }],
  });
  assertEquals(interactWithEntity(world, contentStore, spatial, terminal, new Set(), true), {
    type: "uplinkTerminal",
    terminal,
    events: [{ type: "uplinkTerminalActivated", entity: terminal }],
  });
  assertEquals(interactWithEntity(world, contentStore, spatial, generic, new Set(), false), {
    type: "unchanged",
    events: [{ type: "verbFailed", verb: "use" }],
  });
});

Deno.test("interactWithEntity opens locked doors only with a matching held key", async () => {
  const world = await createWorld();
  const contentStore = createEntityContentStore();
  const door = createDoor(world, contentStore, { x: 1, y: 1, locked: true, color: KeyColor.Red });
  world.refresh();

  const spatial = new SpatialIndex(world, flatTestMap(3, 3));
  assertEquals(interactWithEntity(world, contentStore, spatial, door, new Set([KeyColor.Blue]), false), {
    type: "unchanged",
    events: [{ type: "doorLocked", entity: door }],
  });
  assertEquals(world.components.entityHas(Locked, door), true);

  assertEquals(interactWithEntity(world, contentStore, spatial, door, new Set([KeyColor.Red]), false), {
    type: "consumeTurn",
    events: [{ type: "doorOpened", entity: door }],
  });
  assertEquals(world.components.entityHas(Locked, door), false);
});

Deno.test("collectItemAt removes the collected pickup from the spatial index", async () => {
  const world = await createWorld();
  const key = createKey(world, { x: 1, y: 1, color: KeyColor.Red });
  world.refresh();

  const spatial = new SpatialIndex(world, flatTestMap(3, 3));
  assertEquals(collectItemAt(world, spatial, 1, 1), {
    type: "key",
    entity: key,
    color: KeyColor.Red,
  });
  assertEquals(spatial.itemAt(1, 1), undefined);
  assertEquals(world.entities.isActive(key), false);
});
