import { writeComponent } from "@/src/game/simulation/components.ts";
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
  selectPlayerWeapon,
} from "@/src/game/simulation/progression.ts";
import { createPlayer, createRuntime, mutateRuntime } from "@/tests/game/simulation/helpers.ts";
import { StoryFlag } from "@/src/game/content/story.ts";
import { Direction } from "turn-based-engine/crawler";
import { KeyColor } from "@/src/game/content/map_entities.ts";
import { flatTestMap } from "@/tests/game/simulation/helpers.ts";
import { assertEquals, assertThrows } from "@std/assert";

Deno.test("player progression reset and cheat loadout use custom engine storage", () => {
  const runtime = createRuntime(flatTestMap());
  const player = createPlayer(runtime, { x: 1, y: 0, dir: Direction.East });
  mutateRuntime(runtime, (mutation) => applyCheatPlayerLoadout(mutation, player));
  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).ammo, { pistol: 99, cannon: 99 });
  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).unlockedWeapons, [1, 2, 3]);
  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).hasSpear, true);

  mutateRuntime(runtime, (mutation) => resetPlayerProgression(mutation, player));
  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).ammo, { pistol: 0, cannon: 0 });
  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).unlockedWeapons, [1]);
});

Deno.test("component writes validate the complete patch before changing storage", () => {
  const runtime = createRuntime(flatTestMap());
  const player = createPlayer(runtime, { x: 1, y: 0, dir: Direction.East });

  assertThrows(
    () =>
      mutateRuntime(
        runtime,
        (mutation) => writeComponent(mutation, player, "PlayerProgress", { credits: 12, score: Number.NaN }),
      ),
    TypeError,
  );
  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).progress, {
    credits: 0,
    score: 0,
    xp: 0,
    levelCredits: 0,
  });
});

Deno.test("picking up a new weapon selects it", () => {
  const runtime = createRuntime(flatTestMap());
  const player = createPlayer(runtime, { x: 1, y: 0, dir: Direction.East });
  const item = mutateRuntime(runtime, (mutation) => mutation.spawnCrawler({ x: 1, y: 0 }));

  mutateRuntime(
    runtime,
    (mutation) => applyItemPickupToPlayer(runtime, mutation, player, { type: "weapon", entity: item, slot: 2 }),
  );

  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).selectedWeapon, 2);
});

Deno.test("picking up an owned weapon preserves the selected weapon", () => {
  const runtime = createRuntime(flatTestMap());
  const player = createPlayer(runtime, { x: 1, y: 0, dir: Direction.East });
  const item = mutateRuntime(runtime, (mutation) => mutation.spawnCrawler({ x: 1, y: 0 }));
  mutateRuntime(
    runtime,
    (mutation) => applyItemPickupToPlayer(runtime, mutation, player, { type: "weapon", entity: item, slot: 2 }),
  );
  mutateRuntime(runtime, (mutation) => selectPlayerWeapon(mutation, player, 1));

  mutateRuntime(
    runtime,
    (mutation) => applyItemPickupToPlayer(runtime, mutation, player, { type: "weapon", entity: item, slot: 2 }),
  );

  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).selectedWeapon, 1);
});

Deno.test("progression checkpoint round-trips durable values and story flags", () => {
  const runtime = createRuntime(flatTestMap());
  const player = createPlayer(runtime, { x: 1, y: 0, dir: Direction.East });
  const item = mutateRuntime(runtime, (mutation) => mutation.spawnCrawler({ x: 1, y: 0 }));
  mutateRuntime(runtime, (mutation) => {
    applyItemPickupToPlayer(runtime, mutation, player, { type: "key", entity: item, color: KeyColor.Blue });
    applyItemPickupToPlayer(runtime, mutation, player, { type: "uplinkCode", entity: item });
    applyItemPickupToPlayer(runtime, mutation, player, { type: "weapon", entity: item, slot: 2 });
    writeComponent(mutation, player, "PlayerProgress", { credits: 12, score: 14, xp: 3, levelCredits: 4 });
    addPlayerStoryFlag(runtime.simulation.ecs, mutation, player, StoryFlag.JohnSpoken);
  });
  const checkpoint = capturePlayerProgressionCheckpoint(runtime.simulation.ecs, player);

  mutateRuntime(runtime, (mutation) => {
    resetPlayerProgression(mutation, player);
    restorePlayerProgressionCheckpoint(mutation, player, checkpoint);
  });
  assertEquals(playerStoryFlags(runtime.simulation.ecs, player), [StoryFlag.JohnSpoken]);
  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).progress, {
    credits: 12,
    score: 14,
    xp: 3,
    levelCredits: 4,
  });
  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).heldKeys, [KeyColor.Blue]);
  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).unlockedWeapons, [1, 2]);
});

Deno.test("clearing transient progression preserves weapons and durable progress", () => {
  const runtime = createRuntime(flatTestMap());
  const player = createPlayer(runtime, { x: 1, y: 0, dir: Direction.East });
  const item = mutateRuntime(runtime, (mutation) => mutation.spawnCrawler({ x: 1, y: 0 }));
  mutateRuntime(runtime, (mutation) => {
    applyItemPickupToPlayer(runtime, mutation, player, { type: "key", entity: item, color: KeyColor.Red });
    applyItemPickupToPlayer(runtime, mutation, player, { type: "uplinkCode", entity: item });
    applyItemPickupToPlayer(runtime, mutation, player, { type: "spear", entity: item });
    clearTransientPlayerState(mutation, player);
  });
  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).heldKeys, []);
  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).hasUplinkCode, false);
  assertEquals(playerStatusSnapshotFor(runtime.simulation.ecs, player).hasSpear, true);
});
