import { assertEquals } from "@std/assert";
import { MUSIC_TRACKS, TrackId } from "@/src/game/content/audio/music.ts";
import { soundCatalogEntry } from "@/src/game/content/audio/sounds.ts";
import { VoiceId, voiceSource } from "@/src/game/content/dialogue/voices.ts";
import { audioCuesFor, audioEmittersFor, audioTrackFor, audioVoiceFor, listenerPoseFor } from "@/src/game/audio/mod.ts";
import { SoundId } from "@/src/game/model/sound.ts";
import type { Entity } from "turn-based-engine/ecs";

Deno.test("game audio projection resolves content ids and grid poses into neutral audio operations", () => {
  const sound = soundCatalogEntry(SoundId.PickupItem);
  assertEquals(
    audioCuesFor([
      { soundId: SoundId.PickupItem, position: { x: 3, y: 7 }, radius: 4, volume: 0.5 },
    ])[0],
    {
      clip: { id: SoundId.PickupItem, src: sound.src, volume: sound.volume, loop: sound.loop, radius: sound.radius },
      position: { x: 3, y: 0, z: 7 },
      radius: 4,
      volume: 0.5,
    },
  );

  assertEquals(audioTrackFor(TrackId.Map2), { id: TrackId.Map2, ...MUSIC_TRACKS[TrackId.Map2] });
  assertEquals(audioVoiceFor(VoiceId.JohnThanksGreet), {
    id: VoiceId.JohnThanksGreet,
    src: voiceSource(VoiceId.JohnThanksGreet),
    volume: 1,
    loop: false,
    radius: 0,
  });

  assertEquals(listenerPoseFor({ x: 3, y: 7 }, 1), {
    position: { x: 3, y: 0, z: 7 },
    forward: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: 1, z: 0 },
  });

  const entity = 7 as Entity;
  const ambient = soundCatalogEntry(SoundId.AmbientHum);
  assertEquals(
    audioEmittersFor([
      { entity, soundId: SoundId.AmbientHum, x: 2, y: 4, radius: 6, volume: 0.75 },
    ])[0],
    {
      id: entity,
      clip: {
        id: SoundId.AmbientHum,
        src: ambient.src,
        volume: ambient.volume,
        loop: ambient.loop,
        radius: ambient.radius,
      },
      position: { x: 2, y: 0, z: 4 },
      radius: 6,
      volume: 0.75,
    },
  );
});
