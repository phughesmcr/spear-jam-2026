/**
 * First-person view adapter.
 *
 * Bridges the game session to the raycast renderer: bakes PNG assets into
 * TEX_SIZE texel bands (with procedural fallbacks while images load), builds the
 * static terrain arrays once per map, and rebuilds the cheap dynamic scene
 * (doors as thin walls, drawables as billboard sprites) each frame.
 *
 * Enemy sprite sheets are 4x4 grids (rows: idle, walk, attack, death;
 * columns: front, facing-left, back, facing-right). The idle row is baked
 * into four directional sprites and the drawn one is picked from the enemy's
 * facing relative to the camera, Wolf3D style.
 */

import { DrawableKind, spriteAppearance, SpriteId } from "@/src/ecs/drawables.ts";
import type {
  DrawableEntity,
  DrawableEntityVisitor,
  LightEntityVisitor,
  SpriteAppearance,
} from "@/src/ecs/drawables.ts";
import { SpriteAnimationKind } from "@/src/ecs/components.ts";
import type { SpriteAnimationSchema, SpriteId as SpriteIdType } from "@/src/ecs/components.ts";
import { type CardinalDirection, directionDelta, normalizeDirection } from "@/src/grid/direction.ts";
import type { TargetMarkerTone } from "@/src/game/target_marker.ts";
import {
  BarrierTexture,
  KeyColor,
  mapDimensions,
  SKY_CEILING_TEXTURE,
  terrainAt,
  terrainBlocksMovement,
  terrainIsBarrier,
  TexturePack,
} from "@/src/map/map.ts";
import type {
  BarrierTexture as BarrierTextureType,
  CeilingTexture,
  DoorSlide,
  FloorTexture,
  GameMap,
  TexturePackRef,
  WallTexture,
} from "@/src/map/map.ts";
import { createImageAsset, loadedImage, preloadImageAssets } from "@/src/render/assets.ts";
import type { ImageAsset } from "@/src/render/assets.ts";
import {
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
} from "@/src/render/raycast/scene.ts";
import type { RaycastAtlas, RaycastScene, ThinWallAxis, ThinWallSlide } from "@/src/render/raycast/scene.ts";
import { bakeSolidTexture, bakeTexture, TEX_SIZE } from "@/src/render/raycast/textures.ts";
import type { BakedTexture, TexelSource } from "@/src/render/raycast/textures.ts";
import {
  createNudgeTween,
  createPoseTween,
  createScalarTween,
  createSpriteTween,
  headBobFraction,
  retargetPoseTween,
  retargetScalarTween,
  retargetSpriteTween,
  sampleNudgeTween,
  samplePoseTween,
  sampleScalarTween,
  sampleSpriteTween,
  snapPoseTween,
  startNudgeTween,
} from "@/src/render/raycast/tween.ts";
import type {
  NudgeSample,
  PoseSample,
  ScalarSample,
  ScalarTween,
  SpritePoint,
  SpriteTween,
} from "@/src/render/raycast/tween.ts";
import { createRaycastView } from "@/src/render/raycast/view.ts";
import type { ViewRect } from "@/src/render/raycast/view.ts";

type AtlasLayer = "walls" | "planes" | "sprites" | "spriteLightmaps";

/** Region of the source image to bake, normalised 0-1: [x, y, w, h]. */
type SourceFrame = readonly [number, number, number, number];

type BakeTarget = {
  readonly layer: AtlasLayer;
  readonly slot: number;
  readonly tint?: readonly [number, number, number];
  readonly frame?: SourceFrame;
  baked: boolean;
};

type BakeTargetInput = {
  readonly layer: AtlasLayer;
  readonly slot: number;
  readonly tint?: readonly [number, number, number];
  readonly frame?: SourceFrame;
};

type ManagedAsset = {
  readonly asset: ImageAsset;
  readonly targets: BakeTarget[];
  /**
   * Frame to measure a shared content crop from. Sheet cells must all share
   * one crop or sprites would pulse in size when animation frames switch.
   */
  readonly cropFrame?: SourceFrame;
};

type TexturePackAsset = ManagedAsset & {
  readonly columns: number;
  readonly rows: number;
};

const TEXTURE_PACK_COLUMNS = 5;
const TEXTURE_PACK_ROWS = 4;

const WALL_TEX = 0;
const DOOR_TEX = 1;
const DOOR_TEX_BY_COLOR: Readonly<Record<KeyColor, number>> = {
  [KeyColor.Red]: 2,
  [KeyColor.Blue]: 3,
  [KeyColor.Yellow]: 4,
};
const BARRIER_TEX_BY_TEXTURE: Readonly<Record<BarrierTextureType, number>> = {
  [BarrierTexture.Bars]: 5,
  [BarrierTexture.Glass]: 6,
};
const FIRST_PACK_WALL_TEX = 7;

const FLOOR_TEX = 0;
const CEILING_TEX = 1;
const SKY_TEX = 2;
const SKY_FAR_TEX = 3;
const FIRST_PACK_PLANE_TEX = 4;

/** Enemy sheets are 4x4: rows idle/walk/attack/death, columns per view. */
const SHEET_COLUMNS = 4;
const SHEET_SLOTS = 16;
const ROW_IDLE = 0;
const ROW_WALK = 1;
const ROW_ATTACK = 2;
const ROW_DEATH = 3;
/** Relative facing (entity dir - camera dir) to enemy sheet column. */
const REL_DIR_TO_SHEET_COLUMN: readonly [number, number, number, number] = [2, 3, 0, 1];

const ITEM_BOB_PERIOD_MS = 1_200;
const ITEM_BOB_BASE_ELEVATION = 0.03;
const ITEM_BOB_ELEVATION_AMPLITUDE = 0.025;
const TARGET_SIZE_FRACTION = 0.055;
const TARGET_INNER_FRACTION = 0.38;
const TARGET_Y_FRACTION = 0.47;
const TARGET_COLORS: Readonly<Record<TargetMarkerTone, string>> = {
  danger: "rgba(248, 113, 113, 0.92)",
  locked: "rgba(250, 204, 21, 0.9)",
  loot: "rgba(125, 211, 252, 0.9)",
  use: "rgba(52, 211, 153, 0.9)",
};

const LIGHT_AMBIENT = 96;
const DEFAULT_FLICKER_SPEED = 8;

/** Tints are relative to mid-grey so the wall texture keeps its detail. */
const DOOR_TINT: readonly [number, number, number] = [1.2, 0.83, 0.45];
const DOOR_TINTS_BY_COLOR: Readonly<Record<KeyColor, readonly [number, number, number]>> = {
  [KeyColor.Red]: [1.55, 0.55, 0.5],
  [KeyColor.Blue]: [0.6, 1.05, 1.85],
  [KeyColor.Yellow]: [1.7, 1.5, 0.65],
};

