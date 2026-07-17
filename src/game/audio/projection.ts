import type {
  AudioClip,
  AudioCue,
  AudioEmitter,
  AudioPoint,
  AudioTrack,
  IdleAudioSource,
  ListenerPose,
} from "turn-based-web-engine/audio";
import type { AudioContent } from "@/src/game/content/catalog.ts";
import type { TrackId } from "@/src/game/content/audio/music.ts";
import type { VoiceId } from "@/src/game/content/dialogue/voices.ts";
import type { EnemyIdleSoundSource, SoundCue, SoundEmitterSnapshot } from "@/src/game/model/sound.ts";
import type { CardinalDirection, GridPoint } from "turn-based-engine/crawler";

export function createAudioProjection(content: AudioContent) {
  function track(trackId: TrackId): AudioTrack {
    return { id: trackId, ...content.track(trackId) };
  }

  function voice(voiceId: VoiceId): AudioClip {
    return { id: voiceId, src: content.voiceSource(voiceId), volume: 1, loop: false, radius: 0 };
  }

  function cue(value: SoundCue): AudioCue {
    return {
      clip: clip(value.soundId),
      ...(value.position === undefined ? {} : { position: audioPointFor(value.position) }),
      ...(value.radius === undefined ? {} : { radius: value.radius }),
      ...(value.volume === undefined ? {} : { volume: value.volume }),
    };
  }

  function cues(values: readonly SoundCue[]): readonly AudioCue[] {
    return values.map(cue);
  }

  function emitter(value: SoundEmitterSnapshot): AudioEmitter {
    return {
      id: value.entity,
      clip: clip(value.soundId),
      position: audioPointFor(value),
      radius: value.radius,
      volume: value.volume,
    };
  }

  function emitters(values: readonly SoundEmitterSnapshot[]): readonly AudioEmitter[] {
    return values.map(emitter);
  }

  function idleSource(value: EnemyIdleSoundSource): IdleAudioSource {
    return {
      ...emitter(value),
      minDelayMs: value.minDelayMs,
      maxDelayMs: value.maxDelayMs,
    };
  }

  function idleSources(values: readonly EnemyIdleSoundSource[]): readonly IdleAudioSource[] {
    return values.map(idleSource);
  }

  function clip(soundId: SoundCue["soundId"]): AudioClip {
    const entry = content.sound(soundId);
    return {
      id: soundId,
      src: entry.src,
      volume: entry.volume,
      loop: entry.loop,
      radius: entry.radius,
    };
  }

  return { track, voice, cue, cues, emitter, emitters, idleSource, idleSources };
}

export function listenerPoseFor(position: GridPoint, facing: CardinalDirection): ListenerPose {
  return {
    position: audioPointFor(position),
    forward: listenerForwardFor(facing),
    up: { x: 0, y: 1, z: 0 },
  };
}

function audioPointFor(point: GridPoint): AudioPoint {
  return { x: point.x, y: 0, z: point.y };
}

function listenerForwardFor(direction: CardinalDirection): AudioPoint {
  switch (direction) {
    case 0:
      return { x: 0, y: 0, z: -1 };
    case 1:
      return { x: 1, y: 0, z: 0 };
    case 2:
      return { x: 0, y: 0, z: 1 };
    case 3:
      return { x: -1, y: 0, z: 0 };
  }
}
