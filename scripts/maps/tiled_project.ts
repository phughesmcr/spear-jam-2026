import {
  PROPERTY_TYPES,
  TILED_PROJECT_AUTOMAP_RULES_FILE,
  TILED_PROJECT_COMMANDS,
} from "@/src/map/authoring/catalog.ts";
import { jsonSource } from "./json_utils.ts";

export function generatedTiledProjectSource(): string {
  return jsonSource({
    automappingRulesFile: TILED_PROJECT_AUTOMAP_RULES_FILE,
    commands: TILED_PROJECT_COMMANDS,
    compatibilityVersion: 1100,
    extensionsPath: "extensions",
    folders: [
      ".",
      "automap",
      "terrain",
      "templates",
    ],
    properties: [],
    propertyTypes: PROPERTY_TYPES,
  });
}