function firstPersonSlot(spriteId: SpriteIdType): number {
  const slot = spriteAppearance(spriteId).firstPersonSlot;
  if (slot === undefined) throw new Error(`Sprite ${spriteId} has no first-person slot.`);
  return slot;
}

function managedAsset(src: string, targets: readonly BakeTargetInput[], cropFrame?: SourceFrame): ManagedAsset {
  return {
    asset: createImageAsset(src),
    targets: targets.map((target) => ({ ...target, baked: false })),
    ...(cropFrame === undefined ? {} : { cropFrame }),
  };
}

function texturePackAsset(src: string): TexturePackAsset {
  return { ...managedAsset(src, []), columns: TEXTURE_PACK_COLUMNS, rows: TEXTURE_PACK_ROWS };
}

function addBakeTarget(entry: ManagedAsset, target: BakeTargetInput): void {
  entry.targets.push({ ...target, baked: false });
}

/** All sixteen cells of a 4x4 enemy sheet; slot = base + row * 4 + column. */
function enemySheetTargets(
  baseSlot: number,
  layer: "sprites" | "spriteLightmaps" = "sprites",
): readonly BakeTargetInput[] {
  const targets: BakeTargetInput[] = [];
  for (let row = 0; row < SHEET_COLUMNS; row++) {
    for (let column = 0; column < SHEET_COLUMNS; column++) {
      targets.push({
        layer,
        slot: baseSlot + row * SHEET_COLUMNS + column,
        frame: [column / 4, row / 4, 1 / 4, 1 / 4],
      });
    }
  }
  return targets;
}

/** Enemy sheets share the idle-front cell's content crop across all frames. */
const ENEMY_CROP_FRAME: SourceFrame = [0, 0, 1 / 4, 1 / 4];

type AssetCatalog = {
  readonly managedAssets: readonly ManagedAsset[];
  readonly texturePackAssets: Readonly<Record<TexturePack, TexturePackAsset>>;
};

type TerrainBarrier = {
  readonly x: number;
  readonly y: number;
  readonly texture: number;
  readonly axis: ThinWallAxis;
};

function createAssetCatalog(): AssetCatalog {
  const texturePackAssets: Readonly<Record<TexturePack, TexturePackAsset>> = {
    [TexturePack.Pack1]: texturePackAsset(new URL("../../assets/game/textures/pack1.png", import.meta.url).href),
    [TexturePack.Pack2]: texturePackAsset(new URL("../../assets/game/textures/pack2.png", import.meta.url).href),
    [TexturePack.Pack3]: texturePackAsset(new URL("../../assets/game/textures/pack3.png", import.meta.url).href),
  };

  // Asset URLs must be fully static `new URL` literals so Vite can resolve them.
  const managedAssets: readonly ManagedAsset[] = [
    managedAsset(new URL("../../assets/game/textures/wall.png", import.meta.url).href, [
      { layer: "walls", slot: WALL_TEX },
      { layer: "walls", slot: DOOR_TEX, tint: DOOR_TINT },
      { layer: "walls", slot: DOOR_TEX_BY_COLOR[KeyColor.Red], tint: DOOR_TINTS_BY_COLOR[KeyColor.Red] },
      { layer: "walls", slot: DOOR_TEX_BY_COLOR[KeyColor.Blue], tint: DOOR_TINTS_BY_COLOR[KeyColor.Blue] },
      { layer: "walls", slot: DOOR_TEX_BY_COLOR[KeyColor.Yellow], tint: DOOR_TINTS_BY_COLOR[KeyColor.Yellow] },
    ]),
    managedAsset(new URL("../../assets/game/textures/floor.png", import.meta.url).href, [
      { layer: "planes", slot: FLOOR_TEX },
    ]),
    managedAsset(new URL("../../assets/game/textures/ceiling.png", import.meta.url).href, [
      { layer: "planes", slot: CEILING_TEX },
    ]),
    managedAsset(new URL("../../assets/game/textures/sky.png", import.meta.url).href, [
      { layer: "planes", slot: SKY_TEX, frame: [0, 0, 0.5, 1] },
      { layer: "planes", slot: SKY_FAR_TEX, frame: [0.5, 0, 0.5, 1] },
    ]),
    managedAsset(new URL("../../assets/game/textures/bars.png", import.meta.url).href, [
      { layer: "walls", slot: BARRIER_TEX_BY_TEXTURE[BarrierTexture.Bars] },
    ]),
    managedAsset(new URL("../../assets/game/textures/glass.png", import.meta.url).href, [
      { layer: "walls", slot: BARRIER_TEX_BY_TEXTURE[BarrierTexture.Glass] },
    ]),
    managedAsset(
      new URL("../../assets/game/sprites/digital_dog.png", import.meta.url).href,
      enemySheetTargets(firstPersonSlot(SpriteId.DigitalDog)),
      ENEMY_CROP_FRAME,
    ),
    managedAsset(
      new URL("../../assets/game/sprites/digital_dog_lightmap.png", import.meta.url).href,
      enemySheetTargets(firstPersonSlot(SpriteId.DigitalDog), "spriteLightmaps"),
    ),
    managedAsset(
      new URL("../../assets/game/sprites/gigabit_gun_slinger.png", import.meta.url).href,
      enemySheetTargets(firstPersonSlot(SpriteId.GigabitGunslinger)),
      ENEMY_CROP_FRAME,
    ),
    managedAsset(
      new URL("../../assets/game/sprites/gigabit_gun_slinger_lightmap.png", import.meta.url).href,
      enemySheetTargets(firstPersonSlot(SpriteId.GigabitGunslinger), "spriteLightmaps"),
    ),
    managedAsset(
      new URL("../../assets/game/sprites/network_neophyte.png", import.meta.url).href,
      enemySheetTargets(firstPersonSlot(SpriteId.NetworkNeophyte)),
      ENEMY_CROP_FRAME,
    ),
    managedAsset(
      new URL("../../assets/game/sprites/network_neophyte_lightmap.png", import.meta.url).href,
      enemySheetTargets(firstPersonSlot(SpriteId.NetworkNeophyte), "spriteLightmaps"),
    ),
    managedAsset(
      new URL("../../assets/game/sprites/system_sentinel.png", import.meta.url).href,
      enemySheetTargets(firstPersonSlot(SpriteId.SystemSentinel)),
      ENEMY_CROP_FRAME,
    ),
    managedAsset(
      new URL("../../assets/game/sprites/system_sentinel_lightmap.png", import.meta.url).href,
      enemySheetTargets(firstPersonSlot(SpriteId.SystemSentinel), "spriteLightmaps"),
    ),
    managedAsset(
      new URL("../../assets/game/sprites/agentic_acolyte.png", import.meta.url).href,
      enemySheetTargets(firstPersonSlot(SpriteId.AgenticAcolyte)),
      ENEMY_CROP_FRAME,
    ),
    managedAsset(
      new URL("../../assets/game/sprites/agentic_acolyte_lightmap.png", import.meta.url).href,
      enemySheetTargets(firstPersonSlot(SpriteId.AgenticAcolyte), "spriteLightmaps"),
    ),
    managedAsset(new URL("../../assets/game/sprites/corpse.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.Corpse) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/uplink_terminal.png", import.meta.url).href, [
      // Left half of the sheet is the inactive terminal, right half is active.
      { layer: "sprites", slot: firstPersonSlot(SpriteId.UplinkTerminal), frame: [0.5, 0, 0.5, 1] },
    ]),
    managedAsset(new URL("../../assets/game/sprites/health.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.HealthPatch) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/pistol_ammo.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.PistolAmmo) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/cannon_ammo.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.CannonAmmo) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/red_key.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.RedKey) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/blue_key.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.BlueKey) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/yellow_key.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.YellowKey) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/weapon_2.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.Weapon2) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/weapon_3.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.Weapon3) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/john.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.John) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/uplink_code.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.UplinkCode) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/decor_server_pile.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.DecorServerPile) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/decor_cyborg.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.DecorCyborg) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/decor_ceiling_hook.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.DecorCeilingHook) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/decor_ceiling_light.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.DecorCeilingLight) },
    ]),
    managedAsset(new URL("../../assets/game/sprites/decor_ceiling_wires.png", import.meta.url).href, [
      { layer: "sprites", slot: firstPersonSlot(SpriteId.DecorCeilingWires) },
    ]),
    texturePackAssets[TexturePack.Pack1],
    texturePackAssets[TexturePack.Pack2],
    texturePackAssets[TexturePack.Pack3],
  ];

  return { managedAssets, texturePackAssets };
}

