import { TEMPLATE_DEFINITIONS, templateFile } from "@/src/map/authoring/catalog.ts";
import { jsonSource } from "./json_utils.ts";

export function generatedTemplateSources(): Readonly<Record<string, string>> {
  return Object.fromEntries(TEMPLATE_DEFINITIONS.map((definition) => [
    definition.path,
    jsonSource(templateFile(definition)),
  ]));
}
