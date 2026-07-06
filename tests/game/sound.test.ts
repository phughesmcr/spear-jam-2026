import { assertEquals, assertThrows } from "@std/assert";
import {
  listenerForwardForDirection,
  SOUND_IDS,
  SoundId,
  soundIdCode,
  soundIdForCode,
  soundPointForGrid,
  weaponSoundId,
} from "@/src/game/sound.ts";

Deno.test("sound ids round-trip through compact storage codes", () => {
  for (const soundId of SOUND_IDS) {
    assertEquals(soundIdForCode(soundIdCode(soundId)), soundId);
  }

  assertThrows(() => soundIdForCode(0), Error, "Unknown sound id code");
  assertThrows(() => soundIdForCode(SOUND_IDS.length + 1), Error, "Unknown sound id code");
});

Deno.test("sound points map grid coordinates onto a flat Web Audio plane", () => {
  assertEquals(soundPointForGrid({ x: 3, y: 7 }), { x: 3, y: 0, z: 7 });
});

Deno.test("listener forward vectors match cardinal grid facing", () => {
  assertEquals(listenerForwardForDirection(0), { x: 0, y: 0, z: -1 });
  assertEquals(listenerForwardForDirection(1), { x: 1, y: 0, z: 0 });
  assertEquals(listenerForwardForDirection(2), { x: 0, y: 0, z: 1 });
  assertEquals(listenerForwardForDirection(3), { x: -1, y: 0, z: 0 });
});

Deno.test("weapon slots map to exact v1 sound ids", () => {
  assertEquals(weaponSoundId(1), SoundId.WeaponBitShifter);
  assertEquals(weaponSoundId(2), SoundId.WeaponPulsePistol);
  assertEquals(weaponSoundId(3), SoundId.WeaponCurrentCannon);
});