function buildAtlas(): RaycastAtlas {
  const walls: BakedTexture[] = [];
  walls[WALL_TEX] = bakeSolidTexture(90, 95, 104);
  walls[DOOR_TEX] = bakeSolidTexture(154, 106, 58);
  walls[DOOR_TEX_BY_COLOR[KeyColor.Red]] = bakeSolidTexture(177, 75, 75);
  walls[DOOR_TEX_BY_COLOR[KeyColor.Blue]] = bakeSolidTexture(79, 141, 247);
  walls[DOOR_TEX_BY_COLOR[KeyColor.Yellow]] = bakeSolidTexture(244, 211, 94);
  walls[BARRIER_TEX_BY_TEXTURE[BarrierTexture.Bars]] = bakeBarrier(BarrierTexture.Bars);
  walls[BARRIER_TEX_BY_TEXTURE[BarrierTexture.Glass]] = bakeBarrier(BarrierTexture.Glass);

  const planes: BakedTexture[] = [];
  planes[FLOOR_TEX] = bakeSolidTexture(35, 40, 50);
  planes[CEILING_TEX] = bakeSolidTexture(16, 18, 23);
  planes[SKY_TEX] = bakeSky();
  planes[SKY_FAR_TEX] = bakeSkyFar();

  const sprites: BakedTexture[] = [];
  const spriteLightmaps: BakedTexture[] = [];
  fillEnemyFallback(sprites, firstPersonSlot(SpriteId.DigitalDog), "#ef4444");
  fillEnemyFallback(sprites, firstPersonSlot(SpriteId.GigabitGunslinger), "#38bdf8");
  fillEnemyFallback(sprites, firstPersonSlot(SpriteId.NetworkNeophyte), "#34d399");
  fillEnemyFallback(sprites, firstPersonSlot(SpriteId.SystemSentinel), "#f59e0b");
  fillEnemyFallback(sprites, firstPersonSlot(SpriteId.AgenticAcolyte), "#a78bfa");
  sprites[firstPersonSlot(SpriteId.UplinkTerminal)] = bakeOrb("#22c55e");
  sprites[firstPersonSlot(SpriteId.HealthPatch)] = bakeOrb("#59d39b");
  sprites[firstPersonSlot(SpriteId.RedKey)] = bakeOrb("#df4f45");
  sprites[firstPersonSlot(SpriteId.BlueKey)] = bakeOrb("#4f8df7");
  sprites[firstPersonSlot(SpriteId.YellowKey)] = bakeOrb("#f4d35e");
  sprites[firstPersonSlot(SpriteId.Weapon2)] = bakeOrb("#c084fc");
  sprites[firstPersonSlot(SpriteId.Weapon3)] = bakeOrb("#c084fc");
  sprites[firstPersonSlot(SpriteId.Npc)] = bakeOrb("#59d39b");
  sprites[firstPersonSlot(SpriteId.John)] = bakeOrb("#59d39b");
  sprites[firstPersonSlot(SpriteId.UplinkCode)] = bakeOrb("#7dd3fc");
  sprites[firstPersonSlot(SpriteId.Corpse)] = bakeOrb("#4b5563");
  sprites[firstPersonSlot(SpriteId.PistolAmmo)] = bakeOrb("#38bdf8");
  sprites[firstPersonSlot(SpriteId.CannonAmmo)] = bakeOrb("#f97316");
  sprites[firstPersonSlot(SpriteId.DecorServerPile)] = bakeOrb("#64748b");
  sprites[firstPersonSlot(SpriteId.DecorCyborg)] = bakeOrb("#94a3b8");
  sprites[firstPersonSlot(SpriteId.DecorCeilingHook)] = bakeOrb("#9f7a5d");
  sprites[firstPersonSlot(SpriteId.DecorCeilingLight)] = bakeOrb("#facc15");
  sprites[firstPersonSlot(SpriteId.DecorCeilingWires)] = bakeOrb("#64748b");

  return { walls, planes, skyPlane: SKY_TEX, skyFarPlane: SKY_FAR_TEX, sprites, spriteLightmaps };
}

function fillEnemyFallback(sprites: BakedTexture[], baseSlot: number, color: string): void {
  const orb = bakeOrb(color);
  for (let slot = 0; slot < SHEET_SLOTS; slot++) {
    sprites[baseSlot + slot] = orb;
  }
}

/** Procedural billboard for entities without a dedicated sprite asset. */
function orbSource(red: number, green: number, blue: number): TexelSource {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  const center = TEX_SIZE / 2 - 0.5;
  const radius = TEX_SIZE * 0.32;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const distance = Math.hypot(x - center, y - (center + TEX_SIZE * 0.16));
      if (distance > radius) continue;
      const rim = distance > radius * 0.78 ? 0.55 : 1;
      const index = (y * TEX_SIZE + x) * 4;
      data[index] = red * rim;
      data[index + 1] = green * rim;
      data[index + 2] = blue * rim;
      data[index + 3] = 255;
    }
  }
  return { width: TEX_SIZE, height: TEX_SIZE, data };
}

