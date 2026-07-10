import {
  AUTOMAP_DIR,
  ENTITY_MARKERS_IMAGE,
  ENTITY_MARKERS_TILESET,
  MAPS_DIR,
  TEMPLATE_DIR,
  TERRAIN_TILESETS_DIR,
  TILED_PROJECT_PATH,
} from "@/src/map/authoring/catalog.ts";
import { generatedAutomappingSources } from "./automap.ts";
import { generatedEntityMarkersImage, generatedEntityMarkersTilesetSource } from "./markers.ts";
import { generatedTemplateSources } from "./templates.ts";
import { generatedTerrainSources } from "./terrain_atlas.ts";
import { generatedTiledProjectSource } from "./tiled_project.ts";

export async function syncAuthoring(): Promise<void> {
  await Deno.writeTextFile(TILED_PROJECT_PATH, generatedTiledProjectSource());
  await Deno.writeTextFile(`${MAPS_DIR}/${ENTITY_MARKERS_TILESET}`, generatedEntityMarkersTilesetSource());
  await Deno.writeFile(`${MAPS_DIR}/${ENTITY_MARKERS_IMAGE}`, generatedEntityMarkersImage());

  await Deno.mkdir(TEMPLATE_DIR, { recursive: true });
  const expectedPaths = new Set<string>();
  for (const [path, source] of Object.entries(generatedTemplateSources())) {
    expectedPaths.add(path);
    await Deno.writeTextFile(path, source);
  }

  for await (const entry of Deno.readDir(TEMPLATE_DIR)) {
    if (!entry.isFile || !entry.name.endsWith(".tx")) continue;
    const path = `${TEMPLATE_DIR}/${entry.name}`;
    if (!expectedPaths.has(path)) await Deno.remove(path);
  }

  await Deno.mkdir(AUTOMAP_DIR, { recursive: true });
  const expectedAutomapPaths = new Set<string>();
  for (const [path, source] of Object.entries(generatedAutomappingSources())) {
    expectedAutomapPaths.add(path);
    await Deno.writeTextFile(path, source);
  }

  for await (const entry of Deno.readDir(AUTOMAP_DIR)) {
    if (!entry.isFile) continue;
    const path = `${AUTOMAP_DIR}/${entry.name}`;
    if (!expectedAutomapPaths.has(path)) await Deno.remove(path);
  }

  await Deno.mkdir(TERRAIN_TILESETS_DIR, { recursive: true });
  const expectedTerrainPaths = new Set<string>();
  const terrainSources = await generatedTerrainSources();
  for (const [path, source] of Object.entries(terrainSources)) {
    expectedTerrainPaths.add(path);
    if (typeof source === "string") {
      await Deno.writeTextFile(path, source);
    } else {
      await Deno.writeFile(path, source);
    }
  }

  for await (const entry of Deno.readDir(TERRAIN_TILESETS_DIR)) {
    if (!entry.isFile) continue;
    const path = `${TERRAIN_TILESETS_DIR}/${entry.name}`;
    if (!expectedTerrainPaths.has(path)) await Deno.remove(path);
  }

  try {
    await Deno.remove(`${MAPS_DIR}/texture_packs`, { recursive: true });
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  }
}
