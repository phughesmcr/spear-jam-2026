import type {
  AudioClip,
  AudioCue,
  AudioEmitter,
  AudioRuntime,
  AudioTrack,
  AudioVolumes,
  IdleAudioSource,
  ListenerPose,
} from "@/src/engine/audio/mod.ts";
import { createDecodedBufferCache } from "@/src/platform/web/audio/buffer_cache.ts";
import { createCueChannel, type CueChannel } from "@/src/platform/web/audio/cues.ts";
import { type AudioGraph, createAudioGraph } from "@/src/platform/web/audio/graph.ts";
import { createMusicTransport, type MusicTransport } from "@/src/platform/web/audio/music.ts";
import { createVoiceChannel, type VoiceChannel } from "@/src/platform/web/audio/voice.ts";
import { createWorldAudio, type WorldAudio } from "@/src/platform/web/audio/world.ts";

export function createWebAudioRuntime(host: Window): AudioRuntime {
  return new WebAudioRuntime(host);
}

class WebAudioRuntime implements AudioRuntime {
  private readonly graph: AudioGraph;
  private readonly music: MusicTransport;
  private readonly cues: CueChannel;
  private readonly voice: VoiceChannel;
  private readonly world: WorldAudio;
  private readonly abortController = new AbortController();
  private unlocked = false;
  private disposed = false;

  constructor(host: Window) {
    this.graph = createAudioGraph(host);
    const soundBuffers = createDecodedBufferCache(host, this.graph, this.abortController.signal);
    const voiceBuffers = createDecodedBufferCache(host, this.graph, this.abortController.signal);
    this.music = createMusicTransport(host, this.graph);
    this.cues = createCueChannel(this.graph, soundBuffers);
    this.voice = createVoiceChannel(this.graph, voiceBuffers);
    this.world = createWorldAudio(host, this.graph, soundBuffers, this.cues);
  }

  async unlock(): Promise<void> {
    if (this.disposed) return;
    const context = this.graph.nodes().context;
    if (context.state !== "running") await context.resume();
    if (this.disposed || this.unlocked) return;
    this.unlocked = true;
    this.music.unlock();
    this.voice.unlock();
    this.cues.unlock();
    this.world.unlock();
  }

  playMusic(track: AudioTrack): void {
    if (this.disposed) return;
    this.music.play(track);
  }

  stopSounds(): void {
    if (this.disposed) return;
    this.cues.stop();
    this.voice.set(undefined);
    this.world.stop();
  }

  setVolumes(volumes: AudioVolumes): void {
    if (this.disposed) return;
    this.graph.setVolumes(volumes);
  }

  updateListener(pose: ListenerPose): void {
    if (this.disposed) return;
    this.graph.updateListener(pose);
    this.world.listenerUpdated();
  }

  playCues(cues: readonly AudioCue[]): void {
    if (this.disposed) return;
    this.cues.play(cues);
  }

  setVoice(voice: AudioClip | undefined): void {
    if (this.disposed) return;
    this.voice.set(voice);
  }

  syncAmbientEmitters(emitters: readonly AudioEmitter[]): void {
    if (this.disposed) return;
    this.world.syncAmbient(emitters);
  }

  syncIdleSources(sources: readonly IdleAudioSource[]): void {
    if (this.disposed) return;
    this.world.syncIdle(sources);
  }

  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.stopSounds();
    this.disposed = true;
    this.unlocked = false;
    this.abortController.abort();
    this.music.dispose();
    this.cues.dispose();
    this.voice.dispose();
    this.world.dispose();
    this.graph.dispose();
  }
}
