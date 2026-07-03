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
} from "@/src/render/raycast/scene.ts";
import type { RaycastAtlas, RaycastScene } from "@/src/render/raycast/scene.ts";
import { bakeSolidTexture, bakeTexture, TEX_SIZE } from "@/src/render/raycast/textures.ts";

const VIEW = 64;
const CENTER = VIEW >> 1;

const WALL = 0;
const DOOR = 1;
const GRATE = 2;
const FLOOR = 0;
const CEILING = 1;
const SPRITE = 0;

function testAtlas(): RaycastAtlas {
  // Left grate half opaque cyan, right half transparent.
  const grateSource = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([0, 255, 255, 255, 0, 0, 0, 0]),
  };
  return {
    walls: [bakeSolidTexture(200, 0, 0), bakeSolidTexture(200, 0, 200), bakeTexture(grateSource, { transpose: true })],
    planes: [bakeSolidTexture(0, 200, 0), bakeSolidTexture(0, 0, 200)],
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

function pixel(frame: { pixels: Uint32Array }, x: number, y: number): number {
  return frame.pixels[y * VIEW + x]!;
}

Deno.test("renderFrame hits the corridor end wall at the right depth", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  // Camera at x = 1.5, wall face at x = 4.
  assertAlmostEquals(frame.zbuffer[CENTER]!, 2.5, 1e-9);
  // Distance 2.5 falls in shade band 1.
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", WALL, 1));
});

Deno.test("renderFrame textures floor below and mirrored ceiling above", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertEquals(pixel(frame, CENTER, VIEW - 4), texel(atlas, "planes", FLOOR, 0));
  assertEquals(pixel(frame, CENTER, 3), texel(atlas, "planes", CEILING, 0));
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
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", WALL, 1));
  // A column to the left crosses the opaque half of the grate texture.
  const grateTexel = atlas.walls[GRATE]!.bands[0]![0]!;
  assertEquals(pixel(frame, CENTER >> 1, CENTER), grateTexel);
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
