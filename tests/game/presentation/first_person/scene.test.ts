import type { LightEntity } from "@/src/game/model/render_snapshot.ts";
import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import { createGameMap, TexturePack } from "@/src/game/world/map.ts";
import {
  DEFAULT_BARS_TERRAIN_ID,
  DEFAULT_WALL_TERRAIN_ID,
  SKY_CEILING_TEXTURE,
} from "@/src/game/world/terrain_palette.ts";
import { createFirstPersonAssets } from "@/src/game/presentation/first_person/assets/mod.ts";
import {
  addTerrainBarriers,
  createLightUpdateThrottle,
  doorAxis,
  doorSlideForAxis,
  type FirstPersonSceneState,
  sceneForMap,
  sceneHasSkyCeiling,
  secretWallTextureSlot,
  updateSceneLights,
} from "@/src/game/presentation/first_person/scene.ts";
import { THIN_AXIS_X, THIN_AXIS_Y, THIN_SLIDE_NEG, THIN_SLIDE_POS, THIN_SLIDE_UP } from "@/src/engine/raycast/mod.ts";
import { assert, assertEquals, assertNotEquals, assertStrictEquals, assertThrows } from "@std/assert";
import type { Entity } from "turn-based-engine/ecs";

function createSceneState(): FirstPersonSceneState {
  return {
    sceneByMap: new WeakMap(),
    terrainBarriersByScene: new WeakMap(),
  };
}

function lightProvider(lights: readonly LightEntity[]) {
  return {
    forEachLight(visit: (light: LightEntity) => void): void {
      for (const light of lights) visit(light);
    },
  };
}

Deno.test("scene maps authored wall, floor, ceiling, and sky materials", () => {
  const { view: assets } = createFirstPersonAssets();
  const map = createGameMap(
    "Textured",
    [[1, 2, 3, 4]],
    [],
    {
      palette: [
        {
          kind: "floor",
          id: 1,
          floor_texture: `${TexturePack.Pack1}:0,0`,
          ceiling_texture: "ceiling",
        },
        { kind: "wall", id: 2, wall_texture: `${TexturePack.Pack2}:3,2` },
        {
          kind: "floor",
          id: 3,
          floor_texture: "floor",
          ceiling_texture: `${TexturePack.Pack3}:4,3`,
        },
        { kind: "floor", id: 4, floor_texture: "floor", ceiling_texture: SKY_CEILING_TEXTURE },
      ],
    },
  );

  const scene = sceneForMap(createSceneState(), assets.materials, map);

  assertEquals(scene.floors[0], assets.materials.floor(`${TexturePack.Pack1}:0,0`) + 1);
  assertEquals(scene.ceilings[0], assets.materials.ceiling("ceiling") + 1);
  assertEquals(scene.walls[1], assets.materials.wall(`${TexturePack.Pack2}:3,2`) + 1);
  assertEquals(scene.floors[1], 0);
  assertEquals(scene.ceilings[1], 0);
  assertEquals(scene.floors[2], assets.materials.floor("floor") + 1);
  assertEquals(scene.ceilings[2], assets.materials.ceiling(`${TexturePack.Pack3}:4,3`) + 1);
  assertEquals(scene.ceilings[3], assets.materials.ceiling(SKY_CEILING_TEXTURE) + 1);
  assert(scene.hasSkyCeiling);
  assert(sceneHasSkyCeiling(scene, assets.atlas));
});

Deno.test("scene caches one static scene per map identity", () => {
  const { view: assets } = createFirstPersonAssets();
  const state = createSceneState();
  const map = createGameMap("Cached", [[1]], [], {
    palette: [{ kind: "floor", id: 1, floor_texture: "floor", ceiling_texture: "ceiling" }],
  });

  assertStrictEquals(
    sceneForMap(state, assets.materials, map),
    sceneForMap(state, assets.materials, map),
  );
});

Deno.test("scene adds barrier terrain as transparent thin walls over planes", () => {
  const { view: assets } = createFirstPersonAssets();
  const state = createSceneState();
  const map = createGameMap("Barrier", [
    [0, 0, DEFAULT_WALL_TERRAIN_ID, 0, 0],
    [0, 0, DEFAULT_BARS_TERRAIN_ID, 0, 0],
    [0, 0, DEFAULT_WALL_TERRAIN_ID, 0, 0],
  ], []);

  const scene = sceneForMap(state, assets.materials, map);
  addTerrainBarriers(state, scene);
  const cell = 1 * 5 + 2;

  assertEquals(scene.walls[cell], 0);
  assert(scene.floors[cell]! > 0);
  assert(scene.ceilings[cell]! > 0);
  assertNotEquals(scene.thinByCell[cell], -1);
  assertEquals(scene.thinCount, 1);
});

