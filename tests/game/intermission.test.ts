import { assertEquals } from "@std/assert";
import {
  currentIntermissionPage,
  hasNextIntermissionPage,
  type IntermissionMode,
  isMessageRevealed,
  REVEAL_MS_PER_CHARACTER,
  visibleCharacterCount,
} from "@/src/game/intermission.ts";

const MODE: IntermissionMode = {
  type: "intermission",
  pages: ["ABCD", "EF"],
  pageIndex: 0,
  prompt: "Space",
  goto: "Level 1",
  playerState: {},
  revealStartedAtMs: 100,
  revealed: false,
};

Deno.test("visibleCharacterCount reveals intermission text over time", () => {
  assertEquals(visibleCharacterCount(MODE, 99), 0);
  assertEquals(visibleCharacterCount(MODE, 100 + REVEAL_MS_PER_CHARACTER), 1);
  assertEquals(visibleCharacterCount(MODE, 100 + REVEAL_MS_PER_CHARACTER * 4), 4);
  assertEquals(visibleCharacterCount({ ...MODE, revealed: true }, 100), 4);
});

Deno.test("isMessageRevealed treats manual reveal as complete", () => {
  assertEquals(isMessageRevealed(MODE, 100), false);
  assertEquals(isMessageRevealed(MODE, 100 + REVEAL_MS_PER_CHARACTER * 4), true);
  assertEquals(isMessageRevealed({ ...MODE, revealed: true }, 100), true);
});

Deno.test("currentIntermissionPage and hasNextIntermissionPage read paged story state", () => {
  assertEquals(currentIntermissionPage(MODE), "ABCD");
  assertEquals(hasNextIntermissionPage(MODE), true);
  assertEquals(currentIntermissionPage({ ...MODE, pageIndex: 1 }), "EF");
  assertEquals(hasNextIntermissionPage({ ...MODE, pageIndex: 1 }), false);
});
