import { assertEquals, assertThrows } from "@std/assert";
import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import { SOUND_IDS, SoundId, weaponSoundId } from "@/src/game/model/sound.ts";

Deno.test("sound ids round-trip through compact storage codes", () => {
  for (const soundId of SOUND_IDS) {
    assertEquals(SHIPPED_GAME.audio.soundIdForCode(SHIPPED_GAME.audio.soundCode(soundId)), soundId);
  }

  assertThrows(() => SHIPPED_GAME.audio.soundIdForCode(0), Error, "Unknown sound id code");
  assertThrows(() => SHIPPED_GAME.audio.soundIdForCode(SOUND_IDS.length + 1), Error, "Unknown sound id code");
});

Deno.test("weapon slots map to exact v1 sound ids", () => {
  assertEquals(weaponSoundId(1), SoundId.WeaponBitShifter);
  assertEquals(weaponSoundId(2), SoundId.WeaponPulsePistol);
  assertEquals(weaponSoundId(3), SoundId.WeaponCurrentCannon);
});
