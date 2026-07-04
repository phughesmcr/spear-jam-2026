import { KeyColor, mapDimensions, terrainAt, VICTORY_GOTO } from "@/src/map/map.ts";
import type { DoorDef, GameMap, KeyColor as KeyColorType, UplinkTerminalDef } from "@/src/map/map.ts";
import { CARDINAL_DELTAS } from "@/src/grid/direction.ts";

type ReachabilityResult = {
  readonly reachableKeyMask: number;
  readonly terminalReachableWithCode: boolean;
};

type ReachabilityState = {
  readonly x: number;
  readonly y: number;
  readonly keyMask: number;
  readonly hasUplinkCode: boolean;
};

const KEY_BITS: Readonly<Record<KeyColorType, number>> = {
  [KeyColor.Red]: 1 << 0,
  [KeyColor.Blue]: 1 << 1,
  [KeyColor.Yellow]: 1 << 2,
};

export function validateGameMaps(maps: readonly GameMap[]): readonly string[] {
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

  if (playerSpawns.length !== 1) {
    issues.push(`${map.name}: expected exactly one player spawn, found ${playerSpawns.length}.`);
  }

  for (const entity of map.entities) {
    if (!inBounds(entity.x, entity.y, width, height)) {
      issues.push(`${map.name}: ${entity.prefab} at (${entity.x},${entity.y}) is outside the ${width}x${height} map.`);
      continue;
    }

    const terrain = terrainAt(map, entity.x, entity.y);
    if (terrain === undefined || terrain.blocking === true) {
      issues.push(`${map.name}: ${entity.prefab} at (${entity.x},${entity.y}) is placed on blocking terrain.`);
    }
  }

  for (const door of doorDefs(map)) {
    if (!validDoorway(map, door.x, door.y)) {
      issues.push(
        `${map.name}: door at (${door.x},${door.y}) must sit between exactly one opposite pair of blocking wall tiles.`,
      );
    }
  }

  for (const terminal of terminalDefs(map)) {
    if (terminal.goto !== VICTORY_GOTO && !mapNames.has(terminal.goto)) {
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

  if (!reachability.terminalReachableWithCode) {
    issues.push(
      `${map.name}: no uplink terminal is reachable after collecting an uplink code and required keys.`,
    );
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
  });

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const state = queue[cursor]!;
    reachableKeyMask |= state.keyMask;
    if (state.hasUplinkCode && touchesTerminal(indexes, state.x, state.y)) {
      terminalReachableWithCode = true;
    }

    for (const delta of CARDINAL_DELTAS) {
      enqueue({
        x: state.x + delta.dx,
        y: state.y + delta.dy,
        keyMask: state.keyMask,
        hasUplinkCode: state.hasUplinkCode,
      });
    }
  }

  return { reachableKeyMask, terminalReachableWithCode };
}

type ReachabilityIndexes = {
  readonly keyMasksByTile: ReadonlyMap<string, number>;
  readonly codeTiles: ReadonlySet<string>;
  readonly terminalTiles: ReadonlySet<string>;
  readonly doorsByTile: ReadonlyMap<string, readonly DoorDef[]>;
};

function reachabilityIndexes(map: GameMap): ReachabilityIndexes {
  const keyMasksByTile = new Map<string, number>();
  const codeTiles = new Set<string>();
  const terminalTiles = new Set<string>();
  const doorsByTile = new Map<string, DoorDef[]>();

  for (const entity of map.entities) {
    switch (entity.prefab) {
      case "key": {
        const tile = tileKey(entity.x, entity.y);
        keyMasksByTile.set(tile, (keyMasksByTile.get(tile) ?? 0) | keyBit(entity.color));
        break;
      }
      case "uplinkCode":
        codeTiles.add(tileKey(entity.x, entity.y));
        break;
      case "uplinkTerminal":
        terminalTiles.add(tileKey(entity.x, entity.y));
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
      case "enemy":
      case "item":
      case "npc":
      case "player":
      case "weaponPickup":
        break;
    }
  }

  return { keyMasksByTile, codeTiles, terminalTiles, doorsByTile };
}

function canStandOn(
  map: GameMap,
  indexes: ReachabilityIndexes,
  x: number,
  y: number,
  keyMask: number,
): boolean {
  const terrain = terrainAt(map, x, y);
  if (terrain === undefined || terrain.blocking === true) return false;

  const tile = tileKey(x, y);
  if (indexes.terminalTiles.has(tile)) return false;

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

  if (keyMask === state.keyMask && hasUplinkCode === state.hasUplinkCode) return state;
  return { ...state, keyMask, hasUplinkCode };
}

function touchesTerminal(indexes: ReachabilityIndexes, x: number, y: number): boolean {
  return CARDINAL_DELTAS.some((delta) => indexes.terminalTiles.has(tileKey(x + delta.dx, y + delta.dy)));
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

function validDoorway(map: GameMap, x: number, y: number): boolean {
  const horizontalWalls = terrainBlocks(map, x - 1, y) && terrainBlocks(map, x + 1, y);
  const verticalWalls = terrainBlocks(map, x, y - 1) && terrainBlocks(map, x, y + 1);
  return horizontalWalls !== verticalWalls;
}

function terrainBlocks(map: GameMap, x: number, y: number): boolean {
  const terrain = terrainAt(map, x, y);
  return terrain === undefined || terrain.blocking === true;
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
  return `${tileKey(state.x, state.y)},${state.keyMask},${state.hasUplinkCode ? 1 : 0}`;
}

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < width && y < height;
}
