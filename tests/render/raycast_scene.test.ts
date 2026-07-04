import { assert, assertAlmostEquals, assertEquals, assertThrows } from "@std/assert";
import {
  addSlidingSolidWall,
  addSolidWall,
  addSprite,
  addThinWall,
  CAMERA_PLANE_LENGTH,
  cameraForGridPose,
  clearSceneDynamic,
  createFrame,
  createScene,
  renderFrame,
  THIN_AXIS_X,
  THIN_SLIDE_DOWN,
  THIN_SLIDE_NEG,
  THIN_SLIDE_UP,
} from "@/src/render/raycast/scene.ts";
import type { RaycastAtlas, RaycastScene } from "@/src/render/raycast/scene.ts";
import { bakeSolidTexture, bakeTexture, TEX_SIZE } from "@/src/render/raycast/textures.ts";
import type { TexelSource } from "@/src/render/raycast/textures.ts";

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
const REVERSE_CAMERA = cameraForGridPose(3, 1, -1, 0);

function texel(atlas: RaycastAtlas, layer: keyof RaycastAtlas, id: number, band: number): number {
  return atlas[layer][id]!.mips[0]!.bands[band]![0]!;
}

function mipTexel(atlas: RaycastAtlas, layer: keyof RaycastAtlas, id: number, band: number, mip: number): number {
  return atlas[layer][id]!.mips[mip]!.bands[band]![0]!;
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

Deno.test("renderFrame samples distant floor rows from averaged mips", () => {
  const atlas: RaycastAtlas = {
    walls: [],
    planes: [bakeTexture(checkerSource())],
    sprites: [],
  };
  const scene = createScene(80, 3);
  for (let x = 0; x < 80; x++) {
    scene.floors[1 * 80 + x] = 1;
  }
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertEquals(pixel(frame, CENTER, CENTER), mipTexel(atlas, "planes", FLOOR, 7, 3));
});

Deno.test("renderFrame shows the player's current floor and ceiling tile across a portrait view", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  scene.floors[1 * 5 + 1] = CURRENT_FLOOR + 1;
  scene.ceilings[1 * 5 + 1] = CURRENT_FLOOR + 1;
  scene.floors[1 * 5 + 2] = AHEAD_FLOOR + 1;
  scene.ceilings[1 * 5 + 2] = AHEAD_FLOOR + 1;
  const frame = createFrame(360, 640);

  renderFrame(frame, scene, atlas, CAMERA);

  const aheadY = Math.floor(frame.height * 0.75);
  assertEquals(pixel(frame, frame.width >> 1, aheadY), texel(atlas, "planes", AHEAD_FLOOR, 0));
  assertEquals(pixel(frame, frame.width >> 1, frame.height - 1 - aheadY), texel(atlas, "planes", AHEAD_FLOOR, 2));

  // The current tile's front edge (0.5 tiles ahead) projects at
  // horizon + focal, about 93% down this portrait frame; sample below it.
  const sampleY = Math.floor(frame.height * 0.95);
  const sampleXs = [Math.floor(frame.width * 0.2), frame.width >> 1, Math.floor(frame.width * 0.8)];
  for (const x of sampleXs) {
    assertEquals(pixel(frame, x, sampleY), texel(atlas, "planes", CURRENT_FLOOR, 0));
    assertEquals(pixel(frame, x, frame.height - 1 - sampleY), texel(atlas, "planes", CURRENT_FLOOR, 2));
  }
});

Deno.test("renderFrame keeps side wall context near the edge of a portrait view", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  scene.walls[2] = CURRENT_SIDE_WALL + 1;
  const frame = createFrame(360, 640);

  renderFrame(frame, scene, atlas, CAMERA);

  assertEquals(
    pixel(frame, Math.floor(frame.width * 0.05), frame.height >> 1),
    texel(atlas, "walls", CURRENT_SIDE_WALL, 1),
  );
});

