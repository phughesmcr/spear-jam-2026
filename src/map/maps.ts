import compiledMapsData from "@/src/map/compiled_maps.json" with { type: "json" };
import { ENTITY_SCHEMA } from "@/src/map/entity_descriptors.ts";
import { createGameMap, type GameMap, VICTORY_GOTO } from "@/src/map/map.ts";
import { validateGameMaps } from "@/src/map/map_validation.ts";
import { createCodeRegistry } from "@/src/utils/code_registry.ts";
import { z } from "zod";

export type LoadedGameMaps = {
  readonly startMapName: string;
  readonly gameMaps: readonly GameMap[];
};

const INTEGER_SCHEMA = z.number().int();
const NON_NEGATIVE_INTEGER_SCHEMA = INTEGER_SCHEMA.nonnegative();

const COMPILED_MAP_SCHEMA = z.object({
  name: z.string().min(1),
  tiles: z.array(z.array(NON_NEGATIVE_INTEGER_SCHEMA).nonempty()).nonempty(),
  entities: z.array(ENTITY_SCHEMA),
}).strict();

const COMPILED_MAPS_SCHEMA = z.object({
  startMapName: z.string().min(1),
  maps: z.array(COMPILED_MAP_SCHEMA).nonempty(),
}).strict()
  .refine((data) => data.maps.some((map) => map.name === data.startMapName), {
    message: "startMapName must match a compiled map name",
    path: ["startMapName"],
  })
  .refine((data) => new Set(data.maps.map((map) => map.name)).size === data.maps.length, {
    message: "map names must be unique",
    path: ["maps"],
  });

type CompiledMap = z.infer<typeof COMPILED_MAP_SCHEMA>;

const LOADED_GAME_MAPS = loadGameMapsData(compiledMapsData);

export const START_MAP_NAME = LOADED_GAME_MAPS.startMapName;
export const GAME_MAPS = LOADED_GAME_MAPS.gameMaps;

const MAPS: ReadonlyMap<string, GameMap> = new Map(GAME_MAPS.map((map) => [map.name, map]));

/** Victory first, then campaign maps in load order — codes are 1-based and append-only. */
const TERMINAL_DESTINATION_REGISTRY = createCodeRegistry("terminal destination", [
  VICTORY_GOTO,
  ...GAME_MAPS.map((map) => map.name),
]);

export function terminalDestinationCode(goto: string): number {
  if (!TERMINAL_DESTINATION_REGISTRY.has(goto)) {
    throw new Error(`Unknown terminal destination "${goto}".`);
  }
  return TERMINAL_DESTINATION_REGISTRY.encode(goto);
}

export function terminalDestinationForCode(code: number): string {
  return TERMINAL_DESTINATION_REGISTRY.decode(code);
}

export function getMap(name: string): GameMap {
  const map = MAPS.get(name);
  if (!map) throw new Error(`Unknown map: ${name}`);
  return map;
}

export function loadGameMapsData(data: unknown): LoadedGameMaps {
  const parsed = COMPILED_MAPS_SCHEMA.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Invalid compiled map data:\n${formatZodError(parsed.error)}`);
  }

  const gameMaps = parsed.data.maps.map(gameMapFromCompiledMap);
  const validationIssues = validateGameMaps(gameMaps);
  if (validationIssues.length > 0) {
    throw new Error(`Invalid compiled game maps:\n${validationIssues.join("\n")}`);
  }

  return {
    startMapName: parsed.data.startMapName,
    gameMaps,
  };
}

function gameMapFromCompiledMap(map: CompiledMap): GameMap {
  return createGameMap(map.name, map.tiles, map.entities);
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("\n");
}
