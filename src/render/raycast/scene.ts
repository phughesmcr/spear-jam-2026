/**
 * Software raycast renderer core.
 *
 * Renders a grid scene (textured walls, floors, ceilings, thin walls such as
 * doors or grates, and billboard sprites) into a packed-RGBA Uint32 pixel
 * buffer. Pure typed-array code with no DOM dependencies and no per-frame
 * allocation: every scratch buffer lives on {@link RaycastFrame} or
 * {@link RaycastScene} and is reused across frames.
 *
 * The scene and frame data model lives in `scene_data.ts`; this module wires
 * together the three render passes:
 *   1. `cast_planes.ts` - floor and ceiling by horizontal scanline (distance
 *      and shade constant per row; one world step per pixel textures both
 *      planes).
 *   2. `cast_walls.ts` - walls by DDA per column into a 1D depth buffer, with
 *      fixed-point texture stepping. Opaque thin walls terminate rays like
 *      solid walls; transparent thin-wall hits stack per column for pass 3.
 *   3. `cast_sprites.ts` - sprites back-to-front, merged per column with the
 *      stacked transparent stripes so grates and see-through faces composite
 *      correctly.
 */

import { renderPlanes } from "@/src/render/raycast/cast_planes.ts";
import { renderWalls } from "@/src/render/raycast/cast_walls.ts";
import { renderSpritesAndThinWalls } from "@/src/render/raycast/cast_sprites.ts";
import {
  assertFrameCapacity,
  PROJECTION_PLANE_LENGTH,
  type RaycastAtlas,
  type RaycastCamera,
  type RaycastFrame,
  type RaycastScene,
} from "@/src/render/raycast/scene_data.ts";

export {
  addSlidingSolidWall,
  addSprite,
  addThinWall,
  CAMERA_PLANE_LENGTH,
  cameraForAngle,
  cameraForGridPose,
  clearSceneDynamic,
  createFrame,
  createScene,
  DEFAULT_SPRITE_CAPACITY,
  THIN_AXIS_X,
  THIN_AXIS_Y,
  THIN_SLIDE_DOWN,
  THIN_SLIDE_NEG,
  THIN_SLIDE_POS,
  THIN_SLIDE_UP,
} from "@/src/render/raycast/scene_data.ts";
export type {
  RaycastAtlas,
  RaycastCamera,
  RaycastFrame,
  RaycastScene,
  RaycastSceneOptions,
  ThinWallAxis,
  ThinWallSlide,
} from "@/src/render/raycast/scene_data.ts";

export function renderFrame(
  frame: RaycastFrame,
  scene: RaycastScene,
  atlas: RaycastAtlas,
  camera: RaycastCamera,
  nowMs = 0,
): void {
  assertFrameCapacity(frame, scene);
  frame.pixels.fill(0xff000000);
  const focal = (0.5 * frame.width) / PROJECTION_PLANE_LENGTH;
  renderPlanes(frame, scene, atlas, camera, focal, nowMs);
  renderWalls(frame, scene, atlas, camera, focal);
  renderSpritesAndThinWalls(frame, scene, atlas, camera, focal);
}
