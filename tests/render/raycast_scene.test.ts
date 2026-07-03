import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import {
  addSprite,
  addThinWall,
  cameraForGridPose,
  clearSceneDynamic,
  createFrame,
  createScene,
  renderFrame,
  THIN_AXIS_X,
  THIN_SLIDE_NEG,
  THIN_SLIDE_UP,
} from "@/src/render/raycast/scene.ts";
import type { RaycastAtlas, RaycastScene } from "@/src/render/raycast/scene.ts";
import { bakeSolidTexture, bakeTexture, TEX_SIZE } from "@/src/render/raycast/textures.ts";

const VIEW = 64;
const CENTER = VIEW >> 1;

const WALL = 0;
const DOOR = 1;
const GRATE = 2;
const CURRENT_SIDE_WALL = 3;
const FLOOR = 0;
const CEILING = 1;
const CURRENT_FLOOR = 2;
const AHEAD_FLOOR = 3;
const SPRITE = 0;

function testAtlas(): RaycastAtlas {
  // Left grate half opaque cyan, right half transparent.
  const grateSource = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([0, 255, 255, 255, 0, 0, 0, 0]),
  };
  return {
    walls: [
      bakeSolidTexture(200, 0, 0),
      bakeSolidTexture(200, 0, 200),
      bakeTexture(grateSource, { transpose: true }),
      bakeSolidTexture(0, 200, 200),
    ],
    planes: [
      bakeSolidTexture(0, 200, 0),
      bakeSolidTexture(0, 0, 200),
      bakeSolidTexture(0, 160, 160),
      bakeSolidTexture(160, 160, 0),
    ],
    sprites: [bakeSolidTexture(200, 200, 0)],
  };
}

/**
 * A 5x3 map with a single open corridor from (1,1) to (3,1) and the camera
 * at (1,1) facing east, so rays travel toward the wall at x = 4.
 */
function corridorScene(): RaycastScene {
  const scene = createScene(5, 3);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 5; x++) {
      const open = y === 1 && x >= 1 && x <= 3;
      if (open) {
        scene.floors[y * 5 + x] = FLOOR + 1;
        scene.ceilings[y * 5 + x] = CEILING + 1;
      } else {
        scene.walls[y * 5 + x] = WALL + 1;
      }
    }
  }
  return scene;
}

const CAMERA = cameraForGridPose(1, 1, 1, 0);

function texel(atlas: RaycastAtlas, layer: keyof RaycastAtlas, id: number, band: number): number {
  return atlas[layer][id]!.bands[band]![0]!;
}

function pixel(frame: { readonly width: number; readonly pixels: Uint32Array }, x: number, y: number): number {
  return frame.pixels[y * frame.width + x]!;
}

Deno.test("renderFrame hits the corridor end wall at the right depth", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  // Camera at x = 1.5, wall face at x = 4.
  assertAlmostEquals(frame.zbuffer[CENTER]!, 2.5, 1e-9);
  // Distance 2.5 falls in shade band 2 with the stronger depth fade.
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", WALL, 2));
});

Deno.test("renderFrame textures floor below and mirrored ceiling above", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertEquals(pixel(frame, CENTER, VIEW - 4), texel(atlas, "planes", FLOOR, 0));
  assertEquals(pixel(frame, CENTER, 3), texel(atlas, "planes", CEILING, 2));
});

Deno.test("renderFrame shows the player's current floor tile in a portrait view", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  scene.floors[1 * 5 + 1] = CURRENT_FLOOR + 1;
  scene.floors[1 * 5 + 2] = AHEAD_FLOOR + 1;
  const frame = createFrame(360, 640);

  renderFrame(frame, scene, atlas, CAMERA);

  assertEquals(
    pixel(frame, frame.width >> 1, Math.floor(frame.height * 0.875)),
    texel(atlas, "planes", CURRENT_FLOOR, 0),
  );
});

Deno.test("renderFrame shows the side wall of the player's current tile", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  scene.walls[1] = CURRENT_SIDE_WALL + 1;
  const frame = createFrame(360, 640);

  renderFrame(frame, scene, atlas, CAMERA);

  assertEquals(
    pixel(frame, Math.floor(frame.width * 0.05), frame.height >> 1),
    texel(atlas, "walls", CURRENT_SIDE_WALL, 1),
  );
});

