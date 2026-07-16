import { createCodeRegistry } from "@/src/game/content/code_registry.ts";
import {
  type DoorDef,
  ENTITY_SCHEMA,
  KeyColor,
  type KeyColor as KeyColorType,
  prefabBlocksMovement,
  type UplinkTerminalDef,
} from "@/src/game/content/map_entities.ts";
import { CARDINAL_DELTAS } from "turn-based-engine/crawler";
import {
  createGameMap,
  type GameMap,
  mapDimensions,
  terrainAt,
  terrainBlocksMovement,
  terrainIsBarrier,
} from "@/src/game/world/map.ts";
import { z } from "zod";

const VICTORY_DESTINATION = "victory";

export type CampaignDestination =
  | { readonly kind: "victory" }
  | { readonly kind: "map"; readonly map: GameMap };

export type Campaign = {
  readonly startMap: GameMap;
  readonly maps: readonly GameMap[];
  map(name: string): GameMap;
  codeForDestination(destination: string): number;
  destinationForCode(code: number): CampaignDestination;
};

export function compileCampaign(source: unknown): Campaign {
  const content = parseCampaignContent(source);
  if (content.maps.some((map) => map.name === VICTORY_DESTINATION)) {
    throw new Error(
      `Invalid campaign maps:\nMap name "${VICTORY_DESTINATION}" is reserved for the victory destination.`,
    );
  }

  const maps = content.maps.map(gameMapFromContent);
  const validationIssues = validateGameMaps(maps);
  if (validationIssues.length > 0) {
    throw new Error(`Invalid campaign maps:\n${validationIssues.join("\n")}`);
  }

  const mapsByName: ReadonlyMap<string, GameMap> = new Map(maps.map((map) => [map.name, map]));
  const startMap = mapsByName.get(content.startMapName);
  if (startMap === undefined) {
    throw new Error(`Invalid campaign maps:\nUnknown start map "${content.startMapName}".`);
  }

  const destinations = createCodeRegistry("terminal destination", [
    VICTORY_DESTINATION,
    ...maps.map((map) => map.name),
  ]);

  return {
    startMap,
    maps,
    map(name: string): GameMap {
      const map = mapsByName.get(name);
      if (map === undefined) throw new Error(`Unknown map: ${name}`);
      return map;
    },
    codeForDestination(destination: string): number {
      if (!destinations.has(destination)) {
        throw new Error(`Unknown terminal destination "${destination}".`);
      }
      return destinations.encode(destination);
    },
    destinationForCode(code: number): CampaignDestination {
      const goto = destinations.decode(code);
      if (goto === VICTORY_DESTINATION) return { kind: "victory" };

      const map = mapsByName.get(goto);
      if (map === undefined) throw new Error(`Unknown map: ${goto}`);
      return { kind: "map", map };
    },
  };
}

function gameMapFromContent(map: MapContent): GameMap {
  return createGameMap(map.name, map.tiles, map.entities);
}

const NON_NEGATIVE_INTEGER_SCHEMA = z.number().int().nonnegative();

const MAP_CONTENT_SCHEMA = z.object({
  name: z.string().min(1),
  tiles: z.array(z.array(NON_NEGATIVE_INTEGER_SCHEMA).nonempty()).nonempty(),
  entities: z.array(ENTITY_SCHEMA),
}).strict();

const CAMPAIGN_CONTENT_SCHEMA = z.object({
  startMapName: z.string().min(1),
  maps: z.array(MAP_CONTENT_SCHEMA).nonempty(),
}).strict()
  .refine((data) => new Set(data.maps.map((map) => map.name)).size === data.maps.length, {
    message: "map names must be unique",
    path: ["maps"],
  });

type MapContent = z.infer<typeof MAP_CONTENT_SCHEMA>;
type CampaignContent = z.infer<typeof CAMPAIGN_CONTENT_SCHEMA>;

function parseCampaignContent(data: unknown): CampaignContent {
  const parsed = CAMPAIGN_CONTENT_SCHEMA.safeParse(data);
  if (parsed.success) return parsed.data;
  throw new Error(`Invalid campaign content:\n${formatZodError(parsed.error)}`);
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("\n");
}

type ReachabilityResult = {
  readonly reachableKeyMask: number;
  readonly terminalReachableWithCode: boolean;
  readonly turretReachable: boolean;
};

