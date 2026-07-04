import type { TerrainTile, TexturePack } from "@/src/map/map.ts";

export const SKY_CEILING_TEXTURE = "sky";

export const TEXTURE_PACK_COLUMNS = 5;
export const TEXTURE_PACK_ROWS = 4;
export const TEXTURE_PACKS = ["pack1", "pack2", "pack3"] as const satisfies readonly TexturePack[];
export const TEXTURE_PACK_TILE_COUNT = TEXTURE_PACK_COLUMNS * TEXTURE_PACK_ROWS;
export const TEXTURE_TERRAIN_COUNT = TEXTURE_PACKS.length * TEXTURE_PACK_TILE_COUNT;

export const FLOOR_TERRAIN_BASE_ID = 0;
export const WALL_TERRAIN_BASE_ID = FLOOR_TERRAIN_BASE_ID + TEXTURE_TERRAIN_COUNT;
export const BARRIER_TERRAIN_BASE_ID = WALL_TERRAIN_BASE_ID + TEXTURE_TERRAIN_COUNT;
export const BARRIER_TERRAIN_COUNT = 2;
export const TERRAIN_CATALOG_TILE_COUNT = BARRIER_TERRAIN_BASE_ID + BARRIER_TERRAIN_COUNT;
export const TERRAIN_CATALOG_TILE_COLUMNS = TEXTURE_PACK_COLUMNS * TEXTURE_PACK_ROWS;

export const DEFAULT_FLOOR_TERRAIN_ID = FLOOR_TERRAIN_BASE_ID;
export const DEFAULT_WALL_TERRAIN_ID = WALL_TERRAIN_BASE_ID;
export const DEFAULT_BARS_TERRAIN_ID = BARRIER_TERRAIN_BASE_ID;
export const DEFAULT_GLASS_TERRAIN_ID = BARRIER_TERRAIN_BASE_ID + 1;

export const TERRAIN_CATALOG: readonly TerrainTile[] = [
  ...textureRefs().map((texture, index): TerrainTile => ({
    kind: "floor" as const,
    id: FLOOR_TERRAIN_BASE_ID + index,
    color: terrainColor(index, false),
    floor_texture: texture,
    ceiling_texture: index === 2 ? SKY_CEILING_TEXTURE : texture,
  })),
  ...textureRefs().map((texture, index) => ({
    kind: "wall" as const,
    id: WALL_TERRAIN_BASE_ID + index,
    color: terrainColor(index, true),
    wall_texture: texture,
  })),
  {
    kind: "barrier",
    id: DEFAULT_BARS_TERRAIN_ID,
    color: "#64748b",
    barrier_texture: "bars",
    floor_texture: "pack1:0,0",
    ceiling_texture: "pack1:0,0",
  },
  {
    kind: "barrier",
    id: DEFAULT_GLASS_TERRAIN_ID,
    color: "#38bdf8",
    barrier_texture: "glass",
    floor_texture: "pack1:0,0",
    ceiling_texture: "pack1:0,0",
  },
];

export const PALETTE_KEYS = [
  "boot_sector",
  "data_conduit",
  "firewall",
  "nexus",
  "mainframe_core",
] as const;

export type PaletteKey = (typeof PALETTE_KEYS)[number];

function textureRefs(): readonly `${TexturePack}:${number},${number}`[] {
  return TEXTURE_PACKS.flatMap((pack) =>
    Array.from(
      { length: TEXTURE_PACK_TILE_COUNT },
      (_value, tileId) =>
        `${pack}:${tileId % TEXTURE_PACK_COLUMNS},${Math.floor(tileId / TEXTURE_PACK_COLUMNS)}` as const,
    )
  );
}

function terrainColor(index: number, blocking: boolean): string {
  const hue = (index * 47) % 360;
  const saturation = blocking ? 48 : 58;
  const lightness = blocking ? 34 : 42;
  return hslToHex(hue, saturation, lightness);
}

function hslToHex(hue: number, saturationPercent: number, lightnessPercent: number): string {
  const saturation = saturationPercent / 100;
  const lightness = lightnessPercent / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const match = lightness - chroma / 2;
  const [red, green, blue] = hue < 60 ?
    [chroma, x, 0] :
    hue < 120 ?
    [x, chroma, 0] :
    hue < 180 ?
    [0, chroma, x] :
    hue < 240 ?
    [0, x, chroma] :
    hue < 300 ?
    [x, 0, chroma] :
    [chroma, 0, x];
  return `#${hexChannel(red + match)}${hexChannel(green + match)}${hexChannel(blue + match)}`;
}

function hexChannel(value: number): string {
  return Math.round(value * 255).toString(16).padStart(2, "0");
}
