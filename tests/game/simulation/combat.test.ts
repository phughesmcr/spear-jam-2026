import { EnemyArchetypeCode, enemyArchetypeKey } from "@/src/game/content/enemies.ts";
import { AttackPattern, AttackTargetMode } from "@/src/game/simulation/components.ts";
import type { AttackSchema } from "@/src/game/simulation/components.ts";
import { attackEntity, attackTargets, resolveAttack } from "@/src/game/simulation/combat.ts";
import { createDoor, createEnemy, createPlayer } from "@/src/game/simulation/prefabs.ts";
import { createRuntime } from "@/src/game/simulation/runtime.ts";
import { DisplayName } from "@/src/game/content/names.ts";
import { Direction } from "@/src/game/world/direction.ts";
import { flatTestMap } from "@/tests/game/simulation/helpers.ts";
import { assertEquals } from "@std/assert";

const ATTACK: AttackSchema = {
  minDamage: 2,
  maxDamage: 2,
  range: 4,
  attackBonus: 0,
  critThreshold: 20,
  critMultiplier: 2,
  pattern: AttackPattern.Line,
  targets: AttackTargetMode.First,
};

Deno.test("resolveAttack preserves miss, natural-20 hit, and critical damage rules", () => {
  assertEquals(resolveAttack(ATTACK, 15, () => 0), { type: "miss", roll: 1, total: 1 });
  assertEquals(resolveAttack(ATTACK, 99, () => 0.999), {
    type: "hit",
    roll: 20,
    total: 20,
    damage: 4,
    critical: true,
  });
});

Deno.test("line attacks target movement occupants and stop at effect-line doors", () => {
  const runtime = createRuntime(flatTestMap(7, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.East });
  const door = createDoor(runtime, { x: 2, y: 1 });
  const enemy = spawnEnemy(runtime, 3, 1);
  assertEquals(attackTargets(runtime, player, ATTACK, (entity) => entity === enemy), []);

  runtime.crawler.setBlockMask(door, 0);
  assertEquals(attackTargets(runtime, player, ATTACK, (entity) => entity === enemy), [enemy]);
  runtime.crawler.assertInvariants();
});

Deno.test("line attacks preserve target order and stop at the first non-target occupant", () => {
  const runtime = createRuntime(flatTestMap(9, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.East });
  const first = spawnEnemy(runtime, 2, 1);
  const second = spawnEnemy(runtime, 4, 1);
  runtime.crawler.spawnCrawler({ x: 6, y: 1, blockMask: 1 });
  const beyondBlocker = spawnEnemy(runtime, 7, 1);
  const attack = { ...ATTACK, range: 7, targets: AttackTargetMode.All };

  assertEquals(
    attackTargets(
      runtime,
      player,
      attack,
      (entity) => entity === first || entity === second || entity === beyondBlocker,
    ),
    [first, second],
  );
});

Deno.test("adjacent attacks find cardinal actors without facing", () => {
  const runtime = createRuntime(flatTestMap(5, 5));
  const attacker = runtime.crawler.spawnCrawler({ x: 2, y: 2 });
  const north = spawnEnemy(runtime, 2, 1);
  const east = spawnEnemy(runtime, 3, 2);
  const attack = { ...ATTACK, range: 1, pattern: AttackPattern.Adjacent, targets: AttackTargetMode.All };
  assertEquals(attackTargets(runtime, attacker, attack, (entity) => entity === north || entity === east), [
    north,
    east,
  ]);
});

Deno.test("defeat emits events, writes an effect, and despawns the defender", () => {
  const runtime = createRuntime(flatTestMap(4, 3));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.East });
  const enemy = createEnemy(runtime, {
    x: 2,
    y: 1,
    dir: Direction.West,
    health: 1,
    archetype: enemyArchetypeKey(EnemyArchetypeCode.MeleeDog),
    displayName: DisplayName.DigitalDog,
  });
  let effect: { x: number; y: number; sprite: number } | undefined;
  const events = attackEntity(runtime, player, enemy, ATTACK, () => 0.999, (value) => effect = value);
  assertEquals(events.map((event) => event.type), ["damageDealt", "entityDefeated"]);
  assertEquals(effect, { x: 2, y: 1, sprite: 4 });
  assertEquals(runtime.game.isEntityAlive(enemy), false);
  runtime.crawler.assertInvariants();
});

function spawnEnemy(runtime: ReturnType<typeof createRuntime>, x: number, y: number) {
  return createEnemy(runtime, {
    x,
    y,
    dir: Direction.West,
    archetype: enemyArchetypeKey(EnemyArchetypeCode.MeleeDog),
    displayName: DisplayName.DigitalDog,
  });
}
