import {
  AUTHORING_TILE_SIZE,
  barrierTilesetImagePath,
  barrierTilesetPath,
  floorTilesetImagePath,
  floorTilesetPath,
  TERRAIN_ATLAS_TILE_COLUMNS,
  TEXTURE_PACK_DEFINITIONS,
  TEXTURE_PACK_TILE_SIZE,
  wallTilesetImagePath,
  wallTilesetPath,
} from "@/src/map/authoring/catalog.ts";
import type { TiledProperty } from "@/src/map/authoring/tiled_types.ts";
import type { TerrainTile, TexturePackRef } from "@/src/map/map.ts";
import { BarrierTexture } from "@/src/map/map.ts";
import { isTexturePackRef, parseTexturePackRef, TERRAIN_CATALOG } from "@/src/map/terrain_palettes.ts";
import { flagsBlockAttack, flagsBlockMovement, flagsBlockSight, terrainFlags } from "@/src/map/tile_flags.ts";
import { averageSourcePixel, drawTileBorder, setPixel } from "./pixels.ts";
import { encodePng, readPngImage, type RgbaImage } from "./png.ts";
import { jsonSource, property } from "./json_utils.ts";

const WALL_TILE_BORDER_COLOR = [255, 0, 255, 255] as const;

export async function generatedTerrainSources(
  packImages?: ReadonlyMap<string, RgbaImage>,
): Promise<Readonly<Record<string, string | Uint8Array>>> {
  const images = packImages ?? await readTexturePackImages();
  return {
    [floorTilesetPath()]: jsonSource(terrainTileset("floors", "floors.png", floorTerrainTiles())),
    [floorTilesetImagePath()]: terrainAtlasImage(floorTerrainTiles(), images),
    [wallTilesetPath()]: jsonSource(terrainTileset("walls", "walls.png", wallTerrainTiles())),
    [wallTilesetImagePath()]: terrainAtlasImage(wallTerrainTiles(), images, { border: WALL_TILE_BORDER_COLOR }),
    [barrierTilesetPath()]: jsonSource(terrainTileset("barriers", "barriers.png", barrierTerrainTiles())),
    [barrierTilesetImagePath()]: barrierAtlasImage(barrierTerrainTiles()),
  };
}

function terrainTileset(name: string, image: string, terrain: readonly TerrainTile[]): unknown {
  const imageHeight = AUTHORING_TILE_SIZE * Math.ceil(terrain.length / TERRAIN_ATLAS_TILE_COLUMNS);
  return {
    columns: TERRAIN_ATLAS_TILE_COLUMNS,
    image,
    imageheight: imageHeight,
    imagewidth: AUTHORING_TILE_SIZE * TERRAIN_ATLAS_TILE_COLUMNS,
    margin: 0,
    name,
    spacing: 0,
    tilecount: terrain.length,
    tiledversion: "1.12.2",
    tileheight: AUTHORING_TILE_SIZE,
    tiles: terrain.map((tile, localId) => {
      const texture = terrainDisplayTexture(tile);
      return {
        id: localId,
        type: `${tile.kind}Terrain`,
        properties: [
          property("terrainId", tile.id),
          property("terrainKind", tile.kind),
          property("blocking", flagsBlockMovement(terrainFlags(tile))),
          property("label", `${tile.id}: ${texture}`),
          ...terrainTileProperties(tile),
        ],
      };
    }),
    tilewidth: AUTHORING_TILE_SIZE,
    type: "tileset",
    version: "1.10",
  };
}

function terrainAtlasImage(
  terrain: readonly TerrainTile[],
  packImages: ReadonlyMap<string, RgbaImage>,
  options: { readonly border?: readonly [number, number, number, number] } = {},
): Uint8Array {
  const width = AUTHORING_TILE_SIZE * TERRAIN_ATLAS_TILE_COLUMNS;
  const height = AUTHORING_TILE_SIZE * Math.ceil(terrain.length / TERRAIN_ATLAS_TILE_COLUMNS);
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < terrain.length; index++) {
    const tile = terrain[index]!;
    drawTextureThumbnail(pixels, width, index, TERRAIN_ATLAS_TILE_COLUMNS, terrainDisplayTexture(tile), packImages);
    if (options.border !== undefined) {
      drawTileBorder(pixels, width, index, TERRAIN_ATLAS_TILE_COLUMNS, options.border);
    }
  }
  return encodePng(width, height, pixels);
}

function barrierAtlasImage(terrain: readonly TerrainTile[]): Uint8Array {
  const width = AUTHORING_TILE_SIZE * TERRAIN_ATLAS_TILE_COLUMNS;
  const height = AUTHORING_TILE_SIZE * Math.ceil(terrain.length / TERRAIN_ATLAS_TILE_COLUMNS);
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < terrain.length; index++) {
    const tile = terrain[index]!;
    if (tile.kind === "barrier") drawBarrierThumbnail(pixels, width, index, tile.barrier_texture);
  }
  return encodePng(width, height, pixels);
}

