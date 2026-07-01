import { assertEquals } from "@std/assert";
import { createGameMap, KeyColor, VICTORY_GOTO } from "@/src/map/map.ts";
import { GAME_MAPS } from "@/src/map/maps.ts";
import { validateGameMaps } from "@/src/map/map_validation.ts";

Deno.test("authored game maps pass softlock validation", () => {
  assertEquals(validateGameMaps(GAME_MAPS), []);
});

Deno.test("map validation requires exactly one player spawn", () => {
  assertEquals(
    validateGameMaps([
      createGameMap("No Player", [[0]], []),
    ]),
    [
      "No Player: expected exactly one player spawn, found 0.",
    ],
  );

  assertEquals(
    validateGameMaps([
      createGameMap("Two Players", [[0, 0]], [
        { prefab: "player", x: 0, y: 0, dir: 1 },
        { prefab: "player", x: 1, y: 0, dir: 3 },
      ]),
    ]),
    [
      "Two Players: expected exactly one player spawn, found 2.",
    ],
  );
});

Deno.test("map validation reports entities outside terrain bounds", () => {
  assertEquals(
    validateGameMaps([
      createGameMap("Out Of Bounds", [[0]], [
        { prefab: "player", x: 0, y: 0, dir: 1 },
        { prefab: "key", x: 1, y: 0, color: KeyColor.Red },
        { prefab: "uplinkTerminal", x: 0, y: -1, goto: VICTORY_GOTO },
      ]),
    ]),
    [
      "Out Of Bounds: key at (1,0) is outside the 1x1 map.",
      "Out Of Bounds: uplinkTerminal at (0,-1) is outside the 1x1 map.",
    ],
  );
});

Deno.test("map validation requires terminal destinations to point to known maps or victory", () => {
  assertEquals(
    validateGameMaps([
      createGameMap("Start", [[0, 0, 0]], [
        { prefab: "player", x: 0, y: 0, dir: 1 },
        { prefab: "uplinkCode", x: 1, y: 0 },
        { prefab: "uplinkTerminal", x: 2, y: 0, goto: "Missing Map" },
      ]),
    ]),
    [
      'Start: uplink terminal at (2,0) points to unknown map "Missing Map".',
    ],
  );
});

Deno.test("map validation requires locked door keys to be obtainable", () => {
  assertEquals(
    validateGameMaps([
      createGameMap("Missing Key", [
        [0, 0],
        [0, 0],
      ], [
        { prefab: "player", x: 0, y: 0, dir: 1 },
        { prefab: "door", x: 1, y: 0, locked: true, color: KeyColor.Red },
        { prefab: "uplinkCode", x: 0, y: 1 },
        { prefab: "uplinkTerminal", x: 1, y: 1, goto: VICTORY_GOTO },
      ]),
    ]),
    [
      "Missing Key: locked red door at (1,0) has no obtainable red key before it is needed.",
    ],
  );
});

Deno.test("map validation requires a terminal to be reachable after collecting code and keys", () => {
  assertEquals(
    validateGameMaps([
      createGameMap("Blocked Terminal", [
        [0, 1, 0],
        [0, 1, 0],
        [0, 1, 0],
      ], [
        { prefab: "player", x: 0, y: 0, dir: 1 },
        { prefab: "uplinkCode", x: 0, y: 2 },
        { prefab: "uplinkTerminal", x: 2, y: 1, goto: VICTORY_GOTO },
      ]),
    ]),
    [
      "Blocked Terminal: no uplink terminal is reachable after collecting an uplink code and required keys.",
    ],
  );
});
