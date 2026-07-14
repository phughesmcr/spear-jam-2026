import { assertEquals, assertThrows } from "@std/assert";
import { SOUND_IDS, SoundId, soundIdCode, soundIdForCode, weaponSoundId } from "@/src/game/model/sound.ts";

Deno.test("sound ids round-trip through compact storage codes", () => {
  for (const soundId of SOUND_IDS) {
    assertEquals(soundIdForCode(soundIdCode(soundId)), soundId);
  }

  assertThrows(() => soundIdForCode(0), Error, "Unknown sound id code");
  assertThrows(() => soundIdForCode(SOUND_IDS.length + 1), Error, "Unknown sound id code");
});

Deno.test("weapon slots map to exact v1 sound ids", () => {
  assertEquals(weaponSoundId(1), SoundId.WeaponBitShifter);
  assertEquals(weaponSoundId(2), SoundId.WeaponPulsePistol);
  assertEquals(weaponSoundId(3), SoundId.WeaponCurrentCannon);
});
