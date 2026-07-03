import { assertEquals, assertThrows } from "@std/assert";
import { EnemyArchetype, enemyArchetypeForCode, enemyCatalogEntry } from "@/src/ecs/enemy_catalog.ts";
import { DisplayName } from "@/src/game/names.ts";

Deno.test("enemyArchetypeForCode validates persisted enemy archetype values", () => {
  assertEquals(enemyArchetypeForCode(EnemyArchetype.MeleeDog), EnemyArchetype.MeleeDog);
  assertEquals(enemyArchetypeForCode(EnemyArchetype.AgenticAcolyte), EnemyArchetype.AgenticAcolyte);
  assertThrows(() => enemyArchetypeForCode(99), Error, "Unknown enemy archetype");
});

Deno.test("enemy catalog owns default display names", () => {
  assertEquals(enemyCatalogEntry(EnemyArchetype.MeleeDog).displayName, DisplayName.DigitalDog);
  assertEquals(enemyCatalogEntry(EnemyArchetype.SystemSentinel).displayName, DisplayName.SystemSentinel);
});
