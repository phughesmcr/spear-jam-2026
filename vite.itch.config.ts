import { join, resolve } from "@std/path";
import { defineConfig } from "vite";

const projectRoot = import.meta.dirname!;
const engineRoot = resolve(projectRoot, "../turn-based-engine/src");

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
    ],
  },
});
