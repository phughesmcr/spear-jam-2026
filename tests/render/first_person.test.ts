import { assert, assertEquals, assertNotEquals, assertThrows } from "@std/assert";
import { createGameMap, TexturePack } from "@/src/map/map.ts";
import { GAME_MAPS } from "@/src/map/maps.ts";
import { sceneForMap } from "@/src/render/first_person.ts";

Deno.test("sceneForMap uses terrain palette texture refs for wall and plane slots", () => {
  const map = createGameMap(
    "Textured",
    [[1, 2, 3]],
    [],
    {
      palette: [
        { id: 1, color: "#000000", floor_texture: `${TexturePack.Pack1}:0,0`, ceiling_texture: "ceiling" },
        { id: 2, color: "#888888", wall_texture: `${TexturePack.Pack2}:3,4`, blocking: true },
        { id: 3, color: "#111111", floor_texture: "floor", ceiling_texture: `${TexturePack.Pack3}:9,7` },
      ],
    },
  );

  const scene = sceneForMap(map);
  const customFloorSlot = scene.floors[0]!;
  const defaultCeilingSlot = scene.ceilings[0]!;
  const customWallSlot = scene.walls[1]!;
  const defaultFloorSlot = scene.floors[2]!;
  const customCeilingSlot = scene.ceilings[2]!;

  assert(customFloorSlot > 0);
  assert(customWallSlot > 0);
  assert(customCeilingSlot > 0);
  assertNotEquals(customFloorSlot, defaultFloorSlot);
  assertNotEquals(customWallSlot, 1);
  assertNotEquals(customCeilingSlot, defaultCeilingSlot);
  assertEquals(scene.floors[1], 0);
  assertEquals(scene.ceilings[1], 0);
});

Deno.test("sceneForMap rejects texture refs outside the 10x8 pack grid", () => {
  const map = createGameMap(
    "Invalid Texture",
    [[1]],
    [],
    {
      palette: [
        { id: 1, color: "#000000", floor_texture: `${TexturePack.Pack1}:10,0`, ceiling_texture: "ceiling" },
      ],
    },
  );

  assertThrows(() => sceneForMap(map), Error, "10x8");
});

Deno.test("sceneForMap builds static scenes for authored textured maps", () => {
  for (const map of GAME_MAPS) {
    const scene = sceneForMap(map);
    assert(scene.floors.some((texture) => texture > 0), `${map.name} should have floor textures.`);
    assert(scene.ceilings.some((texture) => texture > 0), `${map.name} should have ceiling textures.`);
    assert(scene.walls.some((texture) => texture > 0), `${map.name} should have wall textures.`);
  }
});