function drawBarrierThumbnail(
  target: Uint8Array,
  targetWidth: number,
  tileIndex: number,
  texture: string,
): void {
  const targetLeft = (tileIndex % TERRAIN_ATLAS_TILE_COLUMNS) * AUTHORING_TILE_SIZE;
  const targetTop = Math.floor(tileIndex / TERRAIN_ATLAS_TILE_COLUMNS) * AUTHORING_TILE_SIZE;
  for (let y = 0; y < AUTHORING_TILE_SIZE; y++) {
    for (let x = 0; x < AUTHORING_TILE_SIZE; x++) {
      const opaque = texture === BarrierTexture.Bars ?
        x === 0 || x === AUTHORING_TILE_SIZE - 1 || y === 0 || y === AUTHORING_TILE_SIZE - 1 || x % 4 === 1 :
        x === 0 || x === AUTHORING_TILE_SIZE - 1 || y === 0 || y === AUTHORING_TILE_SIZE - 1 || x === y ||
        x + y === AUTHORING_TILE_SIZE - 1;
      if (!opaque) continue;
      setPixel(target, targetWidth, targetLeft + x, targetTop + y, [125, 211, 252, 255]);
    }
  }
}

function floorTerrainTiles(): readonly TerrainTile[] {
  return TERRAIN_CATALOG.filter((tile) => tile.kind === "floor");
}

function wallTerrainTiles(): readonly TerrainTile[] {
  return TERRAIN_CATALOG.filter((tile) => tile.kind === "wall");
}

function barrierTerrainTiles(): readonly TerrainTile[] {
  return TERRAIN_CATALOG.filter((tile) => tile.kind === "barrier");
}

function terrainDisplayTexture(tile: TerrainTile): TexturePackRef {
  if (tile.kind === "wall") {
    if (!isTexturePackRef(tile.wall_texture)) {
      throw new Error(`Terrain tile ${tile.id} must use a texture pack wall texture for Tiled authoring.`);
    }
    return tile.wall_texture;
  }
  if (!isTexturePackRef(tile.floor_texture)) {
    throw new Error(`Terrain tile ${tile.id} must use a texture pack floor texture for Tiled authoring.`);
  }
  return tile.floor_texture;
}

function terrainTileProperties(tile: TerrainTile): readonly TiledProperty[] {
  const flags = terrainFlags(tile);
  switch (tile.kind) {
    case "floor":
      return [
        property("blocksSight", flagsBlockSight(flags)),
        property("blocksAttacks", flagsBlockAttack(flags)),
        property("floorTexture", tile.floor_texture, "TextureRef"),
        property("ceilingTexture", tile.ceiling_texture, "TextureRef"),
      ];
    case "wall":
      return [
        property("blocksSight", flagsBlockSight(flags)),
        property("blocksAttacks", flagsBlockAttack(flags)),
        property("wallTexture", tile.wall_texture, "TextureRef"),
      ];
    case "barrier":
      return [
        property("blocksSight", flagsBlockSight(flags)),
        property("blocksAttacks", flagsBlockAttack(flags)),
        property("barrierTexture", tile.barrier_texture),
        property("floorTexture", tile.floor_texture, "TextureRef"),
        property("ceilingTexture", tile.ceiling_texture, "TextureRef"),
      ];
  }
}

function drawTextureThumbnail(
  target: Uint8Array,
  targetWidth: number,
  tileIndex: number,
  columns: number,
  texture: TexturePackRef,
  packImages: ReadonlyMap<string, RgbaImage>,
): void {
  const ref = parseTexturePackRef(texture);
  const image = packImages.get(ref.pack);
  if (image === undefined) throw new Error(`Missing texture pack image for ${ref.pack}.`);

  const sourceLeft = ref.column * TEXTURE_PACK_TILE_SIZE;
  const sourceTop = ref.row * TEXTURE_PACK_TILE_SIZE;
  const targetLeft = (tileIndex % columns) * AUTHORING_TILE_SIZE;
  const targetTop = Math.floor(tileIndex / columns) * AUTHORING_TILE_SIZE;
  const sampleSize = TEXTURE_PACK_TILE_SIZE / AUTHORING_TILE_SIZE;
  for (let y = 0; y < AUTHORING_TILE_SIZE; y++) {
    for (let x = 0; x < AUTHORING_TILE_SIZE; x++) {
      const color = averageSourcePixel(image, sourceLeft + x * sampleSize, sourceTop + y * sampleSize, sampleSize);
      const offset = (((targetTop + y) * targetWidth) + targetLeft + x) * 4;
      target[offset] = color[0];
      target[offset + 1] = color[1];
      target[offset + 2] = color[2];
      target[offset + 3] = color[3];
    }
  }
}

async function readTexturePackImages(): Promise<ReadonlyMap<string, RgbaImage>> {
  const images = new Map<string, RgbaImage>();
  for (const definition of TEXTURE_PACK_DEFINITIONS) {
    images.set(definition.pack, await readPngImage(`assets/game/textures/${definition.image}`));
  }
  return images;
}
