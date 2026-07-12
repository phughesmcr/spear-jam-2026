import type { LightEntityVisitor } from "@/src/ecs/drawables.ts";
import {
  type DoorSlide,
  type GameMap,
  mapDimensions,
  terrainAt,
  terrainBlocksMovement,
  terrainIsBarrier,
} from "@/src/map/map.ts";
import {
  barrierTextureSlot,
  ceilingTextureSlot,
  type FirstPersonAssetState,
  floorTextureSlot,
  wallTextureSlot,
} from "@/src/render/first_person_assets.ts";
import {
  addThinWall,
  createScene,
  type RaycastAtlas,
  type RaycastScene,
  THIN_AXIS_X,
  THIN_AXIS_Y,
  THIN_SLIDE_DOWN,
  THIN_SLIDE_NEG,
  THIN_SLIDE_POS,
  THIN_SLIDE_UP,
  type ThinWallAxis,
  type ThinWallSlide,
} from "@/src/render/raycast/scene.ts";

type LightProvider = {
  forEachLight(visit: LightEntityVisitor): void;
};

export type TerrainBarrier = {
  readonly x: number;
  readonly y: number;
  readonly texture: number;
  readonly axis: ThinWallAxis;
};

export type FirstPersonSceneState = FirstPersonAssetState & {
  sceneByMap: WeakMap<GameMap, RaycastScene>;
  terrainBarriersByScene: WeakMap<RaycastScene, readonly TerrainBarrier[]>;
};

const LIGHT_FULL_BRIGHT = 255;
const LIGHT_AMBIENT = 112;
const DEFAULT_FLICKER_SPEED = 8;
/** Rebuild flickering lightmaps at ~12 Hz; static light sets still update on change. */
const LIGHT_REBUILD_INTERVAL_MS = 1000 / 12;

export type LightUpdateThrottle = {
  lastRebuildMs: number;
  lastSignature: number;
};

export function createLightUpdateThrottle(): LightUpdateThrottle {
  return { lastRebuildMs: Number.NEGATIVE_INFINITY, lastSignature: 0 };
}

export function sceneHasSkyCeiling(scene: RaycastScene, atlas: RaycastAtlas): boolean {
  if (atlas.skyPlane === undefined) return false;
  const skyId = atlas.skyPlane + 1;
  for (let index = 0; index < scene.ceilings.length; index++) {
    if (scene.ceilings[index] === skyId) return true;
  }
  return false;
}

export function sceneForMapForState(state: FirstPersonSceneState, map: GameMap): RaycastScene {
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
        scene.walls[cell] = wallTextureSlot(state, "wall") + 1;
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

export function updateSceneLights(
  scene: RaycastScene,
  session: LightProvider,
  nowMs: number,
  throttle: LightUpdateThrottle,
): boolean {
  let signature = 0;
  let lightCount = 0;
  let animating = false;
  session.forEachLight((light): void => {
    if (light.radius <= 0) return;
    lightCount++;
    signature = Math.imul(signature, 31) + light.entity + light.x * 17 + light.y * 13 + light.radius;
    animating ||= light.flickerAmount > 0;
  });
  signature ^= lightCount;

  const elapsed = nowMs - throttle.lastRebuildMs;
  const due = !(elapsed >= 0 && elapsed < LIGHT_REBUILD_INTERVAL_MS);
  if (!due && signature === throttle.lastSignature) return animating;

  throttle.lastRebuildMs = nowMs;
  throttle.lastSignature = signature;

  let foundLight = false;
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

  if (!foundLight) {
    scene.lightRed.fill(LIGHT_FULL_BRIGHT);
    scene.lightGreen.fill(LIGHT_FULL_BRIGHT);
    scene.lightBlue.fill(LIGHT_FULL_BRIGHT);
  }

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

/**
 * Thin walls span between flanking blockers. Prefer a full opposite pair; for
 * barrier fence ends / T-junction corners, follow whichever axis has a neighbor.
 */
export function doorAxis(map: GameMap, x: number, y: number): ThinWallAxis {
  const left = isBlocking(map, x - 1, y);
  const right = isBlocking(map, x + 1, y);
  const up = isBlocking(map, x, y - 1);
  const down = isBlocking(map, x, y + 1);
  if (left && right) return THIN_AXIS_Y;
  if (up && down) return THIN_AXIS_X;
  if (left || right) return THIN_AXIS_Y;
  return THIN_AXIS_X;
}

/**
 * Texture for a disguised secret door: match a flanking wall so it blends into
 * the surrounding terrain, falling back to the default wall texture.
 */
export function secretWallTextureSlot(state: FirstPersonAssetState, map: GameMap, x: number, y: number): number {
  for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
    const terrain = terrainAt(map, nx, ny);
    if (terrain?.kind === "wall") {
      return wallTextureSlot(state, terrain.wall_texture);
    }
  }
  return wallTextureSlot(state, "wall");
}

export function addTerrainBarriers(state: FirstPersonSceneState, scene: RaycastScene): void {
  for (const barrier of state.terrainBarriersByScene.get(scene) ?? []) {
    addThinWall(scene, barrier.x, barrier.y, barrier.texture, barrier.axis);
  }
}

/**
 * Map an authored slide direction onto the door's span axis. Horizontal
 * directions perpendicular to the span (or unset) fall back to sliding
 * toward the negative end (north/west).
 */
export function doorSlideForAxis(slide: DoorSlide | undefined, axis: ThinWallAxis): ThinWallSlide {
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
