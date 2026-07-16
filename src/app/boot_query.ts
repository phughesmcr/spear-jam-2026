/** Query-string options shared by the Fresh route and the itch.io static shell. */
export interface BootQuery {
  seed: number;
  startMapName?: string;
  cheat: boolean;
}

export function bootQueryFromSearch(search: string): BootQuery {
  const params = new URLSearchParams(search);
  const seedParam = Number.parseInt(params.get("seed") ?? "42", 10);
  const map = params.get("map");
  return {
    seed: Number.isSafeInteger(seedParam) ? seedParam >>> 0 : 42,
    startMapName: map === null || map === "" ? undefined : map,
    cheat: params.has("cheat"),
  };
}
