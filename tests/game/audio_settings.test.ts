import { clampVolume, DEFAULT_AUDIO_SETTINGS, withAudioVolume } from "@/src/game/audio_settings.ts";
import { assertEquals } from "@std/assert";

Deno.test("clampVolume keeps values in 0..1", () => {
  assertEquals(clampVolume(-1), 0);
  assertEquals(clampVolume(0.4), 0.4);
  assertEquals(clampVolume(2), 1);
  assertEquals(clampVolume(Number.NaN), 0);
});

Deno.test("withAudioVolume updates one channel without mutating the other", () => {
  assertEquals(withAudioVolume(DEFAULT_AUDIO_SETTINGS, "music", 0.3), {
    musicVolume: 0.3,
    soundVolume: 1,
  });
  assertEquals(withAudioVolume(DEFAULT_AUDIO_SETTINGS, "sound", 1.5), {
    musicVolume: 1,
    soundVolume: 1,
  });
  assertEquals(withAudioVolume(DEFAULT_AUDIO_SETTINGS, "sound", 0.2), {
    musicVolume: 1,
    soundVolume: 0.2,
  });
});