type ReachabilityState = {
  readonly x: number;
  readonly y: number;
  readonly keyMask: number;
  readonly hasUplinkCode: boolean;
  readonly hasSpear: boolean;
};

const KEY_BITS: Readonly<Record<KeyColorType, number>> = {
  [KeyColor.Red]: 1 << 0,
  [KeyColor.Blue]: 1 << 1,
  [KeyColor.Yellow]: 1 << 2,
};

function validateGameMaps(maps: readonly GameMap[]): readonly string[] {
  const issues: string[] = [];
  const mapNames = new Set(maps.map((map) => map.name));

  for (const map of maps) {
    issues.push(...validateGameMap(map, mapNames));
  }

  return issues;
}

function validateGameMap(map: GameMap, mapNames: ReadonlySet<string>): readonly string[] {
  const issues: string[] = [];
  const { width, height } = mapDimensions(map);
  const playerSpawns = map.entities.filter((entity) => entity.prefab === "player");
  const blockersByTile = new Map<string, string>();

  if (playerSpawns.length !== 1) {
    issues.push(`${map.name}: expected exactly one player spawn, found ${playerSpawns.length}.`);
  }

  for (const entity of map.entities) {
    if (!inBounds(entity.x, entity.y, width, height)) {
      issues.push(`${map.name}: ${entity.prefab} at (${entity.x},${entity.y}) is outside the ${width}x${height} map.`);
      continue;
    }

    const terrain = terrainAt(map, entity.x, entity.y);
    if (entity.prefab !== "light" && entity.prefab !== "sound" && terrainBlocksMovement(terrain)) {
      issues.push(`${map.name}: ${entity.prefab} at (${entity.x},${entity.y}) is placed on blocking terrain.`);
    }

    if (prefabBlocksMovement(entity.prefab)) {
      const tile = tileKey(entity.x, entity.y);
      const existing = blockersByTile.get(tile);
      if (existing === undefined) {
        blockersByTile.set(tile, entity.prefab);
      } else {
        issues.push(`${map.name}: ${entity.prefab} at (${entity.x},${entity.y}) overlaps blocking ${existing}.`);
      }
    }
  }

  for (const door of doorDefs(map)) {
    if (!validThinTerrainSpan(map, door.x, door.y)) {
      issues.push(
        `${map.name}: door at (${door.x},${door.y}) must sit between exactly one opposite pair of blocking wall tiles.`,
      );
    }
  }

  for (const [x, y] of barrierTiles(map)) {
    if (!validBarrierTerrainSpan(map, x, y)) {
      issues.push(
        `${map.name}: barrier terrain at (${x},${y}) must be anchored to movement-blocking terrain on at least one side, and must not sit in a four-way blocking cross.`,
      );
    }
  }

  for (const terminal of terminalDefs(map)) {
    if (terminal.goto !== VICTORY_DESTINATION && !mapNames.has(terminal.goto)) {
      issues.push(
        `${map.name}: uplink terminal at (${terminal.x},${terminal.y}) points to unknown map "${terminal.goto}".`,
      );
    }
  }

  if (playerSpawns.length !== 1 || hasOutOfBoundsEntity(map, width, height)) {
    return issues;
  }

  const reachability = evaluateReachability(map, playerSpawns[0]!);
  for (const door of lockedDoorDefs(map)) {
    if (door.color === undefined) {
      issues.push(`${map.name}: locked door at (${door.x},${door.y}) is missing a key color.`);
      continue;
    }

    if ((reachability.reachableKeyMask & keyBit(door.color)) === 0) {
      issues.push(
        `${map.name}: locked ${door.color} door at (${door.x},${door.y}) has no obtainable ${door.color} key before it is needed.`,
      );
    }
  }

  if (!reachability.terminalReachableWithCode && !reachability.turretReachable) {
    const message = terminalDefs(map).length === 0 && map.entities.some((entity) => entity.prefab === "spearTurret") ?
      `${map.name}: no spear turret is reachable with required keys.` :
      `${map.name}: no uplink terminal is reachable after collecting an uplink code and required keys.`;
    issues.push(message);
  }

  return issues;
}