function bakeOrb(hexColor: string): BakedTexture {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  return bakeTexture(orbSource(red, green, blue), { transpose: true });
}

function skySource(): TexelSource {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++) {
    const vertical = y / (TEX_SIZE - 1);
    for (let x = 0; x < TEX_SIZE; x++) {
      const index = (y * TEX_SIZE + x) * 4;
      const grid = x % 16 === 0 || (y > TEX_SIZE * 0.7 && y % 12 === 0);
      const star = ((x * 73 + y * 151) % 503 === 0) && y < TEX_SIZE * 0.62;
      data[index] = star ? 160 : grid ? 36 : 8 + vertical * 24;
      data[index + 1] = star ? 240 : grid ? 118 : 20 + vertical * 54;
      data[index + 2] = star ? 255 : grid ? 196 : 58 + vertical * 116;
      data[index + 3] = 255;
    }
  }
  return { width: TEX_SIZE, height: TEX_SIZE, data };
}

function bakeSky(): BakedTexture {
  return bakeTexture(skySource());
}

function bakeSkyFar(): BakedTexture {
  return bakeTexture(skyFarSource());
}

function skyFarSource(): TexelSource {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++) {
    const vertical = y / (TEX_SIZE - 1);
    for (let x = 0; x < TEX_SIZE; x++) {
      const index = (y * TEX_SIZE + x) * 4;
      const band = ((x + y * 2) >> 4) & 3;
      data[index] = band === 0 ? 44 : 10 + vertical * 44;
      data[index + 1] = band === 0 ? 36 : 14 + vertical * 44;
      data[index + 2] = band === 0 ? 78 : 48 + vertical * 86;
      data[index + 3] = 255;
    }
  }
  return { width: TEX_SIZE, height: TEX_SIZE, data };
}

function bakeBarrier(texture: BarrierTextureType): BakedTexture {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      if (!barrierPixelOpaque(texture, x, y)) continue;
      const index = (y * TEX_SIZE + x) * 4;
      if (texture === BarrierTexture.Bars) {
        data[index] = 148;
        data[index + 1] = 163;
        data[index + 2] = 184;
      } else {
        data[index] = 125;
        data[index + 1] = 211;
        data[index + 2] = 252;
      }
      data[index + 3] = 255;
    }
  }
  return bakeTexture({ width: TEX_SIZE, height: TEX_SIZE, data }, { transpose: true });
}

function barrierPixelOpaque(texture: BarrierTextureType, x: number, y: number): boolean {
  if (texture === BarrierTexture.Bars) {
    return x < 7 || x > TEX_SIZE - 8 || y < 7 || y > TEX_SIZE - 8 || x % 24 < 7;
  }
  return x < 4 || x > TEX_SIZE - 5 || y < 4 || y > TEX_SIZE - 5 || x === y || x + y === TEX_SIZE - 1 ||
    (x > 76 && x < 84 && y > 16 && y < 112);
}

function sceneHasSkyCeiling(scene: RaycastScene, atlas: RaycastAtlas): boolean {
  if (atlas.skyPlane === undefined) return false;
  const skyId = atlas.skyPlane + 1;
  for (let index = 0; index < scene.ceilings.length; index++) {
    if (scene.ceilings[index] === skyId) return true;
  }
  return false;
}

export interface FirstPersonRenderSession {
  readonly map: GameMap;
  forEachDrawable(visit: DrawableEntityVisitor): void;
  forEachLight(visit: LightEntityVisitor): void;
}

export interface FirstPersonRenderer {
  preloadAssets(document: Document, onAssetLoad?: () => void): Promise<void>;
  sceneForMap(map: GameMap): RaycastScene;
  reset(): void;
  bump(dirX: number, dirY: number): void;
  render(
    ctx: CanvasRenderingContext2D,
    rect: ViewRect,
    session: FirstPersonRenderSession,
    targetTone?: TargetMarkerTone,
    repaint?: () => void,
  ): void;
}

function createFirstPersonRendererState() {
  return {
    atlas: buildAtlas(),
    view: createRaycastView(),
    assetCatalog: createAssetCatalog(),
    sceneByMap: new WeakMap<GameMap, RaycastScene>(),
    terrainBarriersByScene: new WeakMap<RaycastScene, readonly TerrainBarrier[]>(),
    packWallSlots: new Map<TexturePackRef, number>(),
    packPlaneSlots: new Map<TexturePackRef, number>(),
    spriteCropBySlot: new Map<number, ContentCrop | undefined>(),
    spriteCropReady: new Set<number>(),
    spriteAspectBySlot: new Map<number, number>(),
    drawableScratch: [] as DrawableEntity[],
    rasterCanvas: undefined as OffscreenCanvas | undefined,
    poseTween: createPoseTween(),
    poseSample: { x: 0, y: 0, angle: 0, progress: 1, moving: false, settled: true } satisfies PoseSample,
    nudgeTween: createNudgeTween(),
    nudgeSample: { dx: 0, dy: 0, settled: true } satisfies NudgeSample,
    spriteTweens: new Map<DrawableEntity["entity"], SpriteTween>(),
    spritePoint: { x: 0, y: 0, settled: true } satisfies SpritePoint,
    doorTweens: new Map<DrawableEntity["entity"], ScalarTween>(),
    doorSample: { value: 0, settled: true } satisfies ScalarSample,
    poseInitialized: false,
    repaintScheduled: false,
    lastRepaint: undefined as (() => void) | undefined,
  };
}

type FirstPersonRendererState = ReturnType<typeof createFirstPersonRendererState>;

class OwnedFirstPersonRenderer implements FirstPersonRenderer {
  private readonly state = createFirstPersonRendererState();

  preloadAssets(document: Document, onAssetLoad?: () => void): Promise<void> {
    return preloadImageAssets(
      document,
      this.state.assetCatalog.managedAssets.map((entry) => entry.asset),
      onAssetLoad,
    );
  }

  sceneForMap(map: GameMap): RaycastScene {
    return sceneForMapForState(this.state, map);
  }

  reset(): void {
    resetFirstPersonRendererState(this.state);
  }

  bump(dirX: number, dirY: number): void {
    bumpFirstPersonRenderer(this.state, dirX, dirY);
  }

  render(
    ctx: CanvasRenderingContext2D,
    rect: ViewRect,
    session: FirstPersonRenderSession,
    targetTone?: TargetMarkerTone,
    repaint?: () => void,
  ): void {
    renderFirstPersonView(this.state, ctx, rect, session, targetTone, repaint);
  }
}

export function createFirstPersonRenderer(): FirstPersonRenderer {
  return new OwnedFirstPersonRenderer();
}

