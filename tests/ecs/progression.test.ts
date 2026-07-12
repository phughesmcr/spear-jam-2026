import { writeComponent } from "@/src/ecs/components.ts";
import { createPlayer } from "@/src/ecs/prefabs.ts";
import {
  addPlayerStoryFlag,
  applyCheatPlayerLoadout,
  applyItemPickupToPlayer,
  capturePlayerProgressionCheckpoint,
  clearTransientPlayerState,
  playerStatusSnapshotFor,
  playerStoryFlags,
  resetPlayerProgression,
  restorePlayerProgressionCheckpoint,
} from "@/src/ecs/progression.ts";
import { createRuntime } from "@/src/ecs/runtime.ts";
import { StoryFlag } from "@/src/game/story.ts";
import { Direction } from "@/src/grid/direction.ts";
import { KeyColor } from "@/src/map/map.ts";
import { flatTestMap } from "@/tests/ecs/helpers.ts";
import { assertEquals, assertThrows } from "@std/assert";

Deno.test("player progression reset and cheat loadout use custom engine storage", () => {
  const runtime = createRuntime(flatTestMap());
  const player = createPlayer(runtime, { x: 1, y: 0, dir: Direction.East });
  applyCheatPlayerLoadout(runtime.game, player);
  assertEquals(playerStatusSnapshotFor(runtime.game, player).ammo, { pistol: 99, cannon: 99 });
  assertEquals(playerStatusSnapshotFor(runtime.game, player).unlockedWeapons, [1, 2, 3]);

  resetPlayerProgression(runtime.game, player);
  assertEquals(playerStatusSnapshotFor(runtime.game, player).ammo, { pistol: 0, cannon: 0 });
  assertEquals(playerStatusSnapshotFor(runtime.game, player).unlockedWeapons, [1]);
});

Deno.test("component writes validate the complete patch before changing storage", () => {
  const runtime = createRuntime(flatTestMap());
  const player = createPlayer(runtime, { x: 1, y: 0, dir: Direction.East });

  assertThrows(
    () => writeComponent(runtime.game, player, "PlayerProgress", { credits: 12, score: Number.NaN }),
    TypeError,
  );
  assertEquals(playerStatusSnapshotFor(runtime.game, player).progress, {
    credits: 0,
    score: 0,
    xp: 0,
    levelCredits: 0,
  });
});

Deno.test("progression checkpoint round-trips durable values and story flags", () => {
  const runtime = createRuntime(flatTestMap());
  const player = createPlayer(runtime, { x: 1, y: 0, dir: Direction.East });
  const item = runtime.crawler.spawnCrawler({ x: 1, y: 0 });
  applyItemPickupToPlayer(runtime.game, player, { type: "key", entity: item, color: KeyColor.Blue });
  applyItemPickupToPlayer(runtime.game, player, { type: "uplinkCode", entity: item });
  applyItemPickupToPlayer(runtime.game, player, { type: "weapon", entity: item, slot: 2 });
  writeComponent(runtime.game, player, "PlayerProgress", { credits: 12, score: 14, xp: 3, levelCredits: 4 });
  addPlayerStoryFlag(runtime.game, player, StoryFlag.JohnSpoken);
  const checkpoint = capturePlayerProgressionCheckpoint(runtime.game, player);

  resetPlayerProgression(runtime.game, player);
  restorePlayerProgressionCheckpoint(runtime.game, player, checkpoint);
  assertEquals(playerStoryFlags(runtime.game, player), [StoryFlag.JohnSpoken]);
  assertEquals(playerStatusSnapshotFor(runtime.game, player).progress, {
    credits: 12,
    score: 14,
    xp: 3,
    levelCredits: 4,
  });
  assertEquals(playerStatusSnapshotFor(runtime.game, player).heldKeys, [KeyColor.Blue]);
  assertEquals(playerStatusSnapshotFor(runtime.game, player).unlockedWeapons, [1, 2]);
});

Deno.test("clearing transient progression preserves weapons and durable progress", () => {
  const runtime = createRuntime(flatTestMap());
  const player = createPlayer(runtime, { x: 1, y: 0, dir: Direction.East });
  const item = runtime.crawler.spawnCrawler({ x: 1, y: 0 });
  applyItemPickupToPlayer(runtime.game, player, { type: "key", entity: item, color: KeyColor.Red });
  applyItemPickupToPlayer(runtime.game, player, { type: "uplinkCode", entity: item });
  applyItemPickupToPlayer(runtime.game, player, { type: "spear", entity: item });
  clearTransientPlayerState(runtime.game, player);
  assertEquals(playerStatusSnapshotFor(runtime.game, player).heldKeys, []);
  assertEquals(playerStatusSnapshotFor(runtime.game, player).hasUplinkCode, false);
  assertEquals(playerStatusSnapshotFor(runtime.game, player).hasSpear, true);
});
