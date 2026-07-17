export {
  addSlidingSolidWall,
  addSprite,
  addThinWall,
  cameraForAngle,
  clearSceneDynamic,
  createScene,
  THIN_AXIS_X,
  THIN_AXIS_Y,
  THIN_SLIDE_DOWN,
  THIN_SLIDE_NEG,
  THIN_SLIDE_POS,
  THIN_SLIDE_UP,
  writeCameraForAngle,
} from "@/src/engine/raycast/scene.ts";
export type { RaycastAtlas, RaycastScene, ThinWallAxis, ThinWallSlide } from "@/src/engine/raycast/scene.ts";
export { createRaycastView } from "@/src/engine/raycast/view.ts";
export type { ViewRect } from "@/src/engine/raycast/view.ts";
export { createImageTextureBaker } from "@/src/engine/raycast/image_texture_baker.ts";
export type {
  ContentCrop,
  ImageCropPolicy,
  ImageTextureBaker,
  SourceFrame,
} from "@/src/engine/raycast/image_texture_baker.ts";
export { bakeSolidTexture, bakeTexture, shadeTexel, TEX_SIZE } from "@/src/engine/raycast/textures.ts";
export type { BakedTexture, TexelSource } from "@/src/engine/raycast/textures.ts";
