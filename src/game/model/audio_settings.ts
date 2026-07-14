export type AudioChannel = "music" | "sound";

export type AudioSettings = {
  readonly musicVolume: number;
  readonly soundVolume: number;
};

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  musicVolume: 1,
  soundVolume: 1,
};

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function withAudioVolume(
  settings: AudioSettings,
  channel: AudioChannel,
  volume: number,
): AudioSettings {
  const clamped = clampVolume(volume);
  switch (channel) {
    case "music":
      return settings.musicVolume === clamped ? settings : { ...settings, musicVolume: clamped };
    case "sound":
      return settings.soundVolume === clamped ? settings : { ...settings, soundVolume: clamped };
    default: {
      const _exhaustive: never = channel;
      return _exhaustive;
    }
  }
}
