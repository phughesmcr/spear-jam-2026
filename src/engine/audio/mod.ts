export type AudioPoint = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type AudioClip = {
  readonly id: string;
  readonly src: string;
  readonly volume: number;
  readonly loop: boolean;
  readonly radius: number;
};

export type AudioTrack = {
  readonly id: string;
  readonly src: string;
  readonly volume: number;
  readonly loop: boolean;
};

export type AudioCue = {
  readonly clip: AudioClip;
  readonly position?: AudioPoint;
  readonly radius?: number;
  readonly volume?: number;
};

export type AudioEmitter = {
  readonly id: number;
  readonly clip: AudioClip;
  readonly position: AudioPoint;
  readonly radius: number;
  readonly volume: number;
};

export type IdleAudioSource = AudioEmitter & {
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
};

export type ListenerPose = {
  readonly position: AudioPoint;
  readonly forward: AudioPoint;
  readonly up: AudioPoint;
};

export type AudioVolumes = {
  readonly musicVolume: number;
  readonly soundVolume: number;
};

export interface AudioRuntime extends Disposable {
  unlock(): Promise<void>;
  playMusic(track: AudioTrack): void;
  stopSounds(): void;
  setVolumes(volumes: AudioVolumes): void;
  updateListener(pose: ListenerPose): void;
  playCues(cues: readonly AudioCue[]): void;
  setVoice(voice: AudioClip | undefined): void;
  syncAmbientEmitters(emitters: readonly AudioEmitter[]): void;
  syncIdleSources(sources: readonly IdleAudioSource[]): void;
}
