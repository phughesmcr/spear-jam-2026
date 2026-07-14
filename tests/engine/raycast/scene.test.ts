import type { RaycastAtlas, RaycastScene } from "@/src/engine/raycast/scene.ts";
import {
  addSlidingSolidWall,
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
} from "@/src/engine/raycast/scene.ts";
import type { TexelSource } from "@/src/engine/raycast/textures.ts";
import { bakeSolidTexture, bakeTexture, TEX_SIZE } from "@/src/engine/raycast/textures.ts";
import { assert, assertAlmostEquals, assertEquals, assertNotEquals, assertThrows } from "@std/assert";

const VIEW = 64;
const CENTER = VIEW >> 1;

const WALL = 0;
const DOOR = 1;
const GRATE = 2;
const CURRENT_SIDE_WALL = 3;
const JAMB = 4;
const FLOOR = 0;
const CEILING = 1;
const CURRENT_FLOOR = 2;
const AHEAD_FLOOR = 3;
const SKY = 4;
const SKY_FAR = 5;
const SPRITE = 0;

type TextureAtlasLayer = "walls" | "planes" | "sprites" | "spriteLightmaps";

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
      bakeSolidTexture(120, 120, 80),
    ],
    planes: [
      bakeSolidTexture(0, 200, 0),
      bakeSolidTexture(0, 0, 200),
      bakeSolidTexture(0, 160, 160),
      bakeSolidTexture(160, 160, 0),
      bakeTexture(stripeSource()),
      bakeSolidTexture(18, 24, 64),
    ],
    skyPlane: SKY,
    skyFarPlane: SKY_FAR,
    jambWall: JAMB,
    sprites: [bakeSolidTexture(200, 200, 0)],
    spriteLightmaps: [],
  };
}

/** A single open east-west corridor with one wall cell at each end. */
function corridorScene(width = 5): RaycastScene {
  const scene = createScene(width, 3);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < width; x++) {
      const open = y === 1 && x >= 1 && x < width - 1;
      if (open) {
        scene.floors[y * width + x] = FLOOR + 1;
        scene.ceilings[y * width + x] = CEILING + 1;
      } else {
        scene.walls[y * width + x] = WALL + 1;
      }
    }
  }
  return scene;
}

const CAMERA = cameraForGridPose(1, 1, 1, 0);
const REVERSE_CAMERA = cameraForGridPose(3, 1, -1, 0);

function texel(atlas: RaycastAtlas, layer: TextureAtlasLayer, id: number, band: number): number {
  return atlas[layer][id]!.mips[0]!.bands[band]![0]!;
}

function mipTexel(atlas: RaycastAtlas, layer: TextureAtlasLayer, id: number, band: number, mip: number): number {
  return atlas[layer][id]!.mips[mip]!.bands[band]![0]!;
}

function pixel(frame: { readonly width: number; readonly pixels: Uint32Array }, x: number, y: number): number {
  return frame.pixels[y * frame.width + x]!;
}

function rgba(pixel: number): readonly [number, number, number, number] {
  return [pixel & 0xff, (pixel >>> 8) & 0xff, (pixel >>> 16) & 0xff, (pixel >>> 24) & 0xff];
}

function lightPixel(pixel: number, red: number, green: number, blue: number): number {
  const [sourceRed, sourceGreen, sourceBlue] = rgba(pixel);
  return (0xff000000 |
    ((sourceRed * red / 255) | 0) |
    (((sourceGreen * green / 255) | 0) << 8) |
    (((sourceBlue * blue / 255) | 0) << 16)) >>> 0;
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

Deno.test("renderFrame tints wall texels from the visible tile light", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  scene.walls[1 * 5 + 4] = CURRENT_SIDE_WALL + 1;
  scene.lightRed[1 * 5 + 3] = 255;
  scene.lightGreen[1 * 5 + 3] = 64;
  scene.lightBlue[1 * 5 + 3] = 128;
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  const unlit = texel(atlas, "walls", CURRENT_SIDE_WALL, 2);
  assertEquals(pixel(frame, CENTER, CENTER), lightPixel(unlit, 255, 64, 128));
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
    spriteLightmaps: [],
  };
  const scene = createScene(80, 3);
  for (let x = 0; x < 80; x++) {
    scene.floors[1 * 80 + x] = 1;
  }
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertEquals(pixel(frame, CENTER, CENTER), mipTexel(atlas, "planes", FLOOR, 7, 3));
});