Deno.test("renderFrame samples distant wall columns from averaged mips", () => {
  const atlas: RaycastAtlas = {
    walls: [bakeTexture(checkerSource(), { transpose: true })],
    planes: [],
    sprites: [],
  };
  const scene = createScene(14, 3);
  scene.walls.fill(WALL + 1);
  for (let x = 1; x < 13; x++) {
    scene.walls[1 * 14 + x] = 0;
  }
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertEquals(pixel(frame, CENTER, CENTER), mipTexel(atlas, "walls", WALL, 7, 3));
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

Deno.test("addSolidWall stops rays at the near cell face like a full wall", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSolidWall(scene, 2, 1, DOOR);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  // A thin door plane sits mid-cell at x = 2.5 (depth 1); a solid wall stops at
  // the cell's near face x = 2, half a tile ahead of the camera at x = 1.5.
  assertAlmostEquals(frame.zbuffer[CENTER]!, 0.5, 1e-9);
  // The injected texture is shown, not the corridor-end wall behind it.
  assertEquals(scene.walls[1 * 5 + 2], DOOR + 1);
});

Deno.test("closed sliding solid walls stop rays at the near cell face", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSlidingSolidWall(scene, 2, 1, DOOR, THIN_AXIS_X);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertAlmostEquals(frame.zbuffer[CENTER]!, 0.5, 1e-9);
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", DOOR, 0));
});

Deno.test("sliding solid walls at offset zero do not jump to the thin-wall mid-plane", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSlidingSolidWall(scene, 2, 1, DOOR, THIN_AXIS_X, THIN_SLIDE_NEG, 0);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertAlmostEquals(frame.zbuffer[CENTER]!, 0.5, 1e-9);
});

Deno.test("sliding solid walls still stop rays that hit the slab", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSlidingSolidWall(scene, 2, 1, DOOR, THIN_AXIS_X, THIN_SLIDE_NEG, 0.25);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertAlmostEquals(frame.zbuffer[CENTER]!, 0.5, 1e-9);
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", DOOR, 0));
});

Deno.test("sliding solid walls pass rays through the opened gap", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSlidingSolidWall(scene, 2, 1, DOOR, THIN_AXIS_X, THIN_SLIDE_NEG, 0.75);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertAlmostEquals(frame.zbuffer[CENTER]!, 2.5, 1e-9);
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", WALL, 2));
});

Deno.test("sliding solid walls use the opposite near face when viewed from behind", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSlidingSolidWall(scene, 2, 1, DOOR, THIN_AXIS_X);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, REVERSE_CAMERA);

  assertAlmostEquals(frame.zbuffer[CENTER]!, 0.5, 1e-9);
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", DOOR, 0));
});

Deno.test("rising sliding solid walls draw the front slab over the wall behind", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSlidingSolidWall(scene, 2, 1, DOOR, THIN_AXIS_X, THIN_SLIDE_UP, 0.5);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertAlmostEquals(frame.zbuffer[CENTER]!, 2.5, 1e-9);
  assertEquals(pixel(frame, CENTER, CENTER - (CENTER >> 2)), texel(atlas, "walls", DOOR, 0));
  assertEquals(pixel(frame, CENTER, CENTER + (CENTER >> 3)), texel(atlas, "walls", WALL, 2));
});

Deno.test("sinking sliding solid walls draw the front slab over the wall behind", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSlidingSolidWall(scene, 2, 1, DOOR, THIN_AXIS_X, THIN_SLIDE_DOWN, 0.5);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertAlmostEquals(frame.zbuffer[CENTER]!, 2.5, 1e-9);
  assertEquals(pixel(frame, CENTER, CENTER - (CENTER >> 2)), texel(atlas, "walls", WALL, 2));
  assertEquals(pixel(frame, CENTER, CENTER + (CENTER >> 2)), texel(atlas, "walls", DOOR, 0));
});

