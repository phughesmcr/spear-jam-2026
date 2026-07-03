import type { TiledTileset, TiledTilesetReference, TiledTilesetTile } from "@/src/map/authoring/tiled_types.ts";

export type TilesetSources = Readonly<Record<string, TiledTileset>>;

export type DecodedGid = {
  readonly gid: number;
  readonly localId: number;
  readonly tile?: TiledTilesetTile;
};

type TilesetEntry = {
  readonly firstgid: number;
  readonly tilecount?: number;
  readonly source?: string;
  readonly tilesById: ReadonlyMap<number, TiledTilesetTile>;
};

export type TilesetRegistry = {
  readonly entries: readonly TilesetEntry[];
};

const TRANSFORM_MASK = 0xf0000000;
const RAW_GID_MASK = 0x0fffffff;

export function createTilesetRegistry(
  references: readonly TiledTilesetReference[] | undefined,
  sources: TilesetSources | undefined,
): TilesetRegistry {
  const entries = (references ?? []).map((reference) => tilesetEntry(reference, sources));
  entries.sort((a, b) => a.firstgid - b.firstgid);
  return { entries };
}

export function decodeTerrainGid(gid: number, registry: TilesetRegistry, context: string): DecodedGid {
  return decodeGid(gid, registry, context, "empty terrain GID");
}

export function decodeObjectGid(gid: number, registry: TilesetRegistry, context: string): DecodedGid {
  return decodeGid(gid, registry, context, "empty object GID");
}

function tilesetEntry(reference: TiledTilesetReference, sources: TilesetSources | undefined): TilesetEntry {
  if (!Number.isInteger(reference.firstgid) || reference.firstgid <= 0) {
    throw new Error(`Tileset firstgid must be a positive integer.`);
  }

  const sourceTileset = reference.source === undefined ? undefined : sources?.[reference.source];
  if (reference.source !== undefined && sourceTileset === undefined) {
    throw new Error(`Missing parsed tileset for "${reference.source}".`);
  }

  const tileset = sourceTileset === undefined ? reference : {
    ...sourceTileset,
    ...reference,
    name: reference.name ?? sourceTileset.name,
    tilecount: reference.tilecount ?? sourceTileset.tilecount,
    columns: reference.columns ?? sourceTileset.columns,
    tiles: reference.tiles ?? sourceTileset.tiles,
  };

  return {
    firstgid: reference.firstgid,
    tilecount: tileset.tilecount,
    source: reference.source,
    tilesById: new Map((tileset.tiles ?? []).map((tile) => [tile.id, tile])),
  };
}

function decodeGid(
  gid: number,
  registry: TilesetRegistry,
  context: string,
  emptyMessage: string,
): DecodedGid {
  if (!Number.isInteger(gid) || gid < 0 || gid > 0xffffffff) {
    throw new Error(`${context}: Tiled GID must be an unsigned 32-bit integer.`);
  }

  const unsigned = gid >>> 0;
  if ((unsigned & TRANSFORM_MASK) !== 0) {
    throw new Error(`${context}: transformed GID ${gid} is unsupported.`);
  }

  const rawGid = unsigned & RAW_GID_MASK;
  if (rawGid === 0) throw new Error(`${context}: ${emptyMessage} 0 is not allowed.`);

  const entry = tilesetForGid(rawGid, registry);
  if (entry === undefined) throw new Error(`${context}: GID ${rawGid} does not belong to a known tileset.`);

  const localId = rawGid - entry.firstgid;
  if (entry.tilecount !== undefined && localId >= entry.tilecount) {
    const source = entry.source === undefined ? `firstgid ${entry.firstgid}` : entry.source;
    throw new Error(`${context}: GID ${rawGid} is outside tileset "${source}".`);
  }

  return {
    gid: rawGid,
    localId,
    tile: entry.tilesById.get(localId),
  };
}

function tilesetForGid(gid: number, registry: TilesetRegistry): TilesetEntry | undefined {
  let match: TilesetEntry | undefined;
  for (const entry of registry.entries) {
    if (entry.firstgid <= gid) match = entry;
  }
  return match;
}
