import type { AudioTrack } from "@/src/engine/audio/mod.ts";
import type { AudioGraph } from "@/src/platform/web/audio/graph.ts";
import { setAudioParam } from "@/src/platform/web/audio/graph.ts";

export type MusicTransport = {
  play(track: AudioTrack): void;
  unlock(): void;
  dispose(): void;
};

export function createMusicTransport(host: Window, graph: AudioGraph): MusicTransport {
  let track: AudioTrack | undefined;
  let element: HTMLAudioElement | undefined;
  let trackGain: GainNode | undefined;
  let unlocked = false;
  let disposed = false;

  function play(nextTrack: AudioTrack): void {
    if (disposed) return;
    track = nextTrack;
    prepareElement(nextTrack);
    if (unlocked) playNow(nextTrack);
  }

  function unlock(): void {
    if (disposed || unlocked) return;
    unlocked = true;
    if (track !== undefined) playNow(track);
  }

  function playNow(nextTrack: AudioTrack): void {
    const nodes = graph.nodes();
    const audio = prepareElement(nextTrack);
    let gain = trackGain;
    if (gain === undefined) {
      const source = nodes.context.createMediaElementSource(audio);
      gain = nodes.context.createGain();
      source.connect(gain);
      gain.connect(nodes.musicGain);
      trackGain = gain;
    }
    setAudioParam(gain.gain, nextTrack.volume, nodes.context.currentTime);
    void audio.play().catch((error: unknown) => console.warn("Failed to play music.", error));
  }

  function prepareElement(nextTrack: AudioTrack): HTMLAudioElement {
    const audio = element ?? host.document.createElement("audio");
    if (element === undefined) {
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      element = audio;
    }
    if (audio.src !== nextTrack.src) {
      audio.pause();
      audio.src = nextTrack.src;
      audio.loop = nextTrack.loop;
    }
    return audio;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    unlocked = false;
    track = undefined;
    element?.pause();
  }

  return { play, unlock, dispose };
}
