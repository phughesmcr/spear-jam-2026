import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  BarrierTexture,
  createGameMap,
  KeyColor,
  keyColorCode,
  keyColorForCode,
  mapDimensions,
  terrainAt,
  terrainBlocksAttacks,
  terrainBlocksMovement,
  terrainBlocksSight,
  terrainIsBarrier,
  TexturePack,
} from "@/src/map/map.ts";
import { baseFlagsAt, copyBaseFlags, dimensions, tileIndex } from "@/src/map/static_grid.ts";
import { DEFAULT_BARS_TERRAIN_ID, DEFAULT_WALL_TERRAIN_ID } from "@/src/map/terrain_palettes.ts";
import { flagsBlockAttack, flagsBlockMovement, flagsBlockSight, terrainFlags, TileFlag } from "@/src/map/tile_flags.ts";

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

Deno.test("createGameMap rejects terrain tiles missing from the palette", () => {
  assertThrows(
    () => createGameMap("Missing Palette Tile", [[999]], []),
    Error,
    'Map "Missing Palette Tile" terrain tile 999 at (0,0) is missing from its palette.',
  );
});

Deno.test("terrainAt resolves palette tiles and rejects out-of-bounds reads", () => {
  const map = createGameMap("Tiny", [
    [DEFAULT_WALL_TERRAIN_ID, 0],
    [0, DEFAULT_WALL_TERRAIN_ID],
  ], []);

  assertEquals(mapDimensions(map), { width: 2, height: 2 });
  assertEquals(terrainAt(map, 0, 0)?.kind, "wall");
  assertEquals(terrainAt(map, 1, 0)?.kind, "floor");
  assertEquals(terrainAt(map, -1, 0), undefined);
  assertEquals(terrainAt(map, 2, 0), undefined);
  assertEquals(terrainAt(map, 0, 2), undefined);
  assertEquals(terrainAt(map, 0.5, 0), undefined);
});

Deno.test("terrain helpers expose movement, sight, and attack semantics", () => {
  const map = createGameMap("Semantics", [[0, DEFAULT_WALL_TERRAIN_ID, DEFAULT_BARS_TERRAIN_ID]], []);
  const floor = terrainAt(map, 0, 0);
  const wall = terrainAt(map, 1, 0);
  const barrier = terrainAt(map, 2, 0);

  assertEquals(terrainBlocksMovement(floor), false);
  assertEquals(terrainBlocksSight(floor), false);
  assertEquals(terrainBlocksAttacks(floor), false);
  assertEquals(terrainBlocksMovement(wall), true);
  assertEquals(terrainBlocksSight(wall), true);
  assertEquals(terrainBlocksAttacks(wall), true);
  assertEquals(terrainBlocksMovement(barrier), true);
  assertEquals(terrainBlocksSight(barrier), false);
  assertEquals(terrainBlocksAttacks(barrier), true);
  assertEquals(terrainIsBarrier(barrier), true);
});

Deno.test("tile flags expose floor, wall, barrier, and out-of-bounds physics", () => {
  const map = createGameMap("Flag Semantics", [[0, DEFAULT_WALL_TERRAIN_ID, DEFAULT_BARS_TERRAIN_ID]], []);
  const floor = terrainAt(map, 0, 0);
  const wall = terrainAt(map, 1, 0);
  const barrier = terrainAt(map, 2, 0);
  const blocksAll = TileFlag.BlocksMove | TileFlag.BlocksSight | TileFlag.BlocksAttack;

  assertEquals(terrainFlags(floor), 0);
  assertEquals(terrainFlags(wall), blocksAll);
  assertEquals(terrainFlags(barrier), TileFlag.BlocksMove | TileFlag.BlocksAttack);
  assertEquals(terrainFlags(undefined), blocksAll);
  assertEquals(flagsBlockMovement(terrainFlags(undefined)), true);
  assertEquals(flagsBlockSight(terrainFlags(undefined)), true);
  assertEquals(flagsBlockAttack(terrainFlags(undefined)), true);
});

Deno.test("static grid exposes dimensions, indices, terrain, and base flag copies", () => {
  const map = createGameMap("Static Grid", [[0, DEFAULT_WALL_TERRAIN_ID, DEFAULT_BARS_TERRAIN_ID]], []);

  assertEquals(dimensions(map), { width: 3, height: 1 });
  assertEquals(tileIndex(map, 2, 0), 2);
  assertEquals(tileIndex(map, -1, 0), undefined);
  assertEquals(baseFlagsAt(map, 0, 0), 0);
  assertEquals(baseFlagsAt(map, 1, 0), TileFlag.BlocksMove | TileFlag.BlocksSight | TileFlag.BlocksAttack);
  assertEquals(baseFlagsAt(map, 2, 0), TileFlag.BlocksMove | TileFlag.BlocksAttack);
  assertEquals(baseFlagsAt(map, 3, 0), undefined);

  const copy = copyBaseFlags(map);
  copy[1] = 0;

  assertEquals(baseFlagsAt(map, 1, 0), TileFlag.BlocksMove | TileFlag.BlocksSight | TileFlag.BlocksAttack);
});

Deno.test("createGameMap accepts a custom terrain texture palette", () => {
  const map = createGameMap(
    "Textured",
    [[2, 3]],
    [],
    {
      palette: [
        {
          kind: "floor",
          id: 2,
          color: "#111111",
          floor_texture: `${TexturePack.Pack1}:0,0`,
          ceiling_texture: "ceiling",
        },
        { kind: "wall", id: 3, color: "#eeeeee", wall_texture: `${TexturePack.Pack2}:4,3` },
        {
          kind: "barrier",
          id: 4,
          color: "#38bdf8",
          barrier_texture: BarrierTexture.Bars,
          floor_texture: `${TexturePack.Pack1}:0,0`,
          ceiling_texture: "ceiling",
        },
      ],
    },
  );

  const floor = terrainAt(map, 0, 0);
  const wall = terrainAt(map, 1, 0);
  assert(floor !== undefined && "floor_texture" in floor);
  assert(wall !== undefined && "wall_texture" in wall);
  assertEquals(floor.floor_texture, "pack1:0,0");
  assertEquals(wall.wall_texture, "pack2:4,3");
});

Deno.test("key colors use stable component codes", () => {
  assertEquals(keyColorForCode(keyColorCode(KeyColor.Red)), KeyColor.Red);
  assertEquals(keyColorForCode(keyColorCode(KeyColor.Blue)), KeyColor.Blue);
  assertEquals(keyColorForCode(keyColorCode(KeyColor.Yellow)), KeyColor.Yellow);
});