function resetFirstPersonRendererState(state: FirstPersonRendererState): void {
  state.sceneByMap = new WeakMap<GameMap, RaycastScene>();
  state.terrainBarriersByScene = new WeakMap<RaycastScene, readonly TerrainBarrier[]>();
  state.drawableScratch.length = 0;
  state.poseInitialized = false;
  state.nudgeTween.active = false;
  state.spriteTweens.clear();
  state.doorTweens.clear();
  state.repaintScheduled = false;
  state.lastRepaint = undefined;
}

/** One repaint per animation frame while the camera tween is unsettled. */
function scheduleRepaint(state: FirstPersonRendererState, repaint: () => void): void {
  if (state.repaintScheduled || typeof requestAnimationFrame !== "function") return;
  state.repaintScheduled = true;
  requestAnimationFrame((): void => {
    state.repaintScheduled = false;
    repaint();
  });
}

/**
 * Play a short recoil lunge toward (dirX, dirY) — the presentation for a
 * move blocked by a wall or entity, which changes no game state. Repaints
 * with the last callback given to the renderer.
 */
function bumpFirstPersonRenderer(state: FirstPersonRendererState, dirX: number, dirY: number): void {
  startNudgeTween(state.nudgeTween, dirX, dirY, performance.now());
  if (state.lastRepaint !== undefined) scheduleRepaint(state, state.lastRepaint);
}

type OpaqueBounds = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

function opaqueBounds(pixels: TexelSource): OpaqueBounds | undefined {
  let left = TEX_SIZE;
  let top = TEX_SIZE;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      if (pixels.data[(y * TEX_SIZE + x) * 4 + 3]! < 128) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < 0) return undefined;
  return { left, top, right, bottom };
}

/** Content crop within a frame, in TEX_SIZE-ths of the frame's span. */
type ContentCrop = {
  readonly left: number;
  readonly top: number;
  readonly size: number;
};

/**
 * Draw (a frame of) the image at TEX_SIZE square, optionally zoomed to a crop within
 * the frame, and hand back its pixels for baking.
 */
function rasterize(
  state: FirstPersonRendererState,
  image: HTMLImageElement,
  frame: SourceFrame | undefined,
  crop: ContentCrop | undefined,
): TexelSource | undefined {
  state.rasterCanvas ??= new OffscreenCanvas(TEX_SIZE, TEX_SIZE);
  const context = state.rasterCanvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return undefined;

  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  let sourceX = (frame?.[0] ?? 0) * imageWidth;
  let sourceY = (frame?.[1] ?? 0) * imageHeight;
  let sourceWidth = (frame?.[2] ?? 1) * imageWidth;
  let sourceHeight = (frame?.[3] ?? 1) * imageHeight;
  if (crop !== undefined) {
    sourceX += (crop.left / TEX_SIZE) * sourceWidth;
    sourceY += (crop.top / TEX_SIZE) * sourceHeight;
    sourceWidth *= crop.size / TEX_SIZE;
    sourceHeight *= crop.size / TEX_SIZE;
  }

  context.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
  context.imageSmoothingEnabled = true;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, TEX_SIZE, TEX_SIZE);
  return context.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
}

function sourceFrameAspect(image: HTMLImageElement, frame: SourceFrame | undefined): number {
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;
  const sourceWidth = (frame?.[2] ?? 1) * imageWidth;
  const sourceHeight = (frame?.[3] ?? 1) * imageHeight;
  if (sourceWidth <= 0 || sourceHeight <= 0) return 1;
  return sourceWidth / sourceHeight;
}

/**
 * Measure a frame's opaque bounding box, expanded to a square with margin
 * that keeps the content's feet at the bottom edge, so sprites fill their
 * billboard quad instead of floating in sheet padding.
 */
function measureContentCrop(
  state: FirstPersonRendererState,
  image: HTMLImageElement,
  frame: SourceFrame | undefined,
): ContentCrop | undefined {
  const pixels = rasterize(state, image, frame, undefined);
  if (pixels === undefined) return undefined;
  const bounds = opaqueBounds(pixels);
  if (bounds === undefined) return undefined;

  // Extra margin absorbs pose-to-pose size differences under a shared crop.
  const margin = Math.round(TEX_SIZE * 0.05);
  const size = Math.max(bounds.right - bounds.left, bounds.bottom - bounds.top) + 1 + margin * 2;
  let left = (bounds.left + bounds.right + 1) / 2 - size / 2;
  let top = bounds.bottom + 1 + margin - size;
  if (left < 0) left = 0;
  if (left + size > TEX_SIZE) left = TEX_SIZE - size;
  if (top < 0) top = 0;
  if (top + size > TEX_SIZE) top = TEX_SIZE - size;
  return { left, top, size };
}

function bakeLoadedAssets(
  state: FirstPersonRendererState,
  ctx: CanvasRenderingContext2D,
  onAssetLoad?: () => void,
): void {
  for (const entry of state.assetCatalog.managedAssets) {
    const image = loadedImage(ctx, entry.asset, onAssetLoad);
    if (image === undefined) continue;

    let sharedCrop: ContentCrop | undefined;
    let sharedCropMeasured = false;
    for (const target of entry.targets) {
      if (target.baked) continue;
      let crop: ContentCrop | undefined;
      if (target.layer === "spriteLightmaps") {
        if (!state.spriteCropReady.has(target.slot)) continue;
        crop = state.spriteCropBySlot.get(target.slot);
      } else if (target.layer === "sprites") {
        if (entry.cropFrame !== undefined) {
          if (!sharedCropMeasured) {
            sharedCrop = measureContentCrop(state, image, entry.cropFrame);
            sharedCropMeasured = true;
          }
          crop = sharedCrop;
        } else {
          crop = measureContentCrop(state, image, target.frame);
        }
      }
      const source = rasterize(state, image, target.frame, crop);
      if (source === undefined) continue;
      state.atlas[target.layer][target.slot] = bakeTexture(source, {
        transpose: target.layer !== "planes",
        ...(target.tint === undefined ? {} : { tint: target.tint }),
      });
      if (target.layer === "sprites") {
        state.spriteCropBySlot.set(target.slot, crop);
        state.spriteCropReady.add(target.slot);
        state.spriteAspectBySlot.set(target.slot, sourceFrameAspect(image, target.frame));
      }
      target.baked = true;
    }
  }
}

function isTexturePack(value: string): value is TexturePack {
  return value === TexturePack.Pack1 || value === TexturePack.Pack2 || value === TexturePack.Pack3;
}

