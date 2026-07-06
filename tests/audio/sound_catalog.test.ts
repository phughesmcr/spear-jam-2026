import { assertEquals } from "@std/assert";
import { SOUND_CATALOG } from "@/src/audio/sound_catalog.ts";
import { SOUND_IDS, SoundId } from "@/src/game/sound.ts";

Deno.test("sound catalog has exactly one entry for every sound id", () => {
  assertEquals(Object.keys(SOUND_CATALOG).sort(), [...SOUND_IDS].sort());

  for (const soundId of SOUND_IDS) {
    const entry = SOUND_CATALOG[soundId];
    assertEquals(entry.soundId, soundId);
    assertEquals(entry.src.endsWith(".wav"), true);
  }
});

Deno.test("sound catalog marks only music and ambient sounds as loops", () => {
  assertEquals(SOUND_CATALOG[SoundId.MusicMain].category, "music");
  assertEquals(SOUND_CATALOG[SoundId.MusicMain].loop, true);
  assertEquals(SOUND_CATALOG[SoundId.AmbientHum].category, "ambient");
  assertEquals(SOUND_CATALOG[SoundId.AmbientHum].loop, true);
  assertEquals(SOUND_CATALOG[SoundId.DoorOpen].category, "sfx");
  assertEquals(SOUND_CATALOG[SoundId.DoorOpen].loop, false);
});
