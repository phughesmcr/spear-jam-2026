import { hasComponent, readComponent } from "@/src/game/simulation/components.ts";
import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import {
  collectItemAt,
  interactWithEntity,
  openDoor,
  spearPickupDialogue,
} from "@/src/game/simulation/interactions.ts";
import { createDoor, createKey, createPlayer, createSpearTurret } from "@/src/game/simulation/spawn/mod.ts";
import { createRuntime } from "@/tests/game/simulation/helpers.ts";
import { Direction } from "@/src/game/world/direction.ts";
import { KeyColor } from "@/src/game/content/map_entities.ts";
import { flatTestMap } from "@/tests/game/simulation/helpers.ts";
import { assertEquals, assertThrows } from "@std/assert";
import { TerrainBlock } from "turn-based-engine/crawler";

Deno.test("normal and locked doors change custom state and crawler masks together", () => {
  const runtime = createRuntime(flatTestMap(5, 3));
  const normal = createDoor(runtime, { x: 1, y: 1 });
  const locked = createDoor(runtime, { x: 2, y: 1, locked: true, color: KeyColor.Red });

  assertEquals(interactWithEntity(runtime, normal, new Set(), false, false), {
    type: "consumeTurn",
    events: [{ type: "doorOpened", entity: normal }],
  });
  assertEquals(readComponent(runtime.game, normal, "Door")?.open, 1);
  assertEquals(runtime.crawler.entityBlockMask(normal), 0);
  assertEquals(interactWithEntity(runtime, locked, new Set(), false, false).events, [{
    type: "doorLocked",
    entity: locked,
  }]);
  assertEquals(interactWithEntity(runtime, locked, new Set([KeyColor.Red]), false, false).type, "consumeTurn");
  assertEquals(hasComponent(runtime.game, locked, "Locked"), false);
  assertEquals(runtime.crawler.entityBlockMask(locked), 0);
  runtime.crawler.assertInvariants();
});

Deno.test("opening a door cannot leak custom state when its transaction is rejected", () => {
  const runtime = createRuntime(flatTestMap(3, 3));
  const door = createDoor(runtime, { x: 1, y: 1 });
  const maskBefore = runtime.crawler.entityBlockMask(door);

  assertThrows(
    () => runtime.crawler.transaction(() => openDoor(runtime, door)),
    Error,
    "Nested crawler transactions",
  );

  assertEquals(readComponent(runtime.game, door, "Door")?.open, 0);
  assertEquals(runtime.crawler.entityBlockMask(door), maskBefore);
  runtime.crawler.assertInvariants();
});

Deno.test("glass doors reject open without changing their effect-line mask", () => {
  const runtime = createRuntime(flatTestMap());
  const glass = createDoor(runtime, { x: 1, y: 0, glass: true });
  assertEquals(interactWithEntity(runtime, glass, new Set(), false, false).events, [{
    type: "doorCannotOpen",
    entity: glass,
  }]);
  assertEquals(runtime.crawler.entityBlockMask(glass), TerrainBlock.Movement | TerrainBlock.EffectLine);
});

Deno.test("items coexist with a movement occupant and despawn through crawler lifecycle", () => {
  const runtime = createRuntime(flatTestMap(3, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.North });
  const key = createKey(runtime, { x: 1, y: 1, color: KeyColor.Red });
  assertEquals(runtime.crawler.entityAt(1, 1, TerrainBlock.Movement), player);
  assertEquals(collectItemAt(runtime, player, 1, 1), { type: "key", entity: key, color: KeyColor.Red });
  assertEquals(runtime.game.isEntityAlive(key), false);
  runtime.crawler.assertInvariants();
});

Deno.test("spear pickup dialogue requests the dedicated reveal art", () => {
  assertEquals(spearPickupDialogue(createRuntime(flatTestMap())).art, "spearReveal");
});

Deno.test("using a spear turret loads it only when the player holds the spear", () => {
  const runtime = createRuntime(flatTestMap());
  const turret = createSpearTurret(runtime, { x: 1, y: 0 });

  assertEquals(interactWithEntity(runtime, turret, new Set(), false, false, "use"), {
    type: "unchanged",
    events: [{ type: "spearTurretNeedsSpear", entity: turret }],
  });
  assertEquals(runtime.game.storage.Sprite.get(turret, "id"), SpriteId.SpearTurret);

  assertEquals(interactWithEntity(runtime, turret, new Set(), false, true, "use"), {
    type: "victory",
    events: [{ type: "spearTurretLoaded", entity: turret }],
  });
  assertEquals(runtime.game.storage.Sprite.get(turret, "id"), SpriteId.SpearTurretLoaded);

  assertEquals(interactWithEntity(runtime, turret, new Set(), false, true, "use"), {
    type: "unchanged",
    events: [],
  });
});
