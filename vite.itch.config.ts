import { join, resolve } from "@std/path";
import { defineConfig } from "vite";

const projectRoot = import.meta.dirname!;
const engineRoot = resolve(projectRoot, "../turn-based-engine/src");
const webEngineRoot = resolve(projectRoot, "../turn-based-web-engine/src");

/** Static client build for itch.io HTML5 hosting (relative asset URLs). */
export default defineConfig({
  base: "./",
  root: join(projectRoot, "itch"),
  publicDir: join(projectRoot, "static"),
  build: {
    outDir: join(projectRoot, "dist/itch"),
    emptyOutDir: true,
    target: "esnext",
    assetsDir: "assets",
  },
  resolve: {
    alias: [
      { find: "@/", replacement: `${projectRoot}/` },
      {
        find: "turn-based-engine/crawler",
        replacement: join(engineRoot, "crawler/mod.ts"),
      },
      {
        find: "turn-based-engine/ecs",
        replacement: join(engineRoot, "ecs/mod.ts"),
      },
      {
        find: "turn-based-engine/simulation",
        replacement: join(engineRoot, "simulation/mod.ts"),
      },
      {
        find: "turn-based-web-engine/audio",
        replacement: join(webEngineRoot, "audio/mod.ts"),
      },
      {
        find: "turn-based-web-engine/canvas",
        replacement: join(webEngineRoot, "canvas/mod.ts"),
      },
      {
        find: "turn-based-web-engine/input",
        replacement: join(webEngineRoot, "input/mod.ts"),
      },
      {
        find: "turn-based-web-engine/raycast",
        replacement: join(webEngineRoot, "raycast/mod.ts"),
      },
    ],
  },
});