function evaluateReachability(
  map: GameMap,
  start: { readonly x: number; readonly y: number },
): ReachabilityResult {
  const indexes = reachabilityIndexes(map);
  const queue: ReachabilityState[] = [];
  const visited = new Set<string>();
  let reachableKeyMask = 0;
  let terminalReachableWithCode = false;
  let turretReachable = false;

  const enqueue = (state: ReachabilityState): void => {
    if (!canStandOn(map, indexes, state.x, state.y, state.keyMask)) return;

    const collected = collectAt(indexes, state);
    const visitKey = stateKey(collected);
    if (visited.has(visitKey)) return;

    visited.add(visitKey);
    queue.push(collected);
  };

  enqueue({
    x: start.x,
    y: start.y,
    keyMask: 0,
    hasUplinkCode: false,
    hasSpear: false,
  });

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const state = queue[cursor]!;
    reachableKeyMask |= state.keyMask;
    if (state.hasUplinkCode && canUseAdjacentTerminal(indexes, state)) {
      terminalReachableWithCode = true;
    }
    if (canUseAdjacentTurret(indexes, state)) turretReachable = true;

    for (const delta of CARDINAL_DELTAS) {
      enqueue({
        x: state.x + delta.dx,
        y: state.y + delta.dy,
        keyMask: state.keyMask,
        hasUplinkCode: state.hasUplinkCode,
        hasSpear: state.hasSpear,
      });
    }
  }

  return { reachableKeyMask, terminalReachableWithCode, turretReachable };
}

type ReachabilityIndexes = {
  readonly keyMasksByTile: ReadonlyMap<string, number>;
  readonly codeTiles: ReadonlySet<string>;
  readonly spearTiles: ReadonlySet<string>;
  readonly terminalTiles: ReadonlyMap<string, boolean>;
  readonly turretTiles: ReadonlySet<string>;
  readonly doorsByTile: ReadonlyMap<string, readonly DoorDef[]>;
};

function reachabilityIndexes(map: GameMap): ReachabilityIndexes {
  const keyMasksByTile = new Map<string, number>();
  const codeTiles = new Set<string>();
  const spearTiles = new Set<string>();
  const terminalTiles = new Map<string, boolean>();
  const turretTiles = new Set<string>();
  const doorsByTile = new Map<string, DoorDef[]>();

  for (const entity of map.entities) {
    const prefab = entity.prefab;
    switch (prefab) {
      case "key": {
        const tile = tileKey(entity.x, entity.y);
        keyMasksByTile.set(tile, (keyMasksByTile.get(tile) ?? 0) | keyBit(entity.color));
        break;
      }
      case "uplinkCode":
        codeTiles.add(tileKey(entity.x, entity.y));
        break;
      case "spearPickup":
        spearTiles.add(tileKey(entity.x, entity.y));
        break;
      case "uplinkTerminal":
        terminalTiles.set(tileKey(entity.x, entity.y), entity.requiresSpear === true);
        break;
      case "spearTurret":
        turretTiles.add(tileKey(entity.x, entity.y));
        break;
      case "door": {
        const tile = tileKey(entity.x, entity.y);
        const doors = doorsByTile.get(tile);
        if (doors === undefined) {
          doorsByTile.set(tile, [entity]);
        } else {
          doors.push(entity);
        }
        break;
      }
      // Blocking actors are intentionally excluded: the player vacates its spawn,
      // enemies move and can be defeated, and NPCs are relocated by story events
      // (e.g. talking to John fires a moveEntity action). None form a permanent
      // barrier, so modelling them as impassable would reject completable maps.
      case "enemy":
      case "npc":
      case "item":
      case "decoration":
      case "light":
      case "player":
      case "sound":
      case "weaponPickup":
        break;
      default: {
        const _exhaustive: never = prefab;
        return _exhaustive;
      }
    }
  }

  return { keyMasksByTile, codeTiles, spearTiles, terminalTiles, turretTiles, doorsByTile };
}

function canStandOn(
  map: GameMap,
  indexes: ReachabilityIndexes,
  x: number,
  y: number,
  keyMask: number,
): boolean {
  const terrain = terrainAt(map, x, y);
  if (terrainBlocksMovement(terrain)) return false;

  const tile = tileKey(x, y);
  if (indexes.terminalTiles.has(tile)) return false;
  if (indexes.turretTiles.has(tile)) return false;

  for (const door of indexes.doorsByTile.get(tile) ?? []) {
    if (door.locked === true && (door.color === undefined || (keyMask & keyBit(door.color)) === 0)) {
      return false;
    }
  }

  return true;
}

