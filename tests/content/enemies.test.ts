import {
  DEFAULT_ENEMY_SENSES,
  EnemyArchetypeCode,
  enemyArchetypeForCode,
  enemyCatalogEntry,
} from "@/src/content/enemies.ts";
import { DisplayName } from "@/src/game/names.ts";
import { assertEquals, assertThrows } from "@std/assert";

Deno.test("enemyArchetypeForCode validates persisted enemy archetype values", () => {
  assertEquals(enemyArchetypeForCode(EnemyArchetypeCode.MeleeDog), EnemyArchetypeCode.MeleeDog);
  assertEquals(enemyArchetypeForCode(EnemyArchetypeCode.AgenticAcolyte), EnemyArchetypeCode.AgenticAcolyte);
  assertThrows(() => enemyArchetypeForCode(99), Error, "Unknown enemy archetype");
});

Deno.test("enemy catalog owns default display names", () => {
  assertEquals(enemyCatalogEntry(EnemyArchetypeCode.MeleeDog).displayName, DisplayName.DigitalDog);
  assertEquals(enemyCatalogEntry(EnemyArchetypeCode.SystemSentinel).displayName, DisplayName.SystemSentinel);
});

Deno.test("enemy catalog owns default senses", () => {
  assertEquals(DEFAULT_ENEMY_SENSES, { sightRadius: 5, hearingRadius: 7 });
  assertEquals(enemyCatalogEntry(EnemyArchetypeCode.MeleeDog).senses, {
    sightRadius: 4,
    hearingRadius: 7,
  });
  assertEquals(enemyCatalogEntry(EnemyArchetypeCode.Gunslinger).senses, {
    sightRadius: 5,
    hearingRadius: 6,
  });
  assertEquals(enemyCatalogEntry(EnemyArchetypeCode.SystemSentinel).senses, {
    sightRadius: 1,
    hearingRadius: 1,
  });
});
