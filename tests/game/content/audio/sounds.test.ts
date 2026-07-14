import { SOUND_CATALOG } from "@/src/game/content/audio/sounds.ts";
import { SOUND_IDS, SoundId } from "@/src/game/model/sound.ts";
import { assertEquals } from "@std/assert";

Deno.test("sound catalog has exactly one entry for every sound id", () => {
  assertEquals(Object.keys(SOUND_CATALOG).sort(), [...SOUND_IDS].sort());

  for (const soundId of SOUND_IDS) {
    const entry = SOUND_CATALOG[soundId];
    assertEquals(entry.soundId, soundId);
    assertEquals(/\.(wav|mp3|ogg)(?:\?.*)?$/i.test(entry.src), true);
  }
});

Deno.test("sound catalog marks ambient sounds as loops and effects as one-shots", () => {
  assertEquals(SOUND_CATALOG[SoundId.AmbientHum].category, "ambient");
  assertEquals(SOUND_CATALOG[SoundId.AmbientHum].loop, true);
  assertEquals(SOUND_CATALOG[SoundId.DoorOpen].category, "sfx");
  assertEquals(SOUND_CATALOG[SoundId.DoorOpen].loop, false);
});

Deno.test("wind is available as looping ambient audio", () => {
  const wind = SOUND_CATALOG[SoundId.AmbientWind];

  assertEquals(wind.src.endsWith("/assets/game/audio/wind.mp3"), true);
  assertEquals(wind.category, "ambient");
  assertEquals(wind.loop, true);
});
