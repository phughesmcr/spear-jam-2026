import { assertEquals, assertThrows } from "@std/assert";
import {
  commandSlotForCode,
  EnemyArchetype,
  enemyArchetypeForCode,
  ItemKind,
  itemKindForCode,
} from "@/src/ecs/components.ts";

Deno.test("itemKindForCode validates persisted item kind values", () => {
  assertEquals(itemKindForCode(ItemKind.HealthPatch), ItemKind.HealthPatch);
  assertEquals(itemKindForCode(ItemKind.Key), ItemKind.Key);
  assertThrows(() => itemKindForCode(99), Error, "Unknown item kind");
});

Deno.test("enemyArchetypeForCode validates persisted enemy archetype values", () => {
  assertEquals(enemyArchetypeForCode(EnemyArchetype.MeleeDog), EnemyArchetype.MeleeDog);
  assertEquals(enemyArchetypeForCode(EnemyArchetype.AgenticAcolyte), EnemyArchetype.AgenticAcolyte);
  assertThrows(() => enemyArchetypeForCode(99), Error, "Unknown enemy archetype");
});

Deno.test("commandSlotForCode validates command slot values", () => {
  assertEquals(commandSlotForCode(1), 1);
  assertEquals(commandSlotForCode(3), 3);
  assertThrows(() => commandSlotForCode(99), Error, "Unknown weapon slot");
});
