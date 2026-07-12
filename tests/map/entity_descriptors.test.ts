import {
  ATTACK_PROPERTY_MAP,
  DECORATION_KINDS,
  ENTITY_DESCRIPTORS,
  PREFAB_AUTHORING_PROPERTY_NAMES,
} from "@/src/map/entity_descriptors.ts";
import { assertEquals } from "@std/assert";

const AUTHORING_ONLY_PROPERTIES = new Set(["prefab", "facing", ...Object.keys(ATTACK_PROPERTY_MAP)]);
const NORMALIZED_ONLY_FIELDS = new Set(["x", "y", "attack"]);

Deno.test("entity descriptors expose every authored property to the schema path", () => {
  const drift: string[] = [];
  for (const descriptor of ENTITY_DESCRIPTORS) {
    const accepted = new Set([
      ...descriptor.normalizedFields,
      ...NORMALIZED_ONLY_FIELDS,
      "dir",
    ]);
    for (const property of descriptor.authoringProperties) {
      if (AUTHORING_ONLY_PROPERTIES.has(property)) continue;
      if (property === "dir") continue;
      if (property in ATTACK_PROPERTY_MAP) continue;
      if (!accepted.has(property)) {
        drift.push(`${descriptor.prefab}: authored "${property}" has no normalized field`);
      }
    }
  }
  assertEquals(drift, []);
});

Deno.test("entity descriptors expose every normalized field to authors", () => {
  const drift: string[] = [];
  for (const descriptor of ENTITY_DESCRIPTORS) {
    const authoring = PREFAB_AUTHORING_PROPERTY_NAMES[descriptor.prefab];
    for (const field of descriptor.normalizedFields) {
      if (field === "attack") {
        const hasAttackAuthoring = [...authoring].some((property) => property in ATTACK_PROPERTY_MAP);
        if (!hasAttackAuthoring) {
          drift.push(`${descriptor.prefab}: normalized "attack" has no flat authoring properties`);
        }
        continue;
      }
      if (field === "dir") {
        if (!authoring.has("dir") && !authoring.has("facing")) {
          drift.push(`${descriptor.prefab}: normalized "dir" missing dir/facing authoring`);
        }
        continue;
      }
      if (!authoring.has(field)) {
        drift.push(`${descriptor.prefab}: normalized "${field}" missing from authoring properties`);
      }
    }
  }
  assertEquals(drift, []);
});

Deno.test("entity descriptors own movement-blocking traits", () => {
  assertEquals(
    ENTITY_DESCRIPTORS.filter((descriptor) => descriptor.blockingMovement).map((descriptor) => descriptor.prefab),
    ["player", "npc", "enemy", "door", "uplinkTerminal", "spearTurret"],
  );
});

Deno.test("final chamber set-pieces are available to map authors", () => {
  assertEquals(DECORATION_KINDS.includes("mainframeCore"), true);
  assertEquals(ENTITY_DESCRIPTORS.some((descriptor) => descriptor.prefab === "spearTurret"), true);
});

Deno.test("tree decorations are available to map authors", () => {
  assertEquals(DECORATION_KINDS.filter((kind) => kind.startsWith("tree")), ["tree1", "tree2", "tree3"]);
});
