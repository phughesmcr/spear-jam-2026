import type { AudioRuntime as EngineAudioRuntime } from "@/src/engine/audio/mod.ts";
import type { TrackId } from "@/src/game/content/audio/music.ts";
import type { VoiceId } from "@/src/game/content/dialogue/voices.ts";
import type { AudioSettings } from "@/src/game/model/audio_settings.ts";
import type { EnemyIdleSoundSource, SoundCue, SoundEmitterSnapshot } from "@/src/game/model/sound.ts";
import {
  audioCuesFor,
  audioEmittersFor,
  audioTrackFor,
  audioVoiceFor,
  idleAudioSourcesFor,
  listenerPoseFor,
} from "@/src/game/presentation/audio.ts";
import type { AudioWorldSession } from "@/src/game/presentation/session_view.ts";
import { createWebAudioRuntime } from "@/src/platform/web/audio/runtime.ts";

export type AudioRuntimeSpec = {
  readonly host: Window;
  readonly getSession: () => AudioWorldSession | undefined;
  readonly audio?: EngineAudioRuntime;
};

export interface AudioRuntime extends Disposable {
  unlock(): Promise<void>;
  setVolumes(volumes: AudioSettings): void;
  updateListener(): void;
  playCues(cues: readonly SoundCue[]): void;
  stopSounds(): void;
  setDialogueVoice(voice: VoiceId | undefined): void;
  syncWorld(): void;
  playMusic(trackId: TrackId): void;
}

export function createAudioRuntime(spec: AudioRuntimeSpec): AudioRuntime {
  return new Runtime(spec);
}

class Runtime implements AudioRuntime {
  private readonly spec: AudioRuntimeSpec;
  private readonly audio: EngineAudioRuntime;
  private readonly soundEmitters: SoundEmitterSnapshot[] = [];
  private readonly enemyIdleSources: EnemyIdleSoundSource[] = [];

  constructor(spec: AudioRuntimeSpec) {
    this.spec = spec;
    this.audio = spec.audio ?? createWebAudioRuntime(spec.host);
  }

  unlock(): Promise<void> {
    return this.audio.unlock();
  }

  setVolumes(volumes: AudioSettings): void {
    this.audio.setVolumes(volumes);
  }

  updateListener(): void {
    const session = this.spec.getSession();
    if (session === undefined) return;
    this.audio.updateListener(listenerPoseFor(session.getPlayerPosition(), session.getPlayerFacing().dir));
  }

  playCues(cues: readonly SoundCue[]): void {
    this.audio.playCues(audioCuesFor(cues));
  }

  stopSounds(): void {
    this.audio.stopSounds();
  }

  setDialogueVoice(voice: VoiceId | undefined): void {
    this.audio.setVoice(voice === undefined ? undefined : audioVoiceFor(voice));
  }

  syncWorld(): void {
    const session = this.spec.getSession();
    this.soundEmitters.length = 0;
    this.enemyIdleSources.length = 0;
    if (session !== undefined) {
      session.forEachSoundEmitter((emitter) => this.soundEmitters.push({ ...emitter }));
      session.forEachEnemyIdleSoundSource((source) => this.enemyIdleSources.push({ ...source }));
    }
    this.audio.syncAmbientEmitters(audioEmittersFor(this.soundEmitters));
    this.audio.syncIdleSources(idleAudioSourcesFor(this.enemyIdleSources));
  }

  playMusic(trackId: TrackId): void {
    this.audio.playMusic(audioTrackFor(trackId));
  }

  [Symbol.dispose](): void {
    this.audio[Symbol.dispose]();
  }
}
