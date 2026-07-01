import { assertEquals, assertThrows } from "@std/assert";
import { createGameMap, mapDimensions, scopedLockId, terrainAt } from "@/src/map/map.ts";

Deno.test("createGameMap rejects ragged terrain rows", () => {
  assertThrows(
    () =>
      createGameMap("Ragged", [
        [1, 1, 1],
        [1, 0],
        [1, 1, 1],
      ], []),
    Error,
    "rectangular",
  );
});

Deno.test("createGameMap rejects empty terrain", () => {
  assertThrows(() => createGameMap("Empty", [], []), Error, "no terrain");
  assertThrows(() => createGameMap("Empty rows", [[]], []), Error, "no terrain");
});

Deno.test("terrainAt resolves palette tiles and rejects out-of-bounds reads", () => {
  const map = createGameMap("Tiny", [
    [1, 0],
    [0, 1],
  ], []);

  assertEquals(mapDimensions(map), { width: 2, height: 2 });
  assertEquals(terrainAt(map, 0, 0)?.blocking, true);
  assertEquals(terrainAt(map, 1, 0)?.blocking, undefined);
  assertEquals(terrainAt(map, -1, 0), undefined);
  assertEquals(terrainAt(map, 2, 0), undefined);
  assertEquals(terrainAt(map, 0, 2), undefined);
  assertEquals(terrainAt(map, 0.5, 0), undefined);
});

Deno.test("scopedLockId namespaces lock ids by map name", () => {
  assertEquals(scopedLockId("Map 1", 1), "Map 1#1");
  assertEquals(scopedLockId("Map 2", 1) === scopedLockId("Map 1", 1), false);
});