function parseTexturePackRef(
  texture: TexturePackRef,
  texturePackAssets: Readonly<Record<TexturePack, TexturePackAsset>>,
): {
  readonly pack: TexturePack;
  readonly column: number;
  readonly row: number;
} {
  const packParts = texture.split(":");
  const packText = packParts[0];
  const cellText = packParts[1];
  if (packParts.length !== 2 || packText === undefined || cellText === undefined || !isTexturePack(packText)) {
    throw new Error(`Unknown texture pack ref: ${texture}`);
  }

  const cellParts = cellText.split(",");
  const columnText = cellParts[0];
  const rowText = cellParts[1];
  const column = Number(columnText);
  const row = Number(rowText);
  const entry = texturePackAssets[packText];
  if (
    cellParts.length !== 2 ||
    !Number.isInteger(column) ||
    !Number.isInteger(row) ||
    column < 0 ||
    row < 0 ||
    column >= entry.columns ||
    row >= entry.rows
  ) {
    throw new Error(`Texture pack ref "${texture}" must address a ${entry.columns}x${entry.rows} grid.`);
  }

  return { pack: packText, column, row };
}

function texturePackFrame(
  texture: TexturePackRef,
  entry: TexturePackAsset,
  texturePackAssets: Readonly<Record<TexturePack, TexturePackAsset>>,
): SourceFrame {
  const { column, row } = parseTexturePackRef(texture, texturePackAssets);
  return [column / entry.columns, row / entry.rows, 1 / entry.columns, 1 / entry.rows];
}

function texturePackSlot(
  state: FirstPersonRendererState,
  layer: "walls" | "planes",
  texture: TexturePackRef,
  fallback: BakedTexture,
): number {
  const slots = layer === "walls" ? state.packWallSlots : state.packPlaneSlots;
  const existing = slots.get(texture);
  if (existing !== undefined) return existing;

  const { pack } = parseTexturePackRef(texture, state.assetCatalog.texturePackAssets);
  const slot = (layer === "walls" ? FIRST_PACK_WALL_TEX : FIRST_PACK_PLANE_TEX) + slots.size;
  const entry = state.assetCatalog.texturePackAssets[pack];
  slots.set(texture, slot);
  state.atlas[layer][slot] = fallback;
  addBakeTarget(entry, { layer, slot, frame: texturePackFrame(texture, entry, state.assetCatalog.texturePackAssets) });
  return slot;
}

function wallTextureSlot(state: FirstPersonRendererState, texture: WallTexture | undefined): number {
  if (texture === undefined || texture === "wall") return WALL_TEX;
  return texturePackSlot(state, "walls", texture, state.atlas.walls[WALL_TEX]!);
}

function floorTextureSlot(state: FirstPersonRendererState, texture: FloorTexture): number {
  if (texture === "floor") return FLOOR_TEX;
  return texturePackSlot(state, "planes", texture, state.atlas.planes[FLOOR_TEX]!);
}

function ceilingTextureSlot(state: FirstPersonRendererState, texture: CeilingTexture): number {
  if (texture === "ceiling") return CEILING_TEX;
  if (texture === SKY_CEILING_TEXTURE) return SKY_TEX;
  return texturePackSlot(state, "planes", texture, state.atlas.planes[CEILING_TEX]!);
}

function barrierTextureSlot(texture: BarrierTextureType): number {
  return BARRIER_TEX_BY_TEXTURE[texture];
}

function sceneForMapForState(state: FirstPersonRendererState, map: GameMap): RaycastScene {
  const cached = state.sceneByMap.get(map);
  if (cached !== undefined) return cached;

  const { width, height } = mapDimensions(map);
  const scene = createScene(width, height, {
    spriteCapacity: raycastSpriteCapacity(map, width * height),
    thinCapacity: raycastThinCapacity(map, width * height),
  });
  const terrainBarriers: TerrainBarrier[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = y * width + x;
      const terrain = terrainAt(map, x, y);
      // Missing terrain blocks movement, so render it as wall to match.
      if (terrain === undefined) {
        scene.walls[cell] = wallTextureSlot(state, undefined) + 1;
        continue;
      }
      if (terrain.kind === "wall") {
        scene.walls[cell] = wallTextureSlot(state, terrain.wall_texture) + 1;
        continue;
      }
      scene.floors[cell] = floorTextureSlot(state, terrain.floor_texture) + 1;
      scene.ceilings[cell] = ceilingTextureSlot(state, terrain.ceiling_texture) + 1;
      if (terrainIsBarrier(terrain)) {
        terrainBarriers.push({
          x,
          y,
          texture: barrierTextureSlot(terrain.barrier_texture),
          axis: doorAxis(map, x, y),
        });
      }
    }
  }
  state.sceneByMap.set(map, scene);
  state.terrainBarriersByScene.set(scene, terrainBarriers);
  return scene;
}

function raycastSpriteCapacity(map: GameMap, cellCount: number): number {
  return Math.max(cellCount, map.entities.length);
}

function raycastThinCapacity(map: GameMap, cellCount: number): number {
  return cellCount + map.entities.filter((entity) => entity.prefab === "door").length;
}

function updateSceneLights(
  scene: RaycastScene,
  session: FirstPersonRenderSession,
  nowMs: number,
): boolean {
  let foundLight = false;
  let animating = false;
  session.forEachLight((light): void => {
    if (light.radius <= 0) return;
    if (!foundLight) {
      scene.lightRed.fill(LIGHT_AMBIENT);
      scene.lightGreen.fill(LIGHT_AMBIENT);
      scene.lightBlue.fill(LIGHT_AMBIENT);
      foundLight = true;
    }

    const flickerAmount = light.flickerAmount;
    const intensity = flickerAmount > 0 ?
      flickerIntensity(light.x, light.y, flickerAmount, light.flickerSpeed, nowMs) :
      1;
    animating ||= flickerAmount > 0;

    const minX = Math.max(0, light.x - light.radius);
    const maxX = Math.min(scene.mapWidth - 1, light.x + light.radius);
    const minY = Math.max(0, light.y - light.radius);
    const maxY = Math.min(scene.mapHeight - 1, light.y + light.radius);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const distance = Math.hypot(x - light.x, y - light.y);
        if (distance > light.radius) continue;

        const strength = (1 - distance / (light.radius + 1)) * intensity;
        const cell = y * scene.mapWidth + x;
        addLightChannel(scene.lightRed, cell, light.red * strength);
        addLightChannel(scene.lightGreen, cell, light.green * strength);
        addLightChannel(scene.lightBlue, cell, light.blue * strength);
      }
    }
  });

  return animating;
}

function flickerIntensity(
  x: number,
  y: number,
  amount: number,
  speed: number | undefined,
  nowMs: number,
): number {
  const seconds = nowMs / 1000;
  const phase = x * 12.9898 + y * 78.233;
  const cadence = speed === undefined || speed <= 0 ? DEFAULT_FLICKER_SPEED : speed;
  const wave = Math.sin(seconds * cadence + phase) * 0.6 +
    Math.sin(seconds * cadence * 2.7 + phase * 3.1) * 0.4;
  return 1 - amount * 0.5 + wave * amount * 0.5;
}

function addLightChannel(channel: Uint8Array, cell: number, amount: number): void {
  const next = channel[cell]! + amount;
  channel[cell] = next >= 255 ? 255 : next | 0;
}

