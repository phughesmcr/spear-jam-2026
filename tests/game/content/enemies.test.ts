import { ENEMY_ARCHETYPE_KEYS, EnemyArchetypeCode, enemyAttackFacesTarget } from "@/src/game/content/enemies.ts";
import { AttackPattern } from "@/src/game/model/attack.ts";
import { assertEquals } from "@std/assert";

Deno.test("enemy vocabulary preserves compact codes and authored key order", () => {
  assertEquals(EnemyArchetypeCode, {
    MeleeDog: 1,
    Gunslinger: 2,
    NetworkNeophyte: 3,
    SystemSentinel: 4,
    AgenticAcolyte: 5,
  });
  assertEquals(ENEMY_ARCHETYPE_KEYS, [
    "meleeDog",
    "gunslinger",
    "networkNeophyte",
    "systemSentinel",
    "agenticAcolyte",
  ]);
});

Deno.test("line attacks face their target while adjacent attacks do not", () => {
  assertEquals(enemyAttackFacesTarget(AttackPattern.Line), true);
  assertEquals(enemyAttackFacesTarget(AttackPattern.Adjacent), false);
});