Deno.test("renderFrame samples sky ceilings in screen space instead of mirroring ceiling tiles", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  scene.ceilings[1 * 5 + 1] = SKY + 1;
  scene.ceilings[1 * 5 + 2] = SKY + 1;
  scene.ceilings[1 * 5 + 3] = SKY + 1;
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertNotEquals(pixel(frame, CENTER, 3), texel(atlas, "planes", CEILING, 2));
});

Deno.test("renderFrame samples sky vertical texture rows from ceiling screen rows", () => {
  const atlas: RaycastAtlas = {
    walls: [],
    planes: [bakeTexture(verticalSource())],
    skyPlane: 0,
    sprites: [],
    spriteLightmaps: [],
  };
  const scene = createScene(5, 5);
  scene.ceilings.fill(1);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, cameraForGridPose(2, 2, 1, 0));

  assertNotEquals(pixel(frame, CENTER, 3), pixel(frame, CENTER, 4));
});

Deno.test("renderFrame tiles sky texture across the screen instead of magnifying a narrow panorama slice", () => {
  const width = 256;
  const atlas: RaycastAtlas = {
    walls: [],
    planes: [bakeTexture(columnSource())],
    skyPlane: 0,
    sprites: [],
    spriteLightmaps: [],
  };
  const scene = createScene(24, 24);
  scene.ceilings.fill(1);
  const frame = createFrame(width, VIEW);

  renderFrame(frame, scene, atlas, cameraForGridPose(12, 12, 1, 0));

  const sampled = new Set<number>();
  for (let x = 0; x < width; x++) sampled.add(pixel(frame, x, 3));
  assert(sampled.size > TEX_SIZE >> 1);
});

Deno.test("renderFrame lets transparent sky foreground pixels show the far sky layer", () => {
  const atlas: RaycastAtlas = {
    walls: [],
    planes: [
      bakeTexture(transparentSource()),
      bakeSolidTexture(16, 32, 96),
    ],
    skyPlane: 0,
    skyFarPlane: 1,
    sprites: [],
    spriteLightmaps: [],
  };
  const scene = createScene(5, 5);
  scene.ceilings.fill(1);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, cameraForGridPose(2, 2, 1, 0));

  assertEquals(pixel(frame, CENTER, 3), texel(atlas, "planes", 1, 0));
});

Deno.test("renderFrame keeps opaque black sky foreground pixels opaque", () => {
  const atlas: RaycastAtlas = {
    walls: [],
    planes: [
      bakeSolidTexture(0, 0, 0),
      bakeSolidTexture(16, 32, 96),
    ],
    skyPlane: 0,
    skyFarPlane: 1,
    sprites: [],
    spriteLightmaps: [],
  };
  const scene = createScene(5, 5);
  scene.ceilings.fill(1);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, cameraForGridPose(2, 2, 1, 0));

  assertEquals(pixel(frame, CENTER, 3), texel(atlas, "planes", 0, 0));
});

Deno.test("renderFrame scrolls sky ceilings when the camera turns", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  scene.ceilings[1 * 5 + 1] = SKY + 1;
  scene.ceilings[1 * 5 + 2] = SKY + 1;
  const eastFrame = createFrame(VIEW, VIEW);
  const northFrame = createFrame(VIEW, VIEW);

  renderFrame(eastFrame, scene, atlas, CAMERA);
  renderFrame(northFrame, scene, atlas, cameraForGridPose(1, 1, 0, -1));

  assertNotEquals(pixel(eastFrame, CENTER, 3), pixel(northFrame, CENTER, 3));
});

Deno.test("renderFrame scrolls the near sky layer over time", () => {
  const atlas: RaycastAtlas = {
    walls: [],
    planes: [bakeTexture(columnSource())],
    skyPlane: 0,
    sprites: [],
    spriteLightmaps: [],
  };
  const scene = createScene(5, 5);
  scene.ceilings.fill(1);
  const firstFrame = createFrame(VIEW, VIEW);
  const secondFrame = createFrame(VIEW, VIEW);

  renderFrame(firstFrame, scene, atlas, cameraForGridPose(2, 2, 1, 0), 0);
  renderFrame(secondFrame, scene, atlas, cameraForGridPose(2, 2, 1, 0), 2_000);

  assertNotEquals(pixel(firstFrame, CENTER, 3), pixel(secondFrame, CENTER, 3));
});

