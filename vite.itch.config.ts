import path from "node:path";
import { defineConfig } from "vite";

const projectRoot = import.meta.dirname!;
const engineRoot = path.resolve(projectRoot, "../turn-based-engine/src");

/** Static client build for itch.io HTML5 hosting (relative asset URLs). */
export default defineConfig({
  base: "./",
  root: path.join(projectRoot, "itch"),
  publicDir: path.join(projectRoot, "static"),
  build: {
    outDir: path.join(projectRoot, "dist/itch"),
    emptyOutDir: true,
    target: "esnext",
    assetsDir: "assets",
  },
  resolve: {
    alias: [
      { find: "@/", replacement: `${projectRoot}/` },
      {
        find: "turn-based-engine/crawler",
        replacement: path.join(engineRoot, "crawler/mod.ts"),
      },
      {
        find: "turn-based-engine/ecs",
        replacement: path.join(engineRoot, "ecs/mod.ts"),
      },
    ],
  },
});
