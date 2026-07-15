import type { AudioClip } from "@/src/engine/audio/mod.ts";
import type { DecodedBufferCache } from "@/src/platform/web/audio/buffer_cache.ts";
import type { AudioGraph } from "@/src/platform/web/audio/graph.ts";
import { disconnectNode } from "@/src/platform/web/audio/graph.ts";

export type VoiceChannel = {
  set(voice: AudioClip | undefined): void;
  unlock(): void;
  dispose(): void;
};

export function createVoiceChannel(graph: AudioGraph, buffers: DecodedBufferCache): VoiceChannel {
  let selected: AudioClip | undefined;
  let source: AudioBufferSourceNode | undefined;
  let request = 0;
  let unlocked = false;
  let disposed = false;

  function set(voice: AudioClip | undefined): void {
    if (disposed) return;
    selected = voice;
    request++;
    stopSource();
    if (unlocked && voice !== undefined) void start(voice, request);
  }

  function unlock(): void {
    if (disposed || unlocked) return;
    unlocked = true;
    if (selected !== undefined) void start(selected, request);
  }

  async function start(voice: AudioClip, expectedRequest: number): Promise<void> {
    const buffer = await buffers.load(voice);
    if (
      buffer === undefined || disposed || !unlocked || selected?.id !== voice.id || request !== expectedRequest
    ) return;

    const nodes = graph.nodes();
    const nextSource = nodes.context.createBufferSource();
    nextSource.buffer = buffer;
    nextSource.connect(nodes.sfxGain);
    nextSource.addEventListener("ended", () => {
      if (source === nextSource) source = undefined;
      disconnectNode(nextSource);
    }, { once: true });
    source = nextSource;
    nextSource.start();
  }

  function stopSource(): void {
    const active = source;
    if (active === undefined) return;
    source = undefined;
    try {
      active.stop();
    } catch {
      // Already stopped.
    }
    disconnectNode(active);
  }

  function dispose(): void {
    if (disposed) return;
    set(undefined);
    disposed = true;
    unlocked = false;
  }

  return { set, unlock, dispose };
}