Deno.test("renderFrame shifts sky ceilings slightly with lateral movement", () => {
  const atlas = testAtlas();
  const scene = createScene(5, 5);
  scene.floors.fill(FLOOR + 1);
  scene.ceilings.fill(SKY + 1);
  const baseFrame = createFrame(VIEW, VIEW);
  const shiftedFrame = createFrame(VIEW, VIEW);

  renderFrame(baseFrame, scene, atlas, cameraForGridPose(2, 2, 1, 0));
  renderFrame(shiftedFrame, scene, atlas, cameraForGridPose(2, 3, 1, 0));

  assertNotEquals(pixel(baseFrame, CENTER, 3), pixel(shiftedFrame, CENTER, 3));
  assertEquals(pixel(baseFrame, CENTER, VIEW - 4), pixel(shiftedFrame, CENTER, VIEW - 4));
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
    spriteLightmaps: [],
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
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", DOOR, 1));
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

Deno.test("renderFrame uses the jamb texture for flanking jamb faces", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addThinWall(scene, 2, 1, DOOR, THIN_AXIS_X);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertEquals(pixel(frame, 0, CENTER), texel(atlas, "walls", JAMB, 1));
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
  const grateTexel = atlas.walls[GRATE]!.mips[0]!.bands[1]![0]!;
  assertEquals(pixel(frame, CENTER - (CENTER >> 2), CENTER), grateTexel);
});

Deno.test("renderFrame blends mid-alpha thin walls over the wall behind", () => {
  const glass = bakeTexture(
    { width: 1, height: 1, data: new Uint8ClampedArray([0, 0, 255, 128]) },
    { transpose: true },
  );
  const atlas = testAtlas();
  atlas.walls[GRATE] = glass;
  const scene = corridorScene();
  addThinWall(scene, 2, 1, GRATE, THIN_AXIS_X);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertAlmostEquals(frame.zbuffer[CENTER]!, 2.5, 1e-9);
  assert(!glass.opaque);
  const behind = texel(atlas, "walls", WALL, 2);
  const glassTexel = glass.mips[0]!.bands[1]![0]!;
  assertEquals(pixel(frame, CENTER, CENTER), blendOver(glassTexel, behind));
});

function blendOver(src: number, dst: number): number {
  const alpha = src >>> 24;
  const inv = 255 - alpha;
  return (0xff000000 |
    ((((src & 0xff) * alpha + (dst & 0xff) * inv) / 255) | 0) |
    ((((((src >>> 8) & 0xff) * alpha + ((dst >>> 8) & 0xff) * inv) / 255) | 0) << 8) |
    ((((((src >>> 16) & 0xff) * alpha + ((dst >>> 16) & 0xff) * inv) / 255) | 0) << 16)) >>> 0;
}

Deno.test("renderFrame draws sprites in front of walls and occludes behind doors", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSprite(scene, 2.5, 1.5, SPRITE, 1);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "sprites", SPRITE, 1));

  // A closed door in front of the sprite occludes it via the depth buffer.
  clearSceneDynamic(scene);
  addThinWall(scene, 2, 1, DOOR, THIN_AXIS_X);
  addSprite(scene, 3.5, 1.5, SPRITE, 1);
  renderFrame(frame, scene, atlas, CAMERA);
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", DOOR, 1));
});

Deno.test("renderFrame punches through soft mid-alpha sprite fringes", () => {
  const soft = bakeTexture(
    { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 255, 100]) },
    { transpose: true },
  );
  const atlas = {
    ...testAtlas(),
    sprites: [soft],
  };
  const scene = corridorScene();
  addSprite(scene, 2.5, 1.5, SPRITE, 1);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  // Below the sprite punch-through cutoff, the far wall must show through.
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", WALL, 2));
});

Deno.test("renderFrame boosts sprite lightmap pixels under tile lighting", () => {
  const atlas = {
    ...testAtlas(),
    spriteLightmaps: [bakeSolidTexture(255, 255, 255)],
  };
  const scene = corridorScene();
  const spriteCell = 1 * 5 + 2;
  scene.lightRed[spriteCell] = 64;
  scene.lightGreen[spriteCell] = 64;
  scene.lightBlue[spriteCell] = 64;
  addSprite(scene, 2.5, 1.5, SPRITE, 1);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertEquals(pixel(frame, CENTER, CENTER), 0xff00ffff);
});

Deno.test("renderFrame preserves non-square sprite billboard dimensions", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSprite(scene, 2.5, 1.5, SPRITE, 1, 0, 0.5);
  const frame = createFrame(VIEW, VIEW);

  renderFrame(frame, scene, atlas, CAMERA);

  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "sprites", SPRITE, 1));
  assertNotEquals(pixel(frame, CENTER - 13, CENTER), texel(atlas, "sprites", SPRITE, 1));
});

