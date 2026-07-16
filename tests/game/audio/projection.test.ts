import { assertEquals } from "@std/assert";
import { TrackId } from "@/src/game/content/audio/music.ts";
import { VoiceId } from "@/src/game/content/dialogue/voices.ts";
import { createAudioProjection, listenerPoseFor } from "@/src/game/audio/mod.ts";
import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import { SoundId } from "@/src/game/model/sound.ts";
import type { Entity } from "turn-based-engine/ecs";

Deno.test("game audio projection resolves content ids and grid poses into neutral audio operations", () => {
  const projection = createAudioProjection(SHIPPED_GAME.audio);
  const sound = SHIPPED_GAME.audio.sound(SoundId.PickupItem);
  assertEquals(
    projection.cues([
      { soundId: SoundId.PickupItem, position: { x: 3, y: 7 }, radius: 4, volume: 0.5 },
    ])[0],
    {
      clip: { id: SoundId.PickupItem, src: sound.src, volume: sound.volume, loop: sound.loop, radius: sound.radius },
      position: { x: 3, y: 0, z: 7 },
      radius: 4,
      volume: 0.5,
    },
  );

  assertEquals(projection.track(TrackId.Map2), { id: TrackId.Map2, ...SHIPPED_GAME.audio.track(TrackId.Map2) });
  assertEquals(projection.voice(VoiceId.JohnThanksGreet), {
    id: VoiceId.JohnThanksGreet,
    src: SHIPPED_GAME.audio.voiceSource(VoiceId.JohnThanksGreet),
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
  const ambient = SHIPPED_GAME.audio.sound(SoundId.AmbientHum);
  assertEquals(
    projection.emitters([
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
