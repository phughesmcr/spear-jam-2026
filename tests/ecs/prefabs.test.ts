import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import { Dialogue, DisplayNameComponent, Enemy, Npc } from "@/src/ecs/components.ts";
import { DisplayName } from "@/src/ecs/names.ts";
import { createEnemy, createNpc } from "@/src/ecs/prefabs.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { assertEquals } from "@/tests/ecs/helpers.ts";

Deno.test("neutral NPCs and enemies share display names without sharing NPC identity", async () => {
  const world = await createWorld();
  const npc = createNpc(world, {
    x: 1,
    y: 1,
    dir: 1,
    displayName: DisplayName.John,
    dialogueTreeId: DialogueTreeId.JohnIntro,
  });
  const enemy = createEnemy(world, { x: 2, y: 1, dir: 3, displayName: DisplayName.Imp });

  assertEquals(world.components.entityHas(Npc, npc), true);
  assertEquals(world.components.entityHas(Dialogue, npc), true);
  assertEquals(world.components.entityHas(Enemy, npc), false);
  assertEquals(world.components.getEntityData(DisplayNameComponent, npc), { displayName: DisplayName.John });
  assertEquals(world.components.getEntityData(Dialogue, npc), { dialogueTreeId: DialogueTreeId.JohnIntro });

  assertEquals(world.components.entityHas(Npc, enemy), false);
  assertEquals(world.components.entityHas(Dialogue, enemy), false);
  assertEquals(world.components.entityHas(Enemy, enemy), true);
  assertEquals(world.components.getEntityData(DisplayNameComponent, enemy), { displayName: DisplayName.Imp });
});