Deno.test("renderFrame clips a scaled sprite beyond its ceiling-clip distance", () => {
  const atlas = testAtlas();
  const emptyFrame = createFrame(VIEW, VIEW);
  renderFrame(emptyFrame, corridorScene(13), atlas, CAMERA);

  for (const [spriteX, ceilingY, clipped] of [[9.5, 20, false], [10.5, 20, true]] as const) {
    const scene = corridorScene(13);
    addSprite(scene, spriteX, 1.5, SPRITE, 5, 0, 5, 0, 0, 8);
    const frame = createFrame(VIEW, VIEW);

    renderFrame(frame, scene, atlas, CAMERA);

    if (clipped) {
      assertEquals(pixel(frame, CENTER, ceilingY), pixel(emptyFrame, CENTER, ceilingY));
    } else {
      assertNotEquals(pixel(frame, CENTER, ceilingY), pixel(emptyFrame, CENTER, ceilingY));
    }
  }
});

Deno.test("renderFrame draws compact health bars above sprites with health", () => {
  const atlas = testAtlas();
  const scene = corridorScene();
  addSprite(scene, 2.5, 1.5, SPRITE, 1, 0, 1, 5, 10);
  const frame = createFrame(VIEW, VIEW);

  // Sprite is 1 tile ahead; pistol range (4) covers it.
  renderFrame(frame, scene, atlas, CAMERA, 0, 4);

  assertEquals(rgba(pixel(frame, CENTER - 8, 4)), [34, 197, 94, 255]);
  assertEquals(rgba(pixel(frame, CENTER + 8, 4)), [127, 29, 29, 255]);
});

Deno.test("renderFrame omits health bars for sprites beyond the weapon range", () => {
  const atlas = testAtlas();
  const withHealth = corridorScene();
  const withoutHealth = corridorScene();
  // Camera at (1.5, 1.5); sprite at (3.5, 1.5) is 2 tiles away — outside melee range (1).
  addSprite(withHealth, 3.5, 1.5, SPRITE, 1, 0, 1, 5, 10);
  addSprite(withoutHealth, 3.5, 1.5, SPRITE, 1, 0, 1);
  const healthFrame = createFrame(VIEW, VIEW);
  const plainFrame = createFrame(VIEW, VIEW);

  renderFrame(healthFrame, withHealth, atlas, CAMERA, 0, 1);
  renderFrame(plainFrame, withoutHealth, atlas, CAMERA, 0, 1);

  assertEquals(healthFrame.pixels, plainFrame.pixels);
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
  assertEquals(pixel(frame, CENTER, CENTER), texel(atlas, "walls", DOOR, 1));
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
  assertEquals(pixel(frame, CENTER, CENTER - (CENTER >> 2)), texel(atlas, "walls", DOOR, 1));
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
  assertEquals(scene.spriteElevation[128], 0);
});

Deno.test("addSprite stores sprite elevation for vertical billboard offsets", () => {
  const scene = createScene(1, 1);

  addSprite(scene, 0.5, 0.5, SPRITE, 1, 0.05);

  assertAlmostEquals(scene.spriteElevation[0]!, 0.05, 1e-6);
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

function stripeSource(): TexelSource {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const band = (x >> 2) & 3;
      const index = (y * TEX_SIZE + x) * 4;
      data[index] = band === 0 ? 240 : band === 1 ? 32 : band === 2 ? 96 : 12;
      data[index + 1] = y;
      data[index + 2] = band === 0 ? 24 : band === 1 ? 176 : band === 2 ? 240 : 64;
      data[index + 3] = 255;
    }
  }
  return { width: TEX_SIZE, height: TEX_SIZE, data };
}

function verticalSource(): TexelSource {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const index = (y * TEX_SIZE + x) * 4;
      data[index] = y;
      data[index + 1] = 255 - y;
      data[index + 2] = (y * 3) & 0xff;
      data[index + 3] = 255;
    }
  }
  return { width: TEX_SIZE, height: TEX_SIZE, data };
}

function columnSource(): TexelSource {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const index = (y * TEX_SIZE + x) * 4;
      data[index] = x;
      data[index + 1] = (x * 3) & 0xff;
      data[index + 2] = 255 - x;
      data[index + 3] = 255;
    }
  }
  return { width: TEX_SIZE, height: TEX_SIZE, data };
}

function transparentSource(): TexelSource {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const index = (y * TEX_SIZE + x) * 4;
      data[index] = 255;
      data[index + 1] = 32;
      data[index + 2] = 16;
    }
  }
  return {
    width: TEX_SIZE,
    height: TEX_SIZE,
    data,
  };
}
