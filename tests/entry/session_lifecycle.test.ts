import {
  loadMapSession,
  resetRunSession,
  retryMapSession,
  type SessionLifecycleSpec,
} from "@/src/entry/session_lifecycle.ts";
import { SplitMix32 } from "@/src/game/rng.ts";
import { START_MAP_NAME } from "@/src/map/maps.ts";
import { assert, assertEquals, assertRejects } from "@std/assert";

Deno.test("loadMapSession creates a new game session when none exists", async () => {
  const controller = new AbortController();
  const result = await loadMapSession({
    ...lifecycleSpec(controller),
    mapName: START_MAP_NAME,
    random: randomSource(),
  });

  assert(result !== undefined);
  assertEquals(result.mapName, START_MAP_NAME);
  assertEquals(result.session.getMap().name, START_MAP_NAME);
  result.session[Symbol.dispose]();
});

Deno.test("loadMapSession reuses the current game session when it exists", async () => {
  const controller = new AbortController();
  const initial = await loadMapSession({
    ...lifecycleSpec(controller),
    mapName: START_MAP_NAME,
    random: randomSource(),
  });
  assert(initial !== undefined);

  try {
    const loaded = await loadMapSession({
      ...lifecycleSpec(controller),
      mapName: START_MAP_NAME,
      currentSession: initial.session,
      random: randomSource(),
    });

    assert(loaded !== undefined);
    assert(loaded.session === initial.session);
    assertEquals(loaded.session.getMap().name, START_MAP_NAME);
  } finally {
    initial.session[Symbol.dispose]();
  }
});

Deno.test("retryMapSession and resetRunSession require an existing session", async () => {
  await assertRejects(
    () => retryMapSession({ ...lifecycleSpec(new AbortController()), mapName: START_MAP_NAME }),
    Error,
    "Cannot retry before the game session exists.",
  );
  await assertRejects(
    () => resetRunSession({ ...lifecycleSpec(new AbortController()), mapName: START_MAP_NAME }),
    Error,
    "Cannot reset before the game session exists.",
  );
});

Deno.test("retryMapSession and resetRunSession return the current session", async () => {
  const controller = new AbortController();
  const initial = await loadMapSession({
    ...lifecycleSpec(controller),
    mapName: START_MAP_NAME,
    random: randomSource(),
  });
  assert(initial !== undefined);

  try {
    const retried = await retryMapSession({
      ...lifecycleSpec(controller),
      mapName: START_MAP_NAME,
      currentSession: initial.session,
    });
    const reset = await resetRunSession({
      ...lifecycleSpec(controller),
      mapName: START_MAP_NAME,
      currentSession: initial.session,
    });

    assert(retried !== undefined);
    assert(reset !== undefined);
    assert(retried.session === initial.session);
    assert(reset.session === initial.session);
  } finally {
    initial.session[Symbol.dispose]();
  }
});

Deno.test("loadMapSession returns no session when aborted before commit", async () => {
  const controller = new AbortController();
  controller.abort();

  const result = await loadMapSession({
    ...lifecycleSpec(controller),
    mapName: START_MAP_NAME,
    random: randomSource(),
  });

  assertEquals(result, undefined);
});

function lifecycleSpec(controller: AbortController): SessionLifecycleSpec {
  return {
    signal: controller.signal,
    preloadAssets: (_mapName: string) => Promise.resolve(),
  };
}

function randomSource(): () => number {
  const rng = new SplitMix32(1);
  return () => rng.nextFloat();
}