function isBlocking(map: GameMap, x: number, y: number): boolean {
  return terrainBlocksMovement(terrainAt(map, x, y));
}

/** Doors span the gap between their flanking walls. */
function doorAxis(map: GameMap, x: number, y: number): ThinWallAxis {
  if (isBlocking(map, x - 1, y) && isBlocking(map, x + 1, y)) return THIN_AXIS_Y;
  return THIN_AXIS_X;
}

/**
 * Texture for a disguised secret door: match a flanking wall so it blends into
 * the surrounding terrain, falling back to the default wall texture.
 */
function secretWallTextureSlot(state: FirstPersonRendererState, map: GameMap, x: number, y: number): number {
  for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
    const terrain = terrainAt(map, nx, ny);
    if (terrain?.kind === "wall") {
      return wallTextureSlot(state, terrain.wall_texture);
    }
  }
  return wallTextureSlot(state, undefined);
}

function addTerrainBarriers(state: FirstPersonRendererState, scene: RaycastScene): void {
  for (const barrier of state.terrainBarriersByScene.get(scene) ?? []) {
    addThinWall(scene, barrier.x, barrier.y, barrier.texture, barrier.axis);
  }
}

function doorTexture(locked: boolean, color: KeyColor | undefined): number {
  if (locked && color !== undefined) return DOOR_TEX_BY_COLOR[color];
  return DOOR_TEX;
}

/**
 * Map an authored slide direction onto the door's span axis. Horizontal
 * directions perpendicular to the span (or unset) fall back to sliding
 * toward the negative end (north/west).
 */
function doorSlideForAxis(slide: DoorSlide | undefined, axis: ThinWallAxis): ThinWallSlide {
  switch (slide) {
    case "up":
      return THIN_SLIDE_UP;
    case "down":
      return THIN_SLIDE_DOWN;
    case "east":
      return axis === THIN_AXIS_Y ? THIN_SLIDE_POS : THIN_SLIDE_NEG;
    case "south":
      return axis === THIN_AXIS_X ? THIN_SLIDE_POS : THIN_SLIDE_NEG;
    case "north":
    case "west":
    default:
      return THIN_SLIDE_NEG;
  }
}

/** Animated openness for a door entity; updates doorSample. */
function tweenedDoorOpenness(
  state: FirstPersonRendererState,
  drawable: DrawableEntity & { open: boolean; openMs: number },
  nowMs: number,
): void {
  const target = drawable.open ? 1 : 0;
  let tween = state.doorTweens.get(drawable.entity);
  if (tween === undefined) {
    tween = createScalarTween(target);
    state.doorTweens.set(drawable.entity, tween);
  } else {
    retargetScalarTween(tween, target, nowMs, drawable.openMs);
  }
  sampleScalarTween(tween, nowMs, state.doorSample);
}

function itemElevation(nowMs: number): number {
  const phase = (nowMs / ITEM_BOB_PERIOD_MS) * Math.PI * 2;
  return ITEM_BOB_BASE_ELEVATION + Math.sin(phase) * ITEM_BOB_ELEVATION_AMPLITUDE;
}

function addFirstPersonSprite(
  state: FirstPersonRendererState,
  scene: RaycastScene,
  x: number,
  y: number,
  slot: number,
  height: number,
  elevation = 0,
): void {
  addSprite(scene, x, y, slot, height, elevation, height * (state.spriteAspectBySlot.get(slot) ?? 1));
}

function addAppearanceSprite(
  state: FirstPersonRendererState,
  scene: RaycastScene,
  x: number,
  y: number,
  appearance: SpriteAppearance,
  nowMs: number,
): boolean {
  if (appearance.firstPersonSlot === undefined) return false;
  addFirstPersonSprite(
    state,
    scene,
    x,
    y,
    appearance.firstPersonSlot,
    appearance.firstPersonScale,
    appearance.firstPersonElevation + (appearance.itemBob ? itemElevation(nowMs) : 0),
  );
  return appearance.itemBob;
}

function enemySprite(baseSlot: number, dir: number, cameraDir: CardinalDirection, row: number): number {
  const relative = (normalizeDirection(dir) - cameraDir + 4) & 3;
  return baseSlot + row * SHEET_COLUMNS + REL_DIR_TO_SHEET_COLUMN[relative]!;
}

function animationIsActive(animation: SpriteAnimationSchema | undefined, nowMs: number): boolean {
  return animation !== undefined && nowMs < animation.startedAtMs + animation.durationMs;
}

function animationFrame(animation: SpriteAnimationSchema, nowMs: number, frameCount: number): number {
  if (animation.durationMs <= 0) return frameCount - 1;
  const elapsed = Math.max(0, nowMs - animation.startedAtMs);
  const progress = Math.min(1, elapsed / animation.durationMs);
  return Math.min(frameCount - 1, (progress * frameCount) | 0);
}

/** Pick the sheet row for an enemy: ECS presentation state or default idle. */
function enemySheetRow(animation: SpriteAnimationSchema | undefined, nowMs: number): number {
  if (animation === undefined || !animationIsActive(animation, nowMs)) return ROW_IDLE;
  if (animation.kind === SpriteAnimationKind.Attack) return ROW_ATTACK;
  if (animation.kind === SpriteAnimationKind.Walk) {
    return animationFrame(animation, nowMs, 2) === 0 ? ROW_IDLE : ROW_WALK;
  }
  return ROW_IDLE;
}

function drawTargetHighlight(ctx: CanvasRenderingContext2D, rect: ViewRect, tone: TargetMarkerTone): void {
  const size = Math.max(18, Math.round(rect.width * TARGET_SIZE_FRACTION));
  const inner = Math.round(size * TARGET_INNER_FRACTION);
  const cx = Math.round(rect.x + rect.width / 2);
  const cy = Math.round(rect.y + rect.height * TARGET_Y_FRACTION);
  const left = cx - size;
  const right = cx + size;
  const top = cy - size;
  const bottom = cy + size;

  ctx.save();
  ctx.strokeStyle = TARGET_COLORS[tone];
  ctx.lineWidth = Math.max(2, Math.round(rect.width / 360));
  ctx.beginPath();
  ctx.moveTo(left, top + inner);
  ctx.lineTo(left, top);
  ctx.lineTo(left + inner, top);
  ctx.moveTo(right - inner, top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, top + inner);
  ctx.moveTo(right, bottom - inner);
  ctx.lineTo(right, bottom);
  ctx.lineTo(right - inner, bottom);
  ctx.moveTo(left + inner, bottom);
  ctx.lineTo(left, bottom);
  ctx.lineTo(left, bottom - inner);
  ctx.stroke();
  ctx.restore();
}