Deno.test("clearSceneDynamic restores a solid-wall cell to its baked value", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSolidWall(scene, 2, 1, DOOR);
  clearSceneDynamic(scene);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  // The injected wall is gone, so the ray reaches the corridor end wall again.
  assertAlmostEquals(frame.zbuffer[CENTER]!, 2.5, 1e-9);
  assertEquals(scene.walls[1 * 5 + 2], 0);
});

Deno.test("renderFrame uses the door texture for flanking jamb faces", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addThinWall(scene, 2, 1, DOOR, THIN_AXIS_X);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertEquals(pixel(frame, 0, CENTER), texel(atlas, "walls", DOOR, 1));
});

Deno.test("renderFrame keeps the wall beyond a door cell on its wall texture", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  scene.walls[1 * 5 + 3] = WALL + 1;
  addThinWall(scene, 2, 1, DOOR, THIN_AXIS_X, THIN_SLIDE_NEG, 0.75);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertAlmostEquals(frame.zbuffer[CENTER]!, 1.5, 1e-9);
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", WALL, 1));
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
  const grateTexel = atlas.walls[GRATE]!.mips[0]!.bands[0]![0]!;
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
  assertEquals(pixel(frame, CENTER, CENTER - (CENTER >> 2)), texel(atlas, "walls", DOOR, 0));
  assertEquals(pixel(frame, CENTER, CENTER + (CENTER >> 3)), texel(atlas, "walls", WALL, 2));
});

Deno.test("clearSceneDynamic removes thin walls, sliding solid walls, and sprites", () => {
  const scene = corridorScene();
  addThinWall(scene, 2, 1, DOOR, THIN_AXIS_X);
  addSlidingSolidWall(scene, 3, 1, DOOR, THIN_AXIS_X);
  addSprite(scene, 2.5, 1.5, SPRITE, 1);

  clearSceneDynamic(scene);

  assertEquals(scene.thinCount, 0);
  assertEquals(scene.slidingSolidCount, 0);
  assertEquals(scene.spriteCount, 0);
  assert(scene.thinByCell.every((index) => index === -1));
  assert(scene.slidingSolidByCell.every((index) => index === -1));
});

Deno.test("createScene sizes thin wall storage from map cell count", () => {
  const scene = createScene(65, 1);

  for (let x = 0; x < 65; x++) {
    addThinWall(scene, x, 0, DOOR, THIN_AXIS_X);
  }

  assertEquals(scene.thinCount, 65);
  assertEquals(scene.thinByCell[64], 64);
});

Deno.test("createScene sizes sprite storage from map cell count", () => {
  const scene = createScene(129, 1);

  for (let x = 0; x < 129; x++) {
    addSprite(scene, x + 0.5, 0.5, SPRITE, 1);
  }

  assertEquals(scene.spriteCount, 129);
  assertEquals(scene.spriteX[128], 128.5);
});

Deno.test("renderFrame fails loudly when sprite scratch capacity is too small", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSprite(scene, 2.5, 1.5, SPRITE, 1);
  addSprite(scene, 3.5, 1.5, SPRITE, 1);
  const frame = createFrame(VIEW, VIEW, undefined, 1);

  assertThrows(
    () => renderFrame(frame, scene, atlas, CAMERA),
    Error,
    "sprite scratch capacity 1",
  );
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
  assertEquals(TEX_SIZE, 128);
});

Deno.test("camera ray plane keeps one floor texture close to one game tile", () => {
  const camera = cameraForGridPose(1, 1, 1, 0);

  assertAlmostEquals(Math.hypot(camera.planeX, camera.planeY), 0.66, 1e-9);
  assertAlmostEquals(CAMERA_PLANE_LENGTH, 0.66, 1e-9);
});

function checkerSource(): TexelSource {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const value = ((x ^ y) & 1) === 0 ? 0 : 255;
      const index = (y * TEX_SIZE + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { width: TEX_SIZE, height: TEX_SIZE, data };
}
