import type { TerrainTile, TexturePack, TexturePackRef } from "@/src/game/world/map.ts";

export const SKY_CEILING_TEXTURE = "sky";

export const TEXTURE_PACK_COLUMNS = 5;
export const TEXTURE_PACK_ROWS = 4;
export const TEXTURE_PACKS = ["pack1", "pack2", "pack3"] as const satisfies readonly TexturePack[];
export const TEXTURE_PACK_TILE_COUNT = TEXTURE_PACK_COLUMNS * TEXTURE_PACK_ROWS;
export const TEXTURE_TERRAIN_COUNT = TEXTURE_PACKS.length * TEXTURE_PACK_TILE_COUNT;

export const FLOOR_TERRAIN_BASE_ID = 0;
export const WALL_TERRAIN_BASE_ID = FLOOR_TERRAIN_BASE_ID + TEXTURE_TERRAIN_COUNT;
export const BARRIER_TERRAIN_BASE_ID = WALL_TERRAIN_BASE_ID + TEXTURE_TERRAIN_COUNT;

export const DEFAULT_WALL_TERRAIN_ID = WALL_TERRAIN_BASE_ID;
export const DEFAULT_BARS_TERRAIN_ID = BARRIER_TERRAIN_BASE_ID;
export const DEFAULT_GLASS_TERRAIN_ID = BARRIER_TERRAIN_BASE_ID + 1;
export const DEFAULT_SKY_BARS_TERRAIN_ID = BARRIER_TERRAIN_BASE_ID + 2;

export const TERRAIN_CATALOG: readonly TerrainTile[] = [
  ...textureRefs().map((texture, index): TerrainTile => ({
    kind: "floor" as const,
    id: FLOOR_TERRAIN_BASE_ID + index,
    floor_texture: index === 2 ? "pack3:4,1" : texture,
    ceiling_texture: index === 2 ? SKY_CEILING_TEXTURE : texture,
  })),
  ...textureRefs().map((texture, index) => ({
    kind: "wall" as const,
    id: WALL_TERRAIN_BASE_ID + index,
    wall_texture: texture,
  })),
  {
    kind: "barrier",
    id: DEFAULT_BARS_TERRAIN_ID,
    barrier_texture: "bars",
    floor_texture: "pack1:0,0",
    ceiling_texture: "pack1:0,0",
  },
  {
    kind: "barrier",
    id: DEFAULT_GLASS_TERRAIN_ID,
    barrier_texture: "glass",
    floor_texture: "pack1:0,0",
    ceiling_texture: "pack1:0,0",
  },
  {
    kind: "barrier",
    id: DEFAULT_SKY_BARS_TERRAIN_ID,
    barrier_texture: "bars",
    floor_texture: "pack1:0,0",
    ceiling_texture: SKY_CEILING_TEXTURE,
  },
];

export function isTexturePack(value: string): value is TexturePack {
  return (TEXTURE_PACKS as readonly string[]).includes(value);
}

export function isTexturePackRef(value: string): value is TexturePackRef {
  try {
    parseTexturePackRef(value);
    return true;
  } catch {
    return false;
  }
}

export function parseTexturePackRef(value: string): {
  readonly pack: TexturePack;
  readonly column: number;
  readonly row: number;
} {
  const [pack, cell, extra] = value.split(":");
  if (pack === undefined || cell === undefined || extra !== undefined || !isTexturePack(pack)) {
    throw new Error(`Unknown texture pack ref: ${value}`);
  }

  const [columnText, rowText, extraCell] = cell.split(",");
  const column = Number(columnText);
  const row = Number(rowText);
  if (
    extraCell !== undefined ||
    !Number.isInteger(column) ||
    !Number.isInteger(row) ||
    column < 0 ||
    row < 0 ||
    column >= TEXTURE_PACK_COLUMNS ||
    row >= TEXTURE_PACK_ROWS
  ) {
    throw new Error(`Texture pack ref "${value}" must address a ${TEXTURE_PACK_COLUMNS}x${TEXTURE_PACK_ROWS} grid.`);
  }

  return { pack, column, row };
}

function textureRefs(): readonly TexturePackRef[] {
  return TEXTURE_PACKS.flatMap((pack) =>
    Array.from(
      { length: TEXTURE_PACK_TILE_COUNT },
      (_value, tileId) =>
        `${pack}:${tileId % TEXTURE_PACK_COLUMNS},${Math.floor(tileId / TEXTURE_PACK_COLUMNS)}` as TexturePackRef,
    )
  );
}
