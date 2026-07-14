import {
  BarrierTexture,
  type BarrierTexture as BarrierTextureType,
  type TexturePackRef,
} from "@/src/game/world/map.ts";
import { TEXTURE_PACK_COLUMNS, TEXTURE_PACK_ROWS, TEXTURE_PACKS } from "@/src/game/world/terrain_palette.ts";
import {
  type BakedTexture,
  bakeSolidTexture,
  bakeTexture,
  type RaycastAtlas,
  TEX_SIZE,
  type TexelSource,
} from "@/src/engine/raycast/mod.ts";
import {
  BARRIER_SLOT_BY_TEXTURE,
  createFirstPersonAssetCatalog,
  DOOR_SLOT_BY_COLOR,
  ENEMY_SHEET_SLOTS,
  type FirstPersonAssetCatalog,
  PLANE_SLOT,
  texturePackSlot,
  WALL_SLOT,
} from "@/src/game/presentation/first_person/assets/catalog.ts";
import { KeyColor } from "@/src/game/content/map_entities.ts";

export function createFallbackAtlas(
  catalog: FirstPersonAssetCatalog = createFirstPersonAssetCatalog(),
): RaycastAtlas {
  const walls: BakedTexture[] = [];
  const defaultWall = bakeSolidTexture(90, 95, 104);
  walls[WALL_SLOT.Wall] = defaultWall;
  walls[WALL_SLOT.Door] = bakeSolidTexture(154, 106, 58);
  walls[DOOR_SLOT_BY_COLOR[KeyColor.Red]] = bakeSolidTexture(177, 75, 75);
  walls[DOOR_SLOT_BY_COLOR[KeyColor.Blue]] = bakeSolidTexture(79, 141, 247);
  walls[DOOR_SLOT_BY_COLOR[KeyColor.Yellow]] = bakeSolidTexture(244, 211, 94);
  walls[BARRIER_SLOT_BY_TEXTURE[BarrierTexture.Bars]] = bakeBarrier(BarrierTexture.Bars);
  walls[BARRIER_SLOT_BY_TEXTURE[BarrierTexture.Glass]] = bakeBarrier(BarrierTexture.Glass);
  walls[WALL_SLOT.Jamb] = bakeSolidTexture(70, 72, 58);
  walls[WALL_SLOT.GlassSmashed] = bakeBarrier(BarrierTexture.Glass);

  const planes: BakedTexture[] = [];
  const defaultPlane = bakeSolidTexture(35, 40, 50);
  planes[PLANE_SLOT.Floor] = defaultPlane;
  planes[PLANE_SLOT.Ceiling] = bakeSolidTexture(16, 18, 23);
  planes[PLANE_SLOT.Sky] = bakeSky();
  planes[PLANE_SLOT.SkyFar] = bakeSkyFar();

  for (const pack of TEXTURE_PACKS) {
    for (let row = 0; row < TEXTURE_PACK_ROWS; row++) {
      for (let column = 0; column < TEXTURE_PACK_COLUMNS; column++) {
        const texture = `${pack}:${column},${row}` as TexturePackRef;
        walls[texturePackSlot("walls", texture)] = defaultWall;
        planes[texturePackSlot("planes", texture)] = defaultPlane;
      }
    }
  }

  const sprites: BakedTexture[] = [];
  for (const definition of catalog.sprites) {
    const fallback = bakeOrb(definition.fallbackColor);
    const slotCount = definition.source?.sheet === "directional" ? ENEMY_SHEET_SLOTS : 1;
    for (let offset = 0; offset < slotCount; offset++) {
      sprites[definition.slot + offset] = fallback;
    }
  }

  return {
    walls,
    planes,
    skyPlane: PLANE_SLOT.Sky,
    skyFarPlane: PLANE_SLOT.SkyFar,
    jambWall: WALL_SLOT.Jamb,
    sprites,
    spriteLightmaps: [],
  };
}

/** Procedural billboard used until an authored sprite has loaded. */
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

function bakeSky(): BakedTexture {
  return bakeTexture(skySource());
}

function bakeSkyFar(): BakedTexture {
  return bakeTexture(skyFarSource());
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
