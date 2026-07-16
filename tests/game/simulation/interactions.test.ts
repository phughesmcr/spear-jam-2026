import { hasComponent, readComponent } from "@/src/game/simulation/components.ts";
import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import {
  collectItemAt,
  interactWithEntity,
  openDoor,
  spearPickupDialogue,
} from "@/src/game/simulation/interactions.ts";
import {
  createDoor,
  createKey,
  createPlayer,
  createRuntime,
  createSpearTurret,
  executeRuntime,
} from "@/tests/game/simulation/helpers.ts";
import { Direction } from "@/src/game/world/direction.ts";
import { KeyColor } from "@/src/game/content/map_entities.ts";
import { flatTestMap } from "@/tests/game/simulation/helpers.ts";
import { assertEquals, assertThrows } from "@std/assert";
import { TerrainBlock } from "turn-based-engine/crawler";

Deno.test("normal and locked doors change custom state and crawler masks together", () => {
  const runtime = createRuntime(flatTestMap(5, 3));
  const normal = createDoor(runtime, { x: 1, y: 1 });
  const locked = createDoor(runtime, { x: 2, y: 1, locked: true, color: KeyColor.Red });

  assertEquals(
    executeRuntime(runtime, ({ mutation }) => interactWithEntity(runtime, mutation, normal, new Set(), false, false)),
    {
      type: "consumeTurn",
      events: [{ type: "doorOpened", entity: normal }],
    },
  );
  assertEquals(readComponent(runtime.simulation.ecs, normal, "Door")?.open, 1);
  assertEquals(runtime.simulation.crawler.entityBlockMask(normal), 0);
  assertEquals(
    executeRuntime(runtime, ({ mutation }) => interactWithEntity(runtime, mutation, locked, new Set(), false, false))
      .events,
    [{
      type: "doorLocked",
      entity: locked,
    }],
  );
  assertEquals(
    executeRuntime(
      runtime,
      ({ mutation }) => interactWithEntity(runtime, mutation, locked, new Set([KeyColor.Red]), false, false),
    ).type,
    "consumeTurn",
  );
  assertEquals(hasComponent(runtime.simulation.ecs, locked, "Locked"), false);
  assertEquals(runtime.simulation.crawler.entityBlockMask(locked), 0);
  runtime.simulation.crawler.assertInvariants();
});

Deno.test("opening a door cannot leak custom state when its transaction is rejected", () => {
  const runtime = createRuntime(flatTestMap(3, 3));
  const door = createDoor(runtime, { x: 1, y: 1 });
  const maskBefore = runtime.simulation.crawler.entityBlockMask(door);

  assertThrows(
    () =>
      executeRuntime(runtime, ({ mutation }) => {
        openDoor(runtime, mutation, door);
        throw new Error("reject door turn");
      }),
    Error,
    "reject door turn",
  );

  assertEquals(readComponent(runtime.simulation.ecs, door, "Door")?.open, 0);
  assertEquals(runtime.simulation.crawler.entityBlockMask(door), maskBefore);
  runtime.simulation.crawler.assertInvariants();
});

Deno.test("glass doors reject open without changing their effect-line mask", () => {
  const runtime = createRuntime(flatTestMap());
  const glass = createDoor(runtime, { x: 1, y: 0, glass: true });
  assertEquals(
    executeRuntime(runtime, ({ mutation }) => interactWithEntity(runtime, mutation, glass, new Set(), false, false))
      .events,
    [{
      type: "doorCannotOpen",
      entity: glass,
    }],
  );
  assertEquals(runtime.simulation.crawler.entityBlockMask(glass), TerrainBlock.Movement | TerrainBlock.EffectLine);
});

Deno.test("items coexist with a movement occupant and despawn through crawler lifecycle", () => {
  const runtime = createRuntime(flatTestMap(3, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.North });
  const key = createKey(runtime, { x: 1, y: 1, color: KeyColor.Red });
  assertEquals(runtime.simulation.crawler.entityAt(1, 1, TerrainBlock.Movement), player);
  assertEquals(executeRuntime(runtime, ({ mutation }) => collectItemAt(runtime, mutation, player, 1, 1)), {
    type: "key",
    entity: key,
    color: KeyColor.Red,
  });
  assertEquals(runtime.simulation.ecs.isEntityAlive(key), false);
  runtime.simulation.crawler.assertInvariants();
});

Deno.test("spear pickup dialogue requests the dedicated reveal art", () => {
  assertEquals(spearPickupDialogue(createRuntime(flatTestMap())).art, "spearReveal");
});

Deno.test("using a spear turret loads it only when the player holds the spear", () => {
  const runtime = createRuntime(flatTestMap());
  const turret = createSpearTurret(runtime, { x: 1, y: 0 });

  assertEquals(
    executeRuntime(
      runtime,
      ({ mutation }) => interactWithEntity(runtime, mutation, turret, new Set(), false, false, "use"),
    ),
    {
      type: "unchanged",
      events: [{ type: "spearTurretNeedsSpear", entity: turret }],
    },
  );
  assertEquals(runtime.simulation.ecs.storage.Sprite.get(turret, "id"), SpriteId.SpearTurret);

  assertEquals(
    executeRuntime(
      runtime,
      ({ mutation }) => interactWithEntity(runtime, mutation, turret, new Set(), false, true, "use"),
    ),
    {
      type: "victory",
      events: [{ type: "spearTurretLoaded", entity: turret }],
    },
  );
  assertEquals(runtime.simulation.ecs.storage.Sprite.get(turret, "id"), SpriteId.SpearTurretLoaded);

  assertEquals(
    executeRuntime(
      runtime,
      ({ mutation }) => interactWithEntity(runtime, mutation, turret, new Set(), false, true, "use"),
    ),
    {
      type: "unchanged",
      events: [],
    },
  );
});