/** Tweened world position for a moving entity; updates spritePoint. */
function tweenedSpritePosition(state: FirstPersonRendererState, drawable: DrawableEntity, nowMs: number): void {
  const centerX = drawable.x + 0.5;
  const centerY = drawable.y + 0.5;
  let tween = state.spriteTweens.get(drawable.entity);
  if (tween === undefined) {
    tween = createSpriteTween(centerX, centerY);
    state.spriteTweens.set(drawable.entity, tween);
  } else {
    retargetSpriteTween(tween, centerX, centerY, nowMs, spriteMoveDuration(drawable));
  }
  sampleSpriteTween(tween, nowMs, state.spritePoint);
}

function spriteMoveDuration(drawable: DrawableEntity): number | undefined {
  if (!("animation" in drawable)) return undefined;
  return drawable.animation?.kind === SpriteAnimationKind.Walk ? drawable.animation.durationMs : undefined;
}

/** Returns true when the drawable's animation still needs repaints. */
function addDrawable(
  state: FirstPersonRendererState,
  scene: RaycastScene,
  map: GameMap,
  drawable: DrawableEntity,
  cameraDir: CardinalDirection,
  nowMs: number,
): boolean {
  const centerX = drawable.x + 0.5;
  const centerY = drawable.y + 0.5;
  switch (drawable.kind) {
    case DrawableKind.Player:
      return false;
    case DrawableKind.Actor: {
      tweenedSpritePosition(state, drawable, nowMs);
      const appearance = spriteAppearance(drawable.spriteId);
      if (!appearance.enemySheet) {
        addAppearanceSprite(state, scene, state.spritePoint.x, state.spritePoint.y, appearance, nowMs);
        return !state.spritePoint.settled;
      }
      if (appearance.firstPersonSlot === undefined) return !state.spritePoint.settled;
      const row = enemySheetRow(drawable.animation, nowMs);
      const sprite = enemySprite(appearance.firstPersonSlot, drawable.dir, cameraDir, row);
      addFirstPersonSprite(state, scene, state.spritePoint.x, state.spritePoint.y, sprite, appearance.firstPersonScale);
      return !state.spritePoint.settled || animationIsActive(drawable.animation, nowMs);
    }
    case DrawableKind.Door: {
      // A secret door stays disguised as its surrounding wall for its whole
      // lifecycle and slides from the same full-cell face it uses while shut.
      if (drawable.secret) {
        tweenedDoorOpenness(state, drawable, nowMs);
        const secretAxis = doorAxis(map, drawable.x, drawable.y);
        addSlidingSolidWall(
          scene,
          drawable.x,
          drawable.y,
          secretWallTextureSlot(state, map, drawable.x, drawable.y),
          secretAxis,
          doorSlideForAxis(drawable.slide, secretAxis),
          state.doorSample.value,
        );
        return !state.doorSample.settled;
      }
      tweenedDoorOpenness(state, drawable, nowMs);
      const axis = doorAxis(map, drawable.x, drawable.y);
      addThinWall(
        scene,
        drawable.x,
        drawable.y,
        doorTexture(drawable.locked, drawable.color),
        axis,
        doorSlideForAxis(drawable.slide, axis),
        state.doorSample.value,
      );
      return !state.doorSample.settled;
    }
    case DrawableKind.Sprite: {
      const appearance = spriteAppearance(drawable.spriteId);
      if (
        appearance.enemySheet &&
        appearance.firstPersonSlot !== undefined &&
        drawable.animation?.kind === SpriteAnimationKind.Death
      ) {
        const frame = animationFrame(drawable.animation, nowMs, SHEET_COLUMNS);
        addFirstPersonSprite(
          state,
          scene,
          centerX,
          centerY,
          appearance.firstPersonSlot + ROW_DEATH * SHEET_COLUMNS + frame,
          appearance.firstPersonScale,
        );
        return animationIsActive(drawable.animation, nowMs);
      }
      return addAppearanceSprite(state, scene, centerX, centerY, appearance, nowMs);
    }
  }
}

/**
 * Render the first-person view for the session's current state. `repaint`
 * doubles as the asset-load callback and the animation tick: while the camera
 * is tweening between grid poses, one requestAnimationFrame repaint at a time
 * is scheduled, so idle turns keep costing zero frames.
 */
function renderFirstPersonView(
  state: FirstPersonRendererState,
  ctx: CanvasRenderingContext2D,
  rect: ViewRect,
  session: FirstPersonRenderSession,
  targetTone?: TargetMarkerTone,
  repaint?: () => void,
): void {
  const map = session.map;
  const scene = sceneForMapForState(state, map);
  bakeLoadedAssets(state, ctx, repaint);
  clearSceneDynamic(scene);
  addTerrainBarriers(state, scene);
  const nowMs = performance.now();
  const lightsAnimating = updateSceneLights(scene, session, nowMs);

  // Two passes over the drawables: the camera pose must be known before
  // enemies pick a directional sprite.
  state.drawableScratch.length = 0;
  let playerX = 0;
  let playerY = 0;
  let playerDir: CardinalDirection | undefined;
  session.forEachDrawable((drawable): void => {
    if (drawable.kind === DrawableKind.Player) {
      playerX = drawable.x;
      playerY = drawable.y;
      playerDir = normalizeDirection(drawable.dir);
      return;
    }
    state.drawableScratch.push(drawable);
  });
  if (playerDir === undefined) return;

  const forward = directionDelta(playerDir);
  const targetAngle = Math.atan2(forward.dy, forward.dx);
  state.lastRepaint = repaint;
  if (!state.poseInitialized) {
    state.poseInitialized = true;
    snapPoseTween(state.poseTween, playerX + 0.5, playerY + 0.5, targetAngle);
  } else {
    retargetPoseTween(state.poseTween, playerX + 0.5, playerY + 0.5, targetAngle, nowMs);
  }

  let spritesAnimating = false;
  for (const drawable of state.drawableScratch) {
    spritesAnimating = addDrawable(state, scene, map, drawable, playerDir, nowMs) || spritesAnimating;
  }

  samplePoseTween(state.poseTween, nowMs, state.poseSample);
  sampleNudgeTween(state.nudgeTween, nowMs, state.nudgeSample);
  const skyAnimating = sceneHasSkyCeiling(scene, state.atlas);
  if (
    (!state.poseSample.settled || !state.nudgeSample.settled || spritesAnimating || lightsAnimating || skyAnimating) &&
    repaint !== undefined
  ) {
    scheduleRepaint(state, repaint);
  }

  state.view.render(
    ctx,
    rect,
    scene,
    state.atlas,
    cameraForAngle(
      state.poseSample.x + state.nudgeSample.dx,
      state.poseSample.y + state.nudgeSample.dy,
      state.poseSample.angle,
    ),
    headBobFraction(state.poseSample),
    nowMs,
  );

  if (targetTone !== undefined) drawTargetHighlight(ctx, rect, targetTone);
}
