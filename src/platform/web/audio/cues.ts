import type { AudioCue } from "@/src/engine/audio/mod.ts";
import type { DecodedBufferCache } from "@/src/platform/web/audio/buffer_cache.ts";
import type { AudioGraph } from "@/src/platform/web/audio/graph.ts";
import { disconnectNode, setAudioParam, updatePanner } from "@/src/platform/web/audio/graph.ts";

type ActiveCue = {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly panner?: PannerNode;
};

export type CueChannel = {
  play(cues: readonly AudioCue[]): void;
  unlock(): void;
  stop(): void;
  dispose(): void;
};

export function createCueChannel(graph: AudioGraph, buffers: DecodedBufferCache): CueChannel {
  const pending: AudioCue[] = [];
  const active = new Set<ActiveCue>();
  let request = 0;
  let unlocked = false;
  let disposed = false;

  function play(cues: readonly AudioCue[]): void {
    if (disposed || cues.length === 0) return;
    if (!unlocked) {
      for (const cue of cues) pending.push({ ...cue });
      return;
    }
    for (const cue of cues) void playCue(cue, request);
  }

  function unlock(): void {
    if (disposed || unlocked) return;
    unlocked = true;
    const queued = pending.splice(0);
    for (const cue of queued) void playCue(cue, request);
  }

  async function playCue(cue: AudioCue, expectedRequest: number): Promise<void> {
    const buffer = await buffers.load(cue.clip);
    if (buffer === undefined || disposed || !unlocked || expectedRequest !== request) return;

    const nodes = graph.nodes();
    const attenuation = cue.position === undefined ?
      1 :
      graph.attenuationFor(cue.position, cue.radius ?? cue.clip.radius);
    if (attenuation <= 0) return;

    const source = nodes.context.createBufferSource();
    const gain = nodes.context.createGain();
    source.buffer = buffer;
    setAudioParam(gain.gain, cue.clip.volume * (cue.volume ?? 1) * attenuation, nodes.context.currentTime);
    source.connect(gain);

    let panner: PannerNode | undefined;
    if (cue.position !== undefined) {
      panner = nodes.context.createPanner();
      updatePanner(panner, cue.position, nodes.context.currentTime);
      gain.connect(panner);
      panner.connect(nodes.sfxGain);
    } else {
      gain.connect(nodes.sfxGain);
    }

    const activeCue = panner === undefined ? { source, gain } : { source, gain, panner };
    active.add(activeCue);
    source.addEventListener("ended", () => finish(activeCue), { once: true });
    source.start();
  }

  function stop(): void {
    request++;
    pending.length = 0;
    for (const cue of active) stopActive(cue);
  }

  function stopActive(cue: ActiveCue): void {
    try {
      cue.source.stop();
    } catch {
      // Already stopped.
    }
    finish(cue);
  }

  function finish(cue: ActiveCue): void {
    if (!active.delete(cue)) return;
    disconnectNode(cue.source);
    disconnectNode(cue.gain);
    if (cue.panner !== undefined) disconnectNode(cue.panner);
  }

  function dispose(): void {
    if (disposed) return;
    stop();
    disposed = true;
    unlocked = false;
  }

  return { play, unlock, stop, dispose };
}
