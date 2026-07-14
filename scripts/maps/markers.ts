import {
  AUTHORING_TILE_SIZE,
  ENTITY_MARKER_TYPES,
  ENTITY_MARKERS_IMAGE,
  type EntityMarkerType,
} from "@/src/map/authoring/catalog.ts";
import type { TiledProperty } from "@/src/map/authoring/tiled_types.ts";
import { VICTORY_GOTO } from "@/src/game/world/map.ts";
import { jsonSource, property } from "./json_utils.ts";
import { drawTileBorder, fillRect, setPixel } from "./pixels.ts";
import { encodePng } from "./png.ts";

const MARKER_BACKGROUND: readonly [number, number, number, number] = [28, 30, 34, 255];

const MARKER_COLORS: Readonly<Record<EntityMarkerType, readonly [number, number, number, number]>> = {
  player: [52, 211, 255, 255],
  npc: [239, 68, 68, 255],
  enemy: [245, 158, 11, 255],
  door: [146, 91, 49, 255],
  key: [250, 204, 21, 255],
  uplinkCode: [202, 138, 4, 255],
  uplinkTerminal: [34, 197, 94, 255],
  weaponPickup: [168, 85, 247, 255],
  item: [59, 130, 246, 255],
  decoration: [100, 116, 139, 255],
  light: [251, 191, 36, 255],
  sound: [20, 184, 166, 255],
  spearPickup: [34, 211, 238, 255],
  spearTurret: [6, 182, 212, 255],
};

export function generatedEntityMarkersTilesetSource(): string {
  return jsonSource({
    columns: ENTITY_MARKER_TYPES.length,
    image: ENTITY_MARKERS_IMAGE,
    imageheight: AUTHORING_TILE_SIZE,
    imagewidth: AUTHORING_TILE_SIZE * ENTITY_MARKER_TYPES.length,
    margin: 0,
    name: "entity_markers",
    spacing: 0,
    tilecount: ENTITY_MARKER_TYPES.length,
    tiledversion: "1.11.2",
    tileheight: AUTHORING_TILE_SIZE,
    tiles: ENTITY_MARKER_TYPES.map((type, id) => ({
      id,
      type,
      properties: entityMarkerTileProperties(type),
    })),
    tilewidth: AUTHORING_TILE_SIZE,
    type: "tileset",
    version: "1.10",
  });
}

export function generatedEntityMarkersImage(): Uint8Array {
  const width = AUTHORING_TILE_SIZE * ENTITY_MARKER_TYPES.length;
  const height = AUTHORING_TILE_SIZE;
  const pixels = new Uint8Array(width * height * 4);
  for (let index = 0; index < ENTITY_MARKER_TYPES.length; index++) {
    drawEntityMarker(pixels, width, index, ENTITY_MARKER_TYPES[index]!);
  }
  return encodePng(width, height, pixels);
}

