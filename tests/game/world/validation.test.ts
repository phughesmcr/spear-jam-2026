import { SoundId } from "@/src/game/model/sound.ts";
import type { TerrainTile } from "@/src/game/world/map.ts";
import { KeyColor } from "@/src/game/content/map_entities.ts";
import { VICTORY_GOTO } from "@/src/game/world/destinations.ts";
import { createGameMap } from "@/src/game/world/map.ts";
import { validateGameMaps } from "@/src/game/world/validation.ts";
import { GAME_MAPS } from "@/src/game/world/campaign.ts";
import {
  DEFAULT_BARS_TERRAIN_ID,
  DEFAULT_WALL_TERRAIN_ID,
  isTexturePackRef,
  SKY_CEILING_TEXTURE,
} from "@/src/game/world/terrain_palette.ts";
import { assert, assertEquals } from "@std/assert";

Deno.test("authored game maps pass softlock validation", () => {
  assertEquals(validateGameMaps(GAME_MAPS), []);
});

Deno.test("authored game maps use texture pack terrain palettes", () => {
  for (const map of GAME_MAPS) {
    assert(
      map.terrain.palette.some((tile) => terrainTextures(tile).length > 0),
      `${map.name} should declare terrain textures.`,
    );
    assert(
      map.terrain.palette.every(terrainTexturesAreValid),
      `${map.name} should use pack-backed floor/wall textures and pack-backed or sky ceilings.`,
    );
  }
});

Deno.test("authored terrain palettes use varied floor, ceiling, and wall textures", () => {
  for (const map of GAME_MAPS) {
    const textures = paletteTerrainTextures(map.terrain.palette);
    assert(
      textures.floors.size >= 3,
      `${map.name} palette should define at least 3 floor textures, got ${textures.floors.size}.`,
    );
    assert(
      textures.ceilings.size >= 3,
      `${map.name} palette should define at least 3 ceiling textures, got ${textures.ceilings.size}.`,
    );
    assert(
      textures.walls.size >= 3,
      `${map.name} palette should define at least 3 wall textures, got ${textures.walls.size}.`,
    );
  }
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

Deno.test("map validation rejects overlapping blocking entities", () => {
  const issues = validateGameMaps([createGameMap("Overlapping Blockers", [[0]], [
    { prefab: "player", x: 0, y: 0, dir: 1 },
    { prefab: "enemy", x: 0, y: 0, dir: 3 },
  ])]);
  assert(issues.includes("Overlapping Blockers: enemy at (0,0) overlaps blocking player."));
});

function terrainTextures(tile: TerrainTile): readonly string[] {
  if (tile.kind === "wall") return [tile.wall_texture];
  return [tile.floor_texture, tile.ceiling_texture];
}

function terrainTexturesAreValid(tile: TerrainTile): boolean {
  if (tile.kind === "wall") return isTexturePackRef(tile.wall_texture);
  return isTexturePackRef(tile.floor_texture) &&
    (isTexturePackRef(tile.ceiling_texture) || tile.ceiling_texture === SKY_CEILING_TEXTURE);
}

function paletteTerrainTextures(palette: readonly TerrainTile[]): {
  readonly floors: ReadonlySet<string>;
  readonly ceilings: ReadonlySet<string>;
  readonly walls: ReadonlySet<string>;
} {
  const floors = new Set<string>();
  const ceilings = new Set<string>();
  const walls = new Set<string>();
  for (const tile of palette) {
    if (tile.kind === "wall") {
      walls.add(tile.wall_texture);
      continue;
    }
    floors.add(tile.floor_texture);
    ceilings.add(tile.ceiling_texture);
  }
  return { floors, ceilings, walls };
}

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
        [0, 0, 0],
        [DEFAULT_WALL_TERRAIN_ID, 0, DEFAULT_WALL_TERRAIN_ID],
        [0, 0, 0],
      ], [
        { prefab: "player", x: 0, y: 0, dir: 1 },
        { prefab: "door", x: 1, y: 1, locked: true, color: KeyColor.Red },
        { prefab: "uplinkCode", x: 1, y: 0 },
        { prefab: "uplinkTerminal", x: 2, y: 0, goto: VICTORY_GOTO },
      ]),
    ]),
    [
      "Missing Key: locked red door at (1,1) has no obtainable red key before it is needed.",
    ],
  );
});

Deno.test("map validation reports entities on blocking terrain and invalid doorways", () => {
  assertEquals(
    validateGameMaps([
      createGameMap("Bad Door", [
        [0, 0, 0],
        [0, DEFAULT_WALL_TERRAIN_ID, 0],
        [0, 0, 0],
      ], [
        { prefab: "player", x: 0, y: 0, dir: 1 },
        { prefab: "door", x: 1, y: 1 },
        { prefab: "uplinkCode", x: 0, y: 1 },
        { prefab: "uplinkTerminal", x: 2, y: 1, goto: VICTORY_GOTO },
      ]),
    ]),
    [
      "Bad Door: door at (1,1) is placed on blocking terrain.",
      "Bad Door: door at (1,1) must sit between exactly one opposite pair of blocking wall tiles.",
    ],
  );

  assertEquals(
    validateGameMaps([
      createGameMap("Good Door", [
        [0, 0, 0],
        [DEFAULT_WALL_TERRAIN_ID, 0, DEFAULT_WALL_TERRAIN_ID],
        [0, 0, 0],
      ], [
        { prefab: "player", x: 0, y: 0, dir: 1 },
        { prefab: "door", x: 1, y: 1 },
        { prefab: "uplinkCode", x: 1, y: 0 },
        { prefab: "uplinkTerminal", x: 2, y: 0, goto: VICTORY_GOTO },
      ]),
    ]),
    [],
  );
});

