import type { AudioRuntime as EngineAudioRuntime } from "@/src/engine/audio/mod.ts";
import type { AudioContent } from "@/src/game/content/catalog.ts";
import {
  type AudioSettings,
  type AudioWorldSession,
  createAudioProjection,
  type EnemyIdleSoundSource,
  listenerPoseFor,
  type SoundCue,
  type SoundEmitterSnapshot,
  type TrackId,
  type VoiceId,
} from "@/src/game/audio/mod.ts";
import { createWebAudioRuntime } from "@/src/platform/web/audio/mod.ts";

export type AudioRuntimeSpec = {
  readonly content: AudioContent;
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
  private readonly projection: ReturnType<typeof createAudioProjection>;
  private readonly soundEmitters: SoundEmitterSnapshot[] = [];
  private readonly enemyIdleSources: EnemyIdleSoundSource[] = [];

  constructor(spec: AudioRuntimeSpec) {
    this.spec = spec;
    this.projection = createAudioProjection(spec.content);
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
    this.audio.playCues(this.projection.cues(cues));
  }

  stopSounds(): void {
    this.audio.stopSounds();
  }

  setDialogueVoice(voice: VoiceId | undefined): void {
    this.audio.setVoice(voice === undefined ? undefined : this.projection.voice(voice));
  }

  syncWorld(): void {
    const session = this.spec.getSession();
    this.soundEmitters.length = 0;
    this.enemyIdleSources.length = 0;
    if (session !== undefined) {
      session.forEachSoundEmitter((emitter) => this.soundEmitters.push({ ...emitter }));
      session.forEachEnemyIdleSoundSource((source) => this.enemyIdleSources.push({ ...source }));
    }
    this.audio.syncAmbientEmitters(this.projection.emitters(this.soundEmitters));
    this.audio.syncIdleSources(this.projection.idleSources(this.enemyIdleSources));
  }

  playMusic(trackId: TrackId): void {
    this.audio.playMusic(this.projection.track(trackId));
  }

  [Symbol.dispose](): void {
    this.audio[Symbol.dispose]();
  }
}
