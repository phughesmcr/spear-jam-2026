import { enemyArchetypeAuthoringKey, EnemyArchetypeCode } from "@/src/content/enemies.ts";
import { IDLE_AWARENESS } from "@/src/ecs/components.ts";
import { createEnemy, createNpc, createPlayer } from "@/src/ecs/prefabs.ts";
import { applyItemPickupToPlayer } from "@/src/ecs/progression.ts";
import { createRuntime } from "@/src/ecs/runtime.ts";
import { runTurnTransaction } from "@/src/ecs/turn/transaction.ts";
import { DisplayName } from "@/src/game/names.ts";
import { Direction } from "@/src/grid/direction.ts";
import { flatTestMap } from "@/tests/ecs/helpers.ts";
import { assertEquals } from "@std/assert";
import { TerrainBlock } from "turn-based-engine/crawler";

Deno.test("free turn updates facing without moving or running enemies", () => {
  const runtime = createRuntime(flatTestMap(6, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.East });
  const enemy = spawnEnemy(runtime, 4, 1);
  const result = runTurnTransaction({ runtime, player, random: () => 0 }, { type: "turn", direction: "right" });
  assertEquals(result.cost, "free");
  assertEquals(runtime.crawler.entityPosition(player), { x: 1, y: 1 });
  assertEquals(runtime.crawler.entityFacing(player), Direction.South);
  assertEquals(runtime.crawler.entityPosition(enemy), { x: 4, y: 1 });
});

Deno.test("enemy batches combine deterministic phase fields with live immediate occupancy", () => {
  const runtime = createRuntime(flatTestMap(8, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.East });
  const first = spawnMovingEnemy(runtime, 4, 1);
  const second = spawnMovingEnemy(runtime, 5, 1);
  const result = runTurnTransaction({ runtime, player, random: () => 0 }, { type: "wait" });
  assertEquals(result.cost, "turn");
  assertEquals(result.events.filter((event) => event.type === "enemyAlerted"), [
    { type: "enemyAlerted", entity: first },
    { type: "enemyAlerted", entity: second },
  ]);
  assertEquals(runtime.crawler.entityPosition(first), { x: 3, y: 1 });
  assertEquals(runtime.crawler.entityPosition(second), { x: 5, y: 0 });
  runtime.crawler.assertInvariants();
});

Deno.test("no-ammo attack remains free and skips enemies", () => {
  const runtime = createRuntime(flatTestMap(6, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.East });
  const enemy = spawnEnemy(runtime, 4, 1);
  const pickup = runtime.crawler.spawnCrawler({ x: 1, y: 1 });
  applyItemPickupToPlayer(runtime.game, player, { type: "weapon", entity: pickup, slot: 2 });
  runtime.game.storage.PlayerEquipment.set(player, "selectedWeapon", 2);
  const result = runTurnTransaction({ runtime, player, random: () => 0 }, { type: "attack" });
  assertEquals(result.cost, "free");
  assertEquals(result.events, [{ type: "noAmmo", ammo: "pistol" }]);
  assertEquals(runtime.crawler.entityPosition(enemy), { x: 4, y: 1 });
});

Deno.test("usable player attacks consume a turn even with no target", () => {
  const runtime = createRuntime(flatTestMap(5, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.East });
  const result = runTurnTransaction({ runtime, player, random: () => 0 }, { type: "attack" });
  assertEquals(result.cost, "turn");
  assertEquals(result.events[0]?.type, "attackMissed");
});

Deno.test("consumed player movement is committed before enemies decide", () => {
  const runtime = createRuntime(flatTestMap(7, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.East });
  const enemy = spawnMovingEnemy(runtime, 5, 1);
  const result = runTurnTransaction({ runtime, player, random: () => 0 }, { type: "move", direction: "forward" });
  assertEquals(result.cost, "turn");
  assertEquals(runtime.crawler.entityPosition(player), { x: 2, y: 1 });
  assertEquals(runtime.crawler.entityPosition(enemy), { x: 4, y: 1 });
});

Deno.test("NPCs are not enemy turn actors", () => {
  const runtime = createRuntime(flatTestMap(6, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.East });
  const npc = createNpc(runtime, { x: 4, y: 1, dir: Direction.West, displayName: DisplayName.John });
  runTurnTransaction({ runtime, player, random: () => 0 }, { type: "wait" });
  assertEquals(runtime.crawler.entityPosition(npc), { x: 4, y: 1 });
});

function spawnEnemy(runtime: ReturnType<typeof createRuntime>, x: number, y: number) {
  return createEnemy(runtime, {
    x,
    y,
    dir: Direction.West,
    archetype: enemyArchetypeAuthoringKey(EnemyArchetypeCode.NetworkNeophyte),
    displayName: DisplayName.NetworkNeophyte,
  });
}

function spawnMovingEnemy(runtime: ReturnType<typeof createRuntime>, x: number, y: number) {
  return runtime.crawler.spawnCrawler({
    x,
    y,
    facing: Direction.West,
    blockMask: TerrainBlock.Movement,
    components: { Enemy: {}, TurnTaker: {}, EnemyAwareness: IDLE_AWARENESS },
  });
}
