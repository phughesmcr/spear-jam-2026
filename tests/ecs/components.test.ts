import { assertEquals, assertThrows } from "@std/assert";
import { EnemyArchetype, enemyArchetypeForCode } from "@/src/ecs/components.ts";

Deno.test("enemyArchetypeForCode validates persisted enemy archetype values", () => {
  assertEquals(enemyArchetypeForCode(EnemyArchetype.MeleeDog), EnemyArchetype.MeleeDog);
  assertEquals(enemyArchetypeForCode(EnemyArchetype.AgenticAcolyte), EnemyArchetype.AgenticAcolyte);
  assertThrows(() => enemyArchetypeForCode(99), Error, "Unknown enemy archetype");
});