Deno.test("map validation allows sound emitters on blocking terrain", () => {
  assertEquals(
    validateGameMaps([
      createGameMap("Ambient Wall", [
        [0, DEFAULT_WALL_TERRAIN_ID, 0],
        [0, 0, 0],
      ], [
        { prefab: "player", x: 0, y: 1, dir: 1 },
        { prefab: "sound", x: 1, y: 0, soundId: SoundId.AmbientHum, radius: 5 },
        { prefab: "uplinkCode", x: 0, y: 0 },
        { prefab: "uplinkTerminal", x: 2, y: 1, goto: VICTORY_GOTO },
      ]),
    ]),
    [],
  );
});

Deno.test("map validation accepts doorway-like and fence-run barriers and rejects floating ones", () => {
  assertEquals(
    validateGameMaps([
      createGameMap("Good Barrier", [
        [0, 0, 0, 0, 0],
        [0, 0, DEFAULT_WALL_TERRAIN_ID, DEFAULT_BARS_TERRAIN_ID, DEFAULT_WALL_TERRAIN_ID],
        [0, 0, 0, 0, 0],
      ], [
        { prefab: "player", x: 0, y: 0, dir: 1 },
        { prefab: "uplinkCode", x: 0, y: 1 },
        { prefab: "uplinkTerminal", x: 1, y: 1, goto: VICTORY_GOTO },
      ]),
    ]),
    [],
  );

  // Continuous fence with a T-junction end (Boot Sector-style), not only a doorway span.
  assertEquals(
    validateGameMaps([
      createGameMap("Fence Barrier", [
        [0, 0, 0, 0, 0],
        [
          DEFAULT_WALL_TERRAIN_ID,
          DEFAULT_BARS_TERRAIN_ID,
          DEFAULT_BARS_TERRAIN_ID,
          DEFAULT_BARS_TERRAIN_ID,
          0,
        ],
        [0, 0, 0, DEFAULT_BARS_TERRAIN_ID, 0],
      ], [
        { prefab: "player", x: 0, y: 0, dir: 1 },
        { prefab: "uplinkCode", x: 1, y: 0 },
        { prefab: "uplinkTerminal", x: 3, y: 0, goto: VICTORY_GOTO },
      ]),
    ]),
    [],
  );

  assertEquals(
    validateGameMaps([
      createGameMap("Bad Barrier", [
        [0, 0, 0],
        [0, DEFAULT_BARS_TERRAIN_ID, 0],
        [0, 0, 0],
      ], [
        { prefab: "player", x: 0, y: 0, dir: 1 },
        { prefab: "uplinkCode", x: 0, y: 1 },
        { prefab: "uplinkTerminal", x: 2, y: 1, goto: VICTORY_GOTO },
      ]),
    ]),
    [
      "Bad Barrier: barrier terrain at (1,1) must be anchored to movement-blocking terrain on at least one side, and must not sit in a four-way blocking cross.",
    ],
  );
});

Deno.test("map validation ignores blocking actors that are cleared during play", () => {
  // Enemies move and can be defeated, and NPCs are relocated by story events, so a
  // blocking actor sitting in a corridor must not make the path count as unreachable.
  assertEquals(
    validateGameMaps([
      createGameMap("Actor Corridor", [
        [0, DEFAULT_WALL_TERRAIN_ID, 0],
        [0, 0, 0],
        [0, DEFAULT_WALL_TERRAIN_ID, 0],
      ], [
        { prefab: "player", x: 0, y: 1, dir: 1 },
        { prefab: "npc", x: 1, y: 1, dir: 1, displayName: "john" },
        { prefab: "uplinkCode", x: 0, y: 0 },
        { prefab: "uplinkTerminal", x: 2, y: 1, goto: VICTORY_GOTO },
      ]),
    ]),
    [],
  );
});

Deno.test("map validation accepts a reachable spear turret when the spear arrives from an earlier map", () => {
  assertEquals(
    validateGameMaps([
      createGameMap("Mainframe Core", [[0, 0, 0]], [
        { prefab: "player", x: 0, y: 0, dir: 1 },
        { prefab: "spearTurret", x: 2, y: 0 },
      ]),
    ]),
    [],
  );
});

Deno.test("map validation requires a terminal to be reachable after collecting code and keys", () => {
  assertEquals(
    validateGameMaps([
      createGameMap("Blocked Terminal", [
        [0, DEFAULT_WALL_TERRAIN_ID, 0],
        [0, DEFAULT_WALL_TERRAIN_ID, 0],
        [0, DEFAULT_WALL_TERRAIN_ID, 0],
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
