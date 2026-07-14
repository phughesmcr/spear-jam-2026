import { VOICE_CATALOG, VOICE_IDS } from "@/src/game/content/dialogue/voices.ts";
import { assertEquals } from "@std/assert";

Deno.test("dialogue voice catalog has one WAV asset for every voice id", () => {
  assertEquals(Object.keys(VOICE_CATALOG).toSorted(), [...VOICE_IDS].toSorted());

  for (const voiceId of VOICE_IDS) {
    assertEquals(VOICE_CATALOG[voiceId].endsWith(".wav"), true);
  }
});
