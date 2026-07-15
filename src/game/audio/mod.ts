export { TrackId } from "@/src/game/content/audio/music.ts";
export { VoiceId } from "@/src/game/content/dialogue/voices.ts";
export type { AudioSettings } from "@/src/game/model/audio_settings.ts";
export type { EnemyIdleSoundSource, SoundCue, SoundEmitterSnapshot } from "@/src/game/model/sound.ts";
export {
  audioCuesFor,
  audioEmittersFor,
  audioTrackFor,
  audioVoiceFor,
  idleAudioSourcesFor,
  listenerPoseFor,
} from "@/src/game/audio/projection.ts";
export type { AudioWorldSession } from "@/src/game/audio/session_view.ts";