function collectAt(indexes: ReachabilityIndexes, state: ReachabilityState): ReachabilityState {
  const tile = tileKey(state.x, state.y);
  const keyMask = state.keyMask | (indexes.keyMasksByTile.get(tile) ?? 0);
  const hasUplinkCode = state.hasUplinkCode || indexes.codeTiles.has(tile);
  const hasSpear = state.hasSpear || indexes.spearTiles.has(tile);

  if (keyMask === state.keyMask && hasUplinkCode === state.hasUplinkCode && hasSpear === state.hasSpear) {
    return state;
  }
  return { ...state, keyMask, hasUplinkCode, hasSpear };
}

function canUseAdjacentTerminal(indexes: ReachabilityIndexes, state: ReachabilityState): boolean {
  return CARDINAL_DELTAS.some((delta) => {
    const requiresSpear = indexes.terminalTiles.get(tileKey(state.x + delta.dx, state.y + delta.dy));
    if (requiresSpear === undefined) return false;
    return !requiresSpear || state.hasSpear;
  });
}

function canUseAdjacentTurret(indexes: ReachabilityIndexes, state: ReachabilityState): boolean {
  return CARDINAL_DELTAS.some((delta) => indexes.turretTiles.has(tileKey(state.x + delta.dx, state.y + delta.dy)));
}

function hasOutOfBoundsEntity(map: GameMap, width: number, height: number): boolean {
  return map.entities.some((entity) => !inBounds(entity.x, entity.y, width, height));
}

function terminalDefs(map: GameMap): readonly UplinkTerminalDef[] {
  return map.entities.filter(isUplinkTerminalDef);
}

function doorDefs(map: GameMap): readonly DoorDef[] {
  return map.entities.filter(isDoorDef);
}

function lockedDoorDefs(map: GameMap): readonly DoorDef[] {
  return map.entities.filter(isLockedDoorDef);
}

function validThinTerrainSpan(map: GameMap, x: number, y: number): boolean {
  const horizontalWalls = terrainBlocksMovement(terrainAt(map, x - 1, y)) &&
    terrainBlocksMovement(terrainAt(map, x + 1, y));
  const verticalWalls = terrainBlocksMovement(terrainAt(map, x, y - 1)) &&
    terrainBlocksMovement(terrainAt(map, x, y + 1));
  return horizontalWalls !== verticalWalls;
}

/** Barriers may form continuous fence runs and T-junction corners, not only doorway spans. */
function validBarrierTerrainSpan(map: GameMap, x: number, y: number): boolean {
  const left = terrainBlocksMovement(terrainAt(map, x - 1, y));
  const right = terrainBlocksMovement(terrainAt(map, x + 1, y));
  const up = terrainBlocksMovement(terrainAt(map, x, y - 1));
  const down = terrainBlocksMovement(terrainAt(map, x, y + 1));
  const horizontalPair = left && right;
  const verticalPair = up && down;
  if (horizontalPair && verticalPair) return false;
  return horizontalPair || verticalPair || left || right || up || down;
}

function barrierTiles(map: GameMap): readonly (readonly [number, number])[] {
  const { width, height } = mapDimensions(map);
  const tiles: [number, number][] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (terrainIsBarrier(terrainAt(map, x, y))) tiles.push([x, y]);
    }
  }
  return tiles;
}

function isUplinkTerminalDef(entity: GameMap["entities"][number]): entity is UplinkTerminalDef {
  return entity.prefab === "uplinkTerminal";
}

function isDoorDef(entity: GameMap["entities"][number]): entity is DoorDef {
  return entity.prefab === "door";
}

function isLockedDoorDef(entity: GameMap["entities"][number]): entity is DoorDef {
  return entity.prefab === "door" && entity.locked === true;
}

function keyBit(color: KeyColorType): number {
  return KEY_BITS[color];
}

function stateKey(state: ReachabilityState): string {
  return `${tileKey(state.x, state.y)},${state.keyMask},${state.hasUplinkCode ? 1 : 0},${state.hasSpear ? 1 : 0}`;
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height;
}
