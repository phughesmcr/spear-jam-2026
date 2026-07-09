import {
  DEFAULT_ENEMY_SENSES,
  EnemyArchetype,
  enemyArchetypeForCode,
  enemyCatalogEntry,
} from "@/src/ecs/enemy_catalog.ts";
import { DisplayName } from "@/src/game/names.ts";
import { assertEquals, assertThrows } from "@std/assert";

Deno.test("enemyArchetypeForCode validates persisted enemy archetype values", () => {
  assertEquals(enemyArchetypeForCode(EnemyArchetype.MeleeDog), EnemyArchetype.MeleeDog);
  assertEquals(enemyArchetypeForCode(EnemyArchetype.AgenticAcolyte), EnemyArchetype.AgenticAcolyte);
  assertThrows(() => enemyArchetypeForCode(99), Error, "Unknown enemy archetype");
});

Deno.test("enemy catalog owns default display names", () => {
  assertEquals(enemyCatalogEntry(EnemyArchetype.MeleeDog).displayName, DisplayName.DigitalDog);
  assertEquals(enemyCatalogEntry(EnemyArchetype.SystemSentinel).displayName, DisplayName.SystemSentinel);
});

Deno.test("enemy catalog owns default senses", () => {
  assertEquals(DEFAULT_ENEMY_SENSES, { sightRadius: 5, hearingRadius: 7 });
  assertEquals(enemyCatalogEntry(EnemyArchetype.MeleeDog).senses, {
    sightRadius: 4,
    hearingRadius: 7,
  });
  assertEquals(enemyCatalogEntry(EnemyArchetype.Gunslinger).senses, {
    sightRadius: 5,
    hearingRadius: 6,
  });
  assertEquals(enemyCatalogEntry(EnemyArchetype.SystemSentinel).senses, {
    sightRadius: 1,
    hearingRadius: 1,
  });
});
