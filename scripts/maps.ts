import { checkMaps } from "./maps/check.ts";
import { compileMaps } from "./maps/compile.ts";
import { playCurrentMap } from "./maps/play.ts";
import { createNewMap } from "./maps/scaffold.ts";
import { syncAuthoring } from "./maps/sync.ts";

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    Deno.exit(1);
  });
}

export async function main(args: readonly string[] = Deno.args): Promise<void> {
  const command = args[0];
  switch (command) {
    case "check":
      await checkMaps();
      return;
    case "compile":
      await compileMaps();
      return;
    case "play":
      await playCurrentMap(args.slice(1));
      return;
    case "sync-authoring":
      await syncAuthoring();
      return;
    case "new":
      await createNewMap(args.slice(1));
      return;
    default:
      throw new Error("Usage: deno run -A scripts/maps.ts check|compile|play|sync-authoring|new");
  }
}
