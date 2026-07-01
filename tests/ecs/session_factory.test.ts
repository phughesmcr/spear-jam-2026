import { assertEquals, assertRejects } from "@std/assert";
import { Health } from "@/src/ecs/components.ts";
import { createGameSession } from "@/src/ecs/session_factory.ts";
import { flatTestMap } from "@/tests/ecs/helpers.ts";

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
