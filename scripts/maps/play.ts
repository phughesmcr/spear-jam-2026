import type { TiledMap } from "@/src/map/authoring/tiled_types.ts";
import { compileMaps } from "./compile.ts";
import { parseJson } from "./json_utils.ts";

export async function playCurrentMap(args: readonly string[]): Promise<void> {
  const mapPath = args[0];
  if (mapPath === undefined || mapPath.length === 0) {
    throw new Error("Usage: deno task maps:play -- <map.tiled.json>");
  }

  await compileMaps();
  const mapName = await mapNameForTiledMapPath(mapPath);
  const command = new Deno.Command(Deno.execPath(), {
    args: ["task", "dev", "--", "--open", startMapUrlPath(mapName)],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await command.spawn().status;
  if (!status.success) throw new Error(`Dev server exited with code ${status.code}.`);
}

export async function mapNameForTiledMapPath(path: string): Promise<string> {
  return mapNameForTiledMap(path, parseJson<TiledMap>(path, await Deno.readTextFile(path)));
}

export function mapNameForTiledMap(path: string, map: TiledMap): string {
  const raw = map.properties?.find((candidate) => candidate.name === "name")?.value;
  if (typeof raw !== "string" || raw.length === 0) throw new Error(`${path}: missing string map name.`);
  return raw;
}

export function startMapUrlPath(mapName: string): string {
  return `/?map=${encodeURIComponent(mapName)}`;
}
