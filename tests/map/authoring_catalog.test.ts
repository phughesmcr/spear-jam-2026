import { PROPERTY_TYPES, TEMPLATE_DEFINITIONS } from "@/src/map/authoring/catalog.ts";
import { PREFAB_AUTHORING_PROPERTY_NAMES } from "@/src/map/entity_descriptors.ts";
import { assertEquals } from "@std/assert";

// The Tiled authoring catalog (object classes + templates) carries data that ENTITY_DEFINITIONS
// does not — per-field defaults, enum-type references, colors — so it cannot be fully derived.
// These tests instead enforce the one thing that must stay in sync: every property *name* the
// catalog exposes for a prefab must be a real authoring property of that prefab. This catches the
// "add a field in one place, forget another" / typo / stale-name drift that nothing else guards.

function authoringPropertiesFor(prefab: string): ReadonlySet<string> | undefined {
  const table = PREFAB_AUTHORING_PROPERTY_NAMES as Readonly<Record<string, ReadonlySet<string>>>;
  return table[prefab];
}

function unknownNames(prefab: string, names: readonly string[]): readonly string[] {
  const authoring = authoringPropertiesFor(prefab);
  if (authoring === undefined) return [`<unknown prefab "${prefab}">`];
  return names.filter((name) => !authoring.has(name));
}

Deno.test("catalog object-class members only reference authored properties", () => {
  const drift: string[] = [];
  for (const propertyType of PROPERTY_TYPES) {
    if (propertyType.type !== "class") continue;
    if (!propertyType.useAs.includes("object")) continue;
    const memberNames = propertyType.members.map((member) => member.name);
    for (const name of unknownNames(propertyType.name, memberNames)) {
      drift.push(`class "${propertyType.name}" member "${name}"`);
    }
  }
  assertEquals(drift, []);
});

Deno.test("catalog template properties only reference authored properties", () => {
  const drift: string[] = [];
  for (const template of TEMPLATE_DEFINITIONS) {
    const propertyNames = template.properties.map((property) => property.name);
    for (const name of unknownNames(template.objectType, propertyNames)) {
      drift.push(`template "${template.path}" property "${name}"`);
    }
  }
  assertEquals(drift, []);
});

Deno.test("final chamber set-pieces have Tiled templates", () => {
  const paths = TEMPLATE_DEFINITIONS.map((template) => template.path);
  assertEquals(paths.includes("game_assets/maps/templates/decor_mainframe_core.tx"), true);
  assertEquals(paths.includes("game_assets/maps/templates/spear_turret.tx"), true);
});