Deno.test("scene rejects texture refs outside the authored pack grid", () => {
  const { view: assets } = createFirstPersonAssets();
  const map = createGameMap(
    "Invalid Texture",
    [[1]],
    [],
    {
      palette: [
        {
          kind: "floor",
          id: 1,
          floor_texture: `${TexturePack.Pack1}:5,0`,
          ceiling_texture: "ceiling",
        },
      ],
    },
  );

  assertThrows(
    () => sceneForMap(createSceneState(), assets.materials, map),
    Error,
    "5x4",
  );
});

Deno.test("scene builds static geometry for every campaign map", () => {
  const { view: assets } = createFirstPersonAssets();
  const state = createSceneState();

  for (const { map } of SHIPPED_GAME.levels.all) {
    const scene = sceneForMap(state, assets.materials, map);
    assert(scene.floors.some((texture) => texture > 0), `${map.name} should have floor textures.`);
    assert(scene.ceilings.some((texture) => texture > 0), `${map.name} should have ceiling textures.`);
    assert(scene.walls.some((texture) => texture > 0), `${map.name} should have wall textures.`);
  }
});

Deno.test("scene derives door axes, slides, and secret-wall material from surrounding terrain", () => {
  const { view: assets } = createFirstPersonAssets();
  const map = createGameMap(
    "Doors",
    [
      [2, 2, 2],
      [1, 1, 1],
      [2, 2, 2],
    ],
    [],
    {
      palette: [
        { kind: "floor", id: 1, floor_texture: "floor", ceiling_texture: "ceiling" },
        { kind: "wall", id: 2, wall_texture: `${TexturePack.Pack2}:1,1` },
      ],
    },
  );

  assertEquals(doorAxis(map, 1, 1), THIN_AXIS_X);
  assertEquals(doorSlideForAxis("up", THIN_AXIS_X), THIN_SLIDE_UP);
  assertEquals(doorSlideForAxis("east", THIN_AXIS_Y), THIN_SLIDE_POS);
  assertEquals(doorSlideForAxis("east", THIN_AXIS_X), THIN_SLIDE_NEG);
  assertEquals(
    secretWallTextureSlot(assets.materials, map, 1, 1),
    assets.materials.wall(`${TexturePack.Pack2}:1,1`),
  );

  const horizontalMap = createGameMap("Horizontal Door", [[2, 1, 2]], [], {
    palette: [
      { kind: "floor", id: 1, floor_texture: "floor", ceiling_texture: "ceiling" },
      { kind: "wall", id: 2, wall_texture: "wall" },
    ],
  });
  assertEquals(doorAxis(horizontalMap, 1, 0), THIN_AXIS_Y);
});

Deno.test("scene lighting throttles flicker rebuilds and resets when lights disappear", () => {
  const { view: assets } = createFirstPersonAssets();
  const map = createGameMap(
    "Lights",
    [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ],
    [],
    {
      palette: [{ kind: "floor", id: 1, floor_texture: "floor", ceiling_texture: "ceiling" }],
    },
  );
  const scene = sceneForMap(createSceneState(), assets.materials, map);
  const throttle = createLightUpdateThrottle();
  const lights: LightEntity[] = [{
    entity: 2 as Entity,
    x: 1,
    y: 1,
    red: 255,
    green: 64,
    blue: 0,
    radius: 2,
    flickerAmount: 1,
    flickerSpeed: 7,
  }];

  assert(updateSceneLights(scene, lightProvider(lights), 0, throttle));
  const firstAdjacentLight = scene.lightRed[1 * 3 + 2]!;
  assert(scene.lightGreen[1 * 3 + 1]! > 112);
  assert(scene.lightGreen[1 * 3 + 1]! < 176);

  assert(updateSceneLights(scene, lightProvider(lights), 16, throttle));
  assertEquals(scene.lightRed[1 * 3 + 2], firstAdjacentLight);

  assert(updateSceneLights(scene, lightProvider(lights), 250, throttle));
  assertNotEquals(scene.lightRed[1 * 3 + 2], firstAdjacentLight);

  assertEquals(updateSceneLights(scene, lightProvider([]), 500, throttle), false);
  assertEquals([...scene.lightRed], Array(9).fill(255));
  assertEquals([...scene.lightGreen], Array(9).fill(255));
  assertEquals([...scene.lightBlue], Array(9).fill(255));
});
