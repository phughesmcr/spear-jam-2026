import type {
  AudioClip,
  AudioCue,
  AudioEmitter,
  AudioPoint,
  AudioTrack,
  IdleAudioSource,
  ListenerPose,
} from "@/src/engine/audio/mod.ts";
import { MUSIC_TRACKS, type TrackId } from "@/src/game/content/audio/music.ts";
import { soundCatalogEntry } from "@/src/game/content/audio/sounds.ts";
import { type VoiceId, voiceSource } from "@/src/game/content/dialogue/voices.ts";
import type { EnemyIdleSoundSource, SoundCue, SoundEmitterSnapshot } from "@/src/game/model/sound.ts";
import type { CardinalDirection, GridPoint } from "@/src/game/world/direction.ts";

export function audioTrackFor(trackId: TrackId): AudioTrack {
  return { id: trackId, ...MUSIC_TRACKS[trackId] };
}

export function audioVoiceFor(voiceId: VoiceId): AudioClip {
  return { id: voiceId, src: voiceSource(voiceId), volume: 1, loop: false, radius: 0 };
}

export function audioCueFor(cue: SoundCue): AudioCue {
  return {
    clip: audioClipFor(cue.soundId),
    ...(cue.position === undefined ? {} : { position: audioPointFor(cue.position) }),
    ...(cue.radius === undefined ? {} : { radius: cue.radius }),
    ...(cue.volume === undefined ? {} : { volume: cue.volume }),
  };
}

export function audioCuesFor(cues: readonly SoundCue[]): readonly AudioCue[] {
  return cues.map(audioCueFor);
}

export function audioEmitterFor(emitter: SoundEmitterSnapshot): AudioEmitter {
  return {
    id: emitter.entity,
    clip: audioClipFor(emitter.soundId),
    position: audioPointFor(emitter),
    radius: emitter.radius,
    volume: emitter.volume,
  };
}

export function audioEmittersFor(emitters: readonly SoundEmitterSnapshot[]): readonly AudioEmitter[] {
  return emitters.map(audioEmitterFor);
}

export function idleAudioSourceFor(source: EnemyIdleSoundSource): IdleAudioSource {
  return {
    ...audioEmitterFor(source),
    minDelayMs: source.minDelayMs,
    maxDelayMs: source.maxDelayMs,
  };
}

export function idleAudioSourcesFor(sources: readonly EnemyIdleSoundSource[]): readonly IdleAudioSource[] {
  return sources.map(idleAudioSourceFor);
}

export function listenerPoseFor(position: GridPoint, facing: CardinalDirection): ListenerPose {
  return {
    position: audioPointFor(position),
    forward: listenerForwardFor(facing),
    up: { x: 0, y: 1, z: 0 },
  };
}

function audioClipFor(soundId: SoundCue["soundId"]): AudioClip {
  const entry = soundCatalogEntry(soundId);
  return {
    id: soundId,
    src: entry.src,
    volume: entry.volume,
    loop: entry.loop,
    radius: entry.radius,
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
