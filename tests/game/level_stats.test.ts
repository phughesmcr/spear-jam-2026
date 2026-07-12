import { formatLevelStats } from "@/src/game/level_stats.ts";
import { assertEquals } from "@std/assert";

Deno.test("formatLevelStats presents elapsed time, moves, and monster completion", () => {
  assertEquals(
    formatLevelStats({
      elapsedMs: 125_900,
      moves: 184,
      monstersKilled: 7,
      totalMonsters: 9,
    }),
    "LEVEL COMPLETE\n\nTIME 02:05\nMOVES 184\nMONSTERS 7/9 (78%)",
  );
});

Deno.test("formatLevelStats reports zero percent for a map without monsters", () => {
  assertEquals(
    formatLevelStats({
      elapsedMs: 0,
      moves: 0,
      monstersKilled: 0,
      totalMonsters: 0,
    }),
    "LEVEL COMPLETE\n\nTIME 00:00\nMOVES 0\nMONSTERS 0/0 (0%)",
  );
});
