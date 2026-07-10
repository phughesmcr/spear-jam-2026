import {
  AUTHORING_TILE_SIZE,
  barrierTilesetReference,
  entityMarkersTilesetReference,
  floorTilesetReference,
  MAPS_DIR,
  TERRAIN_BLOCKING_TILE_ID,
  TERRAIN_PASSABLE_TILE_ID,
  wallTilesetReference,
} from "@/src/map/authoring/catalog.ts";
import type { TiledMap } from "@/src/map/authoring/tiled_types.ts";
import { jsonSource, parseJson, property } from "./json_utils.ts";
import type { NewMapOptions, ParsedNewMapArgs } from "./types.ts";

export async function createNewMap(args: readonly string[]): Promise<void> {
  const parsed = parseNewMapArgs(args);
  const campaignOrder = parsed.campaignOrder ?? await nextCampaignOrder();
  const output = parsed.output ?? `${MAPS_DIR}/map_${campaignOrder}.tiled.json`;

  try {
    await Deno.stat(output);
    throw new Error(`${output} already exists.`);
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }

  const map = buildScaffoldMap({ ...parsed, campaignOrder });
  await Deno.writeTextFile(output, jsonSource(map));
}

export function buildScaffoldMap(options: NewMapOptions): TiledMap {
  if (!Number.isInteger(options.width) || options.width < 3) throw new Error("Map width must be an integer >= 3.");
  if (!Number.isInteger(options.height) || options.height < 3) throw new Error("Map height must be an integer >= 3.");
  if (!Number.isInteger(options.campaignOrder) || options.campaignOrder <= 0) {
    throw new Error("Campaign order must be a positive integer.");
  }

  return {
    compressionlevel: -1,
    height: options.height,
    infinite: false,
    layers: [
      {
        data: scaffoldTerrain(options.width, options.height),
        height: options.height,
        id: 1,
        name: "terrain",
        opacity: 1,
        type: "tilelayer",
        visible: true,
        width: options.width,
        x: 0,
        y: 0,
      },
      {
        draworder: "topdown",
        id: 2,
        name: "objects",
        objects: [],
        opacity: 1,
        type: "objectgroup",
        visible: true,
        x: 0,
        y: 0,
      },
      {
        class: "light_layer",
        draworder: "topdown",
        id: 3,
        name: "lights",
        objects: [],
        opacity: 1,
        type: "objectgroup",
        visible: true,
        x: 0,
        y: 0,
      },
      {
        class: "sound_layer",
        draworder: "topdown",
        id: 4,
        name: "sounds",
        objects: [],
        opacity: 1,
        type: "objectgroup",
        visible: true,
        x: 0,
        y: 0,
      },
    ],
    nextlayerid: 5,
    nextobjectid: 1,
    orientation: "orthogonal",
    properties: [
      property("campaignOrder", options.campaignOrder),
      property("name", options.name),
    ],
    renderorder: "right-down",
    tiledversion: "1.12.2",
    tileheight: AUTHORING_TILE_SIZE,
    tilesets: [
      floorTilesetReference(),
      wallTilesetReference(),
      barrierTilesetReference(),
      entityMarkersTilesetReference(),
    ],
    tilewidth: AUTHORING_TILE_SIZE,
    type: "map",
    version: "1.10",
    width: options.width,
  };
}

export function mapCampaignOrder(path: string, map: TiledMap): number {
  const raw = map.properties?.find((candidate) => candidate.name === "campaignOrder")?.value;
  if (typeof raw !== "number" || !Number.isInteger(raw)) throw new Error(`${path}: missing integer campaignOrder.`);
  return raw;
}

function parseNewMapArgs(args: readonly string[]): ParsedNewMapArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index++) {
    const name = args[index]!;
    if (!name.startsWith("--")) throw new Error(`Unexpected argument "${name}".`);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for "${name}".`);
    values.set(name, value);
    index++;
  }

  const name = requiredArg(values, "--name");
  const width = parseIntegerArg(requiredArg(values, "--width"), "--width");
  const height = parseIntegerArg(requiredArg(values, "--height"), "--height");
  const campaignOrderValue = values.get("--campaign-order");
  const output = values.get("--output");

  return {
    name,
    width,
    height,
    ...(campaignOrderValue === undefined ?
      {} :
      { campaignOrder: parseIntegerArg(campaignOrderValue, "--campaign-order") }),
    ...(output === undefined ? {} : { output }),
  };
}

function requiredArg(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined || value.length === 0) throw new Error(`Missing required argument "${name}".`);
  return value;
}

function parseIntegerArg(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

async function nextCampaignOrder(): Promise<number> {
  let next = 1;
  for await (const entry of Deno.readDir(MAPS_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".tiled.json")) continue;
    const path = `${MAPS_DIR}/${entry.name}`;
    const map = parseJson<TiledMap>(path, await Deno.readTextFile(path));
    next = Math.max(next, mapCampaignOrder(path, map) + 1);
  }
  return next;
}

function scaffoldTerrain(width: number, height: number): readonly number[] {
  const data: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      data.push(border ? TERRAIN_BLOCKING_TILE_ID + 1 : TERRAIN_PASSABLE_TILE_ID + 1);
    }
  }
  return data;
}
