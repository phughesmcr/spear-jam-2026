import type { AudioEmitter, IdleAudioSource } from "@/src/engine/audio/mod.ts";
import type { DecodedBufferCache } from "@/src/platform/web/audio/buffer_cache.ts";
import type { CueChannel } from "@/src/platform/web/audio/cues.ts";
import type { AudioGraph } from "@/src/platform/web/audio/graph.ts";
import { disconnectNode, rampAudioParam, updatePanner } from "@/src/platform/web/audio/graph.ts";

type AmbientLoop = {
  readonly clipId: string;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly panner: PannerNode;
};

export type WorldAudio = {
  syncAmbient(emitters: readonly AudioEmitter[]): void;
  syncIdle(sources: readonly IdleAudioSource[]): void;
  listenerUpdated(): void;
  unlock(): void;
  stop(): void;
  dispose(): void;
};

const AMBIENT_GAIN_RAMP_SECONDS = 0.18;

export function createWorldAudio(
  host: Window,
  graph: AudioGraph,
  buffers: DecodedBufferCache,
  cues: CueChannel,
): WorldAudio {
  const ambientSnapshots = new Map<number, AudioEmitter>();
  const ambientLoops = new Map<number, AmbientLoop>();
  const idleSources = new Map<number, IdleAudioSource>();
  const idleTimers = new Map<number, number>();
  let unlocked = false;
  let disposed = false;

  function syncAmbient(emitters: readonly AudioEmitter[]): void {
    if (disposed) return;
    ambientSnapshots.clear();
    for (const emitter of emitters) ambientSnapshots.set(emitter.id, copyAudioEmitter(emitter));
    if (unlocked) reconcileAmbientLoops();
  }

  function syncIdle(sources: readonly IdleAudioSource[]): void {
    if (disposed) return;
    const nextIds = new Set<number>();
    for (const source of sources) {
      nextIds.add(source.id);
      idleSources.set(source.id, copyIdleAudioSource(source));
      if (unlocked) scheduleIdle(source.id);
    }
    for (const id of idleSources.keys()) {
      if (nextIds.has(id)) continue;
      idleSources.delete(id);
      clearIdleTimer(id);
    }
  }

  function unlock(): void {
    if (disposed || unlocked) return;
    unlocked = true;
    reconcileAmbientLoops();
    for (const id of idleSources.keys()) scheduleIdle(id);
  }

  function reconcileAmbientLoops(): void {
    for (const id of ambientLoops.keys()) {
      if (!ambientSnapshots.has(id)) stopAmbientLoop(id);
    }
    for (const [id, snapshot] of ambientSnapshots) {
      const loop = ambientLoops.get(id);
      if (loop === undefined) {
        void startAmbientLoop(snapshot);
      } else if (loop.clipId === snapshot.clip.id) {
        updateAmbientLoop(loop, snapshot);
      } else {
        stopAmbientLoop(id);
        void startAmbientLoop(snapshot);
      }
    }
  }

  async function startAmbientLoop(snapshot: AudioEmitter): Promise<void> {
    const buffer = await buffers.load(snapshot.clip);
    if (buffer === undefined || disposed || !unlocked || ambientLoops.has(snapshot.id)) return;
    const latest = ambientSnapshots.get(snapshot.id);
    if (latest === undefined || latest.clip.id !== snapshot.clip.id) return;

    const nodes = graph.nodes();
    const source = nodes.context.createBufferSource();
    const gain = nodes.context.createGain();
    const panner = nodes.context.createPanner();
    source.buffer = buffer;
    source.loop = latest.clip.loop;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(nodes.ambientGain);
    const loop = { clipId: latest.clip.id, source, gain, panner };
    updateAmbientLoop(loop, latest, 0);
    source.start();
    ambientLoops.set(latest.id, loop);
  }

  function updateAmbientLoop(
    loop: AmbientLoop,
    snapshot: AudioEmitter,
    rampSeconds = AMBIENT_GAIN_RAMP_SECONDS,
  ): void {
    const nodes = graph.nodes();
    const attenuation = graph.attenuationFor(snapshot.position, snapshot.radius);
    rampAudioParam(
      loop.gain.gain,
      snapshot.clip.volume * snapshot.volume * attenuation,
      nodes.context.currentTime,
      rampSeconds,
    );
    updatePanner(loop.panner, snapshot.position, nodes.context.currentTime);
  }

  function listenerUpdated(): void {
    for (const [id, loop] of ambientLoops) {
      const snapshot = ambientSnapshots.get(id);
      if (snapshot !== undefined) updateAmbientLoop(loop, snapshot);
    }
  }

  function stopAmbientLoop(id: number): void {
    const loop = ambientLoops.get(id);
    if (loop === undefined) return;
    try {
      loop.source.stop();
    } catch {
      // Already stopped.
    }
    disconnectNode(loop.source);
    disconnectNode(loop.gain);
    disconnectNode(loop.panner);
    ambientLoops.delete(id);
  }

  function scheduleIdle(id: number): void {
    if (idleTimers.has(id)) return;
    const source = idleSources.get(id);
    if (source === undefined) return;
    const timer = host.setTimeout(() => {
      idleTimers.delete(id);
      const latest = idleSources.get(id);
      if (latest === undefined || !unlocked) return;
      cues.play([{
        clip: latest.clip,
        position: latest.position,
        radius: latest.radius,
        volume: latest.volume,
      }]);
      scheduleIdle(id);
    }, randomDelayMs(source.minDelayMs, source.maxDelayMs));
    idleTimers.set(id, timer);
  }

  function clearIdleTimer(id: number): void {
    const timer = idleTimers.get(id);
    if (timer === undefined) return;
    host.clearTimeout(timer);
    idleTimers.delete(id);
  }

  function stop(): void {
    ambientSnapshots.clear();
    for (const id of ambientLoops.keys()) stopAmbientLoop(id);
    idleSources.clear();
    for (const id of idleTimers.keys()) clearIdleTimer(id);
  }

  function dispose(): void {
    if (disposed) return;
    stop();
    disposed = true;
    unlocked = false;
  }

  return { syncAmbient, syncIdle, listenerUpdated, unlock, stop, dispose };
}

function copyAudioEmitter(emitter: AudioEmitter): AudioEmitter {
  return {
    id: emitter.id,
    clip: { ...emitter.clip },
    position: { ...emitter.position },
    radius: emitter.radius,
    volume: emitter.volume,
  };
}

function copyIdleAudioSource(source: IdleAudioSource): IdleAudioSource {
  return {
    ...copyAudioEmitter(source),
    minDelayMs: source.minDelayMs,
    maxDelayMs: source.maxDelayMs,
  };
}

function randomDelayMs(minDelayMs: number, maxDelayMs: number): number {
  const min = Math.max(0, Math.min(minDelayMs, maxDelayMs));
  const max = Math.max(min, maxDelayMs);
  return min + Math.floor(Math.random() * (max - min + 1));
}