Deno.test("renderFrame stops rays at opaque thin walls (doors)", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addThinWall(scene, 2, 1, DOOR, THIN_AXIS_X);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  // Door plane sits at x = 2.5, one tile ahead of the camera.
  assertAlmostEquals(frame.zbuffer[CENTER]!, 1, 1e-9);
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", DOOR, 0));
});

Deno.test("renderFrame draws see-through thin walls without stopping rays", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addThinWall(scene, 2, 1, GRATE, THIN_AXIS_X);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  // The ray passes the grate and still registers the solid end wall.
  assertAlmostEquals(frame.zbuffer[CENTER]!, 2.5, 1e-9);
  // The centre column crosses the grate's transparent half: wall shows through.
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", WALL, 2));
  // A column just left of centre crosses the opaque half of the grate texture.
  const grateTexel = atlas.walls[GRATE]!.bands[0]![0]!;
  assertEquals(pixel(frame, CENTER - (CENTER >> 2), CENTER), grateTexel);
});

Deno.test("renderFrame draws sprites in front of walls and occludes behind doors", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSprite(scene, 2.5, 1.5, SPRITE, 1);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "sprites", SPRITE, 0));

  // A closed door in front of the sprite occludes it via the depth buffer.
  clearSceneDynamic(scene);
  addThinWall(scene, 2, 1, DOOR, THIN_AXIS_X);
  addSprite(scene, 3.5, 1.5, SPRITE, 1);
  renderFrame(frame, scene, atlas, CAMERA);
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", DOOR, 0));
});

Deno.test("a horizontally sliding door passes rays through the gap", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  // Slid three-quarters toward the negative span: the centre ray (local 0.5)
  // falls in the gap and reaches the corridor's end wall.
  addThinWall(scene, 2, 1, DOOR, THIN_AXIS_X, THIN_SLIDE_NEG, 0.75);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertAlmostEquals(frame.zbuffer[CENTER]!, 2.5, 1e-9);
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", WALL, 2));
});

Deno.test("a horizontally sliding door still stops rays that hit the slab", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  // Only slightly open: the centre ray (local 0.5) still hits the slab.
  addThinWall(scene, 2, 1, DOOR, THIN_AXIS_X, THIN_SLIDE_NEG, 0.25);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertAlmostEquals(frame.zbuffer[CENTER]!, 1, 1e-9);
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", DOOR, 0));
});

Deno.test("a rising door draws the slab on top and the wall behind below", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addThinWall(scene, 2, 1, DOOR, THIN_AXIS_X, THIN_SLIDE_UP, 0.5);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  // The ray passes under the half-risen slab and registers the end wall.
  assertAlmostEquals(frame.zbuffer[CENTER]!, 2.5, 1e-9);
  // Upper half of the doorway: the slab. Below it: the wall behind.
  assertEquals(pixel(frame, CENTER, CENTER >> 1), texel(atlas, "walls", DOOR, 0));
  assertEquals(pixel(frame, CENTER, CENTER + 6), texel(atlas, "walls", WALL, 2));
});

Deno.test("clearSceneDynamic removes thin walls and sprites", () => {
  const scene = corridorScene();
  addThinWall(scene, 2, 1, DOOR, THIN_AXIS_X);
  addSprite(scene, 2.5, 1.5, SPRITE, 1);

  clearSceneDynamic(scene);

  assertEquals(scene.thinCount, 0);
  assertEquals(scene.spriteCount, 0);
  assert(scene.thinByCell.every((index) => index === -1));
});

Deno.test("renderFrame survives a camera boxed in by walls", () => {
  const atlas = testAtlas();
  const scene = createScene(3, 3);
  scene.walls.fill(WALL + 1);
  scene.walls[4] = 0;
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, cameraForGridPose(1, 1, 0, -1));

  assertAlmostEquals(frame.zbuffer[CENTER]!, 0.5, 1e-9);
});

Deno.test("texture size stays the baked constant the renderer assumes", () => {
  assertEquals(TEX_SIZE, 64);
});
