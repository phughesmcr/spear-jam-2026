import { assertAlmostEquals, assertEquals } from "@std/assert";
import { soundAttenuationForDistance } from "@/src/audio/audio_runtime.ts";

Deno.test("sound attenuation falls off inside the authored tile radius", () => {
  assertEquals(soundAttenuationForDistance(0, 2), 1);
  assertAlmostEquals(soundAttenuationForDistance(1, 2), 2 / 3);
  assertAlmostEquals(soundAttenuationForDistance(2, 2), 1 / 3);
  assertEquals(soundAttenuationForDistance(3, 2), 0);
});

Deno.test("sound attenuation clamps invalid distances and radii", () => {
  assertEquals(soundAttenuationForDistance(-1, 2), 1);
  assertEquals(soundAttenuationForDistance(0, -1), 1);
  assertEquals(soundAttenuationForDistance(1, -1), 0);
});