function entityMarkerTileProperties(type: EntityMarkerType): readonly TiledProperty[] {
  switch (type) {
    case "player":
      return [
        property("prefab", type, "Prefab"),
        property("facing", "north", "Facing"),
      ];
    case "npc":
      return [
        property("prefab", type, "Prefab"),
        property("facing", "north", "Facing"),
        property("displayName", "john", "DisplayName"),
      ];
    case "enemy":
      return [
        property("prefab", type, "Prefab"),
        property("facing", "north", "Facing"),
        property("archetype", "meleeDog", "EnemyArchetype"),
      ];
    case "door":
      return [property("prefab", type, "Prefab")];
    case "key":
      return [
        property("prefab", type, "Prefab"),
        property("color", "red", "KeyColor"),
      ];
    case "uplinkCode":
      return [property("prefab", type, "Prefab")];
    case "spearPickup":
      return [property("prefab", type, "Prefab")];
    case "spearTurret":
      return [property("prefab", type, "Prefab")];
    case "uplinkTerminal":
      return [
        property("prefab", type, "Prefab"),
        property("goto", VICTORY_GOTO),
      ];
    case "weaponPickup":
      return [
        property("prefab", type, "Prefab"),
        property("slot", 2),
      ];
    case "item":
      return [
        property("prefab", type, "Prefab"),
        property("item", "healthPatch", "ItemKind"),
        property("amount", 1),
      ];
    case "decoration":
      return [
        property("prefab", type, "Prefab"),
        property("decoration", "serverPile", "DecorationKind"),
      ];
    case "light":
      return [
        property("prefab", type, "Prefab"),
        property("color", "#ffffff"),
        property("radius", 5),
      ];
    case "sound":
      return [
        property("prefab", type, "Prefab"),
        property("soundId", "ambientHum", "SoundId"),
        property("radius", 5),
      ];
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unhandled entity marker type "${_exhaustive}".`);
    }
  }
}

function drawEntityMarker(
  target: Uint8Array,
  targetWidth: number,
  tileIndex: number,
  type: EntityMarkerType,
): void {
  const left = tileIndex * AUTHORING_TILE_SIZE;
  fillRect(target, targetWidth, left, 0, AUTHORING_TILE_SIZE, AUTHORING_TILE_SIZE, MARKER_BACKGROUND);
  drawTileBorder(target, targetWidth, tileIndex, ENTITY_MARKER_TYPES.length, MARKER_COLORS[type]);
  const accent = MARKER_COLORS[type];
  switch (type) {
    case "player":
      drawMarkerGlyph(target, targetWidth, left, [
        ".......##.......",
        "......####......",
        ".....######.....",
        "....########....",
        ".......##.......",
        ".......##.......",
        "......####......",
        ".....######.....",
        "....########....",
        "...##########...",
        ".......##.......",
        ".......##.......",
      ], accent);
      break;
    case "npc":
      drawMarkerGlyph(target, targetWidth, left, [
        "......####......",
        ".....######.....",
        ".....######.....",
        "......####......",
        ".......##.......",
        ".....######.....",
        "....########....",
        "...##########...",
        "......####......",
        "......####......",
        ".....######.....",
        "....##....##....",
      ], accent);
      break;
    case "enemy":
      drawMarkerGlyph(target, targetWidth, left, [
        "....##....##....",
        "...####..####...",
        "..##############",
        "..##..####..##..",
        "..##############",
        "...############.",
        "....##########..",
        ".....########...",
        "......######....",
        ".......####.....",
        "........##......",
        ".......####.....",
      ], accent);
      break;
    case "door":
      drawMarkerGlyph(target, targetWidth, left, [
        "...##########...",
        "...##......##...",
        "...##......##...",
        "...##......##...",
        "...##....#.##...",
        "...##......##...",
        "...##......##...",
        "...##......##...",
        "...##......##...",
        "...##......##...",
        "...##......##...",
        "...##########...",
      ], accent);
      break;
    case "key":
      drawMarkerGlyph(target, targetWidth, left, [
        "......####......",
        ".....######.....",
        ".....######.....",
        "......####......",
        ".......##.......",
        ".......##.......",
        ".......####.....",
        ".......##.......",
        ".......####.....",
        ".......##.......",
        ".......##.......",
        ".......##.......",
      ], accent);
      break;
    case "uplinkCode":
      drawMarkerGlyph(target, targetWidth, left, [
        "....##########..",
        "...##........##.",
        "...##..####..##.",
        "...##.##..##.##.",
        "...##.##..##.##.",
        "...##..####..##.",
        "...##........##.",
        "....##########..",
        "......####......",
        "......####......",
        "......####......",
        "......####......",
      ], accent);
      break;
    case "uplinkTerminal":
      drawMarkerGlyph(target, targetWidth, left, [
        "...############.",
        "...##........##.",
        "...##..####..##.",
        "...##..####..##.",
        "...##........##.",
        "...##..####..##.",
        "...##........##.",
        "...############.",
        "......####......",
        "......####......",
        "....########....",
        "...##########...",
      ], accent);
      break;
    case "weaponPickup":
      drawMarkerGlyph(target, targetWidth, left, [
        "..............##",
        ".............##.",
        "............##..",
        "...........##...",
        "..........##....",
        ".........##.....",
        "........##......",
        ".......##.......",
        "......##........",
        ".....##.........",
        "....##..........",
        "...##...........",
      ], accent);
      break;
    case "item":
      drawMarkerGlyph(target, targetWidth, left, [
        "......####......",
        ".....######.....",
        "....########....",
        "...##########...",
        "...##......##...",
        "...##......##...",
        "...##......##...",
        "...##......##...",
        "...##########...",
        "....########....",
        ".....######.....",
        "......####......",
      ], accent);
      break;
    case "decoration":
      drawMarkerGlyph(target, targetWidth, left, [
        "....##########..",
        "...############.",
        "...##..##..##...",
        "...##..##..##...",
        "...############.",
        "...##..##..##...",
        "...##..##..##...",
        "...############.",
        "....##########..",
        "......####......",
        "......####......",
        "....########....",
      ], accent);
      break;
    case "light":
      drawMarkerGlyph(target, targetWidth, left, [
        ".......##.......",
        "......####......",
        ".....#.####.....",
        "....########....",
        "...##########...",
        "...##########...",
        "....########....",
        ".....######.....",
        "......####......",
        ".......##.......",
        "......####......",
        ".....######.....",
      ], accent);
      break;
    case "sound":
      drawMarkerGlyph(target, targetWidth, left, [
        "....##..........",
        "...####.........",
        "..######...##...",
        ".########..###..",
        ".########...###.",
        ".########...###.",
        ".########...###.",
        ".########..###..",
        "..######...##...",
        "...####.........",
        "....##..........",
        "................",
      ], accent);
      break;
    case "spearPickup":
      drawMarkerGlyph(target, targetWidth, left, [
        "..............##",
        ".............###",
        "............##.#",
        "...........##...",
        "..........##....",
        ".........##.....",
        "........##......",
        ".......##.......",
        "......##........",
        ".....##.........",
        "....##..........",
        "...##...........",
      ], accent);
      break;
    case "spearTurret":
      drawMarkerGlyph(target, targetWidth, left, [
        "...##......##...",
        "....##....##....",
        ".....######.....",
        "......####......",
        ".......##.......",
        "......####......",
        ".....######.....",
        "....########....",
        "...##########...",
        "....########....",
        ".....######.....",
        "....########....",
      ], accent);
      break;
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unhandled entity marker type "${_exhaustive}".`);
    }
  }
}

function drawMarkerGlyph(
  target: Uint8Array,
  targetWidth: number,
  left: number,
  rows: readonly string[],
  color: readonly [number, number, number, number],
): void {
  const top = Math.floor((AUTHORING_TILE_SIZE - rows.length) / 2);
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row]!;
    for (let column = 0; column < line.length; column++) {
      if (line[column] !== "#") continue;
      setPixel(target, targetWidth, left + column, top + row, color);
    }
  }
}
