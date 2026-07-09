import { soundCatalogEntry } from "@/src/audio/sound_catalog.ts";
import { clampVolume } from "@/src/game/audio_settings.ts";
import {
  type EnemyIdleSoundSource,
  listenerForwardForDirection,
  type SoundCue,
  type SoundEmitterSnapshot,
  SoundId,
  soundPointForGrid,
} from "@/src/game/sound.ts";
import type { CardinalDirection, GridPoint } from "@/src/grid/direction.ts";
import type { Entity } from "@phughesmcr/miski";

export type AudioVolumes = {
  readonly musicVolume: number;
  readonly soundVolume: number;
};

export interface AudioRuntime extends Disposable {
  unlock(): Promise<void>;
  startMusic(): void;
  setVolumes(volumes: AudioVolumes): void;
  updateListener(position: GridPoint, facing: CardinalDirection): void;
  playCues(cues: readonly SoundCue[]): void;
  syncAmbientEmitters(emitters: readonly SoundEmitterSnapshot[]): void;
  syncEnemyIdleSources(sources: readonly EnemyIdleSoundSource[]): void;
}

type AudioGraph = {
  readonly context: AudioContext;
  readonly masterGain: GainNode;
  readonly musicGain: GainNode;
  readonly sfxGain: GainNode;
  readonly ambientGain: GainNode;
};

type AudioContextConstructor = new () => AudioContext;
type WindowWithAudioContext = Window & {
  readonly AudioContext: AudioContextConstructor;
};

type AmbientLoop = {
  readonly soundId: SoundId;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly panner: PannerNode;
};

const AMBIENT_GAIN_RAMP_SECONDS = 0.18;

export function createAudioRuntime(host: Window): AudioRuntime {
  return new WebAudioRuntime(host);
}

export function soundAttenuationForDistance(distance: number, radius: number): number {
  const audibleRadius = Math.max(0, radius);
  const safeDistance = Math.max(0, distance);
  if (safeDistance > audibleRadius) return 0;
  return 1 - safeDistance / (audibleRadius + 1);
}

class WebAudioRuntime implements AudioRuntime {
  private readonly host: Window;
  private graph?: AudioGraph;
  private unlocked = false;
  private pendingMusic = false;
  private musicElement?: HTMLAudioElement;
  private musicSource?: MediaElementAudioSourceNode;
  private readonly buffers = new Map<SoundId, Promise<AudioBuffer | undefined>>();
  private readonly ambientSnapshots = new Map<Entity, SoundEmitterSnapshot>();
  private readonly ambientLoops = new Map<Entity, AmbientLoop>();
  private readonly enemyIdleSources = new Map<Entity, EnemyIdleSoundSource>();
  private readonly enemyIdleTimers = new Map<Entity, number>();
  private readonly pendingCues: SoundCue[] = [];
  private readonly abortController = new AbortController();
  private listenerPosition?: GridPoint;
  private musicVolume = 1;
  private soundVolume = 1;
  private disposed = false;

  constructor(host: Window) {
    this.host = host;
  }

  async unlock(): Promise<void> {
    if (this.disposed) return;
    const graph = this.ensureGraph();
    if (graph.context.state !== "running") await graph.context.resume();
    if (this.disposed || this.unlocked) return;
    this.unlocked = true;
    if (this.pendingMusic) this.startMusicNow();
    this.flushPendingCues();
    this.reconcileAmbientLoops();
    for (const entity of this.enemyIdleSources.keys()) this.scheduleEnemyIdle(entity);
  }

  startMusic(): void {
    if (this.disposed) return;
    this.pendingMusic = true;
    if (this.unlocked) this.startMusicNow();
  }

  setVolumes(volumes: AudioVolumes): void {
    if (this.disposed) return;
    this.musicVolume = clampVolume(volumes.musicVolume);
    this.soundVolume = clampVolume(volumes.soundVolume);
    if (this.graph === undefined) return;
    const now = this.graph.context.currentTime;
    setAudioParam(this.graph.musicGain.gain, this.musicVolume, now);
    setAudioParam(this.graph.sfxGain.gain, this.soundVolume, now);
    setAudioParam(this.graph.ambientGain.gain, this.soundVolume, now);
  }

  updateListener(position: GridPoint, facing: CardinalDirection): void {
    this.listenerPosition = copyGridPoint(position);
    if (this.graph === undefined) return;
    const point = soundPointForGrid(position);
    const forward = listenerForwardForDirection(facing);
    const listener = this.graph.context.listener;
    setAudioParam(listener.positionX, point.x, this.graph.context.currentTime);
    setAudioParam(listener.positionY, point.y, this.graph.context.currentTime);
    setAudioParam(listener.positionZ, point.z, this.graph.context.currentTime);
    setAudioParam(listener.forwardX, forward.x, this.graph.context.currentTime);
    setAudioParam(listener.forwardY, forward.y, this.graph.context.currentTime);
    setAudioParam(listener.forwardZ, forward.z, this.graph.context.currentTime);
    setAudioParam(listener.upX, 0, this.graph.context.currentTime);
    setAudioParam(listener.upY, 1, this.graph.context.currentTime);
    setAudioParam(listener.upZ, 0, this.graph.context.currentTime);
    this.updateAmbientLoopGains();
  }

  playCues(cues: readonly SoundCue[]): void {
    if (this.disposed || cues.length === 0) return;
    if (!this.unlocked) {
      this.queuePendingCues(cues);
      return;
    }
    for (const cue of cues) void this.playCue(cue);
  }

  syncAmbientEmitters(emitters: readonly SoundEmitterSnapshot[]): void {
    this.ambientSnapshots.clear();
    for (const emitter of emitters) this.ambientSnapshots.set(emitter.entity, copySoundEmitter(emitter));
    if (this.unlocked) this.reconcileAmbientLoops();
  }

  syncEnemyIdleSources(sources: readonly EnemyIdleSoundSource[]): void {
    const nextEntities = new Set<Entity>();
    for (const source of sources) {
      nextEntities.add(source.entity);
      this.enemyIdleSources.set(source.entity, copyEnemyIdleSoundSource(source));
      if (this.unlocked) this.scheduleEnemyIdle(source.entity);
    }

    for (const entity of this.enemyIdleSources.keys()) {
      if (nextEntities.has(entity)) continue;
      this.enemyIdleSources.delete(entity);
      this.clearEnemyIdleTimer(entity);
    }
  }

  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unlocked = false;
    this.pendingMusic = false;
    this.abortController.abort();
    this.pendingCues.length = 0;
    this.ambientSnapshots.clear();
    this.enemyIdleSources.clear();
    for (const entity of this.enemyIdleTimers.keys()) this.clearEnemyIdleTimer(entity);
    for (const entity of this.ambientLoops.keys()) this.stopAmbientLoop(entity);
    this.musicElement?.pause();
    if (this.graph !== undefined && this.graph.context.state !== "closed") {
      void this.graph.context.close();
    }
  }

  private ensureGraph(): AudioGraph {
    if (this.graph !== undefined) return this.graph;

    const AudioContext = (this.host as WindowWithAudioContext).AudioContext;
    const context = new AudioContext();
    const masterGain = context.createGain();
    const musicGain = context.createGain();
    const sfxGain = context.createGain();
    const ambientGain = context.createGain();
    setAudioParam(masterGain.gain, 1, context.currentTime);
    setAudioParam(musicGain.gain, this.musicVolume, context.currentTime);
    setAudioParam(sfxGain.gain, this.soundVolume, context.currentTime);
    setAudioParam(ambientGain.gain, this.soundVolume, context.currentTime);
    musicGain.connect(masterGain);
    sfxGain.connect(masterGain);
    ambientGain.connect(masterGain);
    masterGain.connect(context.destination);

    this.graph = { context, masterGain, musicGain, sfxGain, ambientGain };
    return this.graph;
  }

  private startMusicNow(): void {
    const graph = this.ensureGraph();
    if (this.musicElement !== undefined) {
      void this.musicElement.play().catch((error: unknown) => warnAudioFailure("play music", error));
      return;
    }

    const entry = soundCatalogEntry(SoundId.MusicMain);
    const audio = this.host.document.createElement("audio");
    audio.src = entry.src;
    audio.loop = true;
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    this.musicElement = audio;
    this.musicSource = graph.context.createMediaElementSource(audio);
    const gain = graph.context.createGain();
    setAudioParam(gain.gain, entry.volume, graph.context.currentTime);
    this.musicSource.connect(gain);
    gain.connect(graph.musicGain);
    void audio.play().catch((error: unknown) => warnAudioFailure("play music", error));
  }

  private async playCue(cue: SoundCue): Promise<void> {
    const graph = this.ensureGraph();
    const entry = soundCatalogEntry(cue.soundId);
    if (entry.category === "music") {
      this.startMusic();
      return;
    }

    const buffer = await this.bufferFor(cue.soundId);
    if (buffer === undefined || this.disposed || !this.unlocked) return;

    const source = graph.context.createBufferSource();
    const gain = graph.context.createGain();
    const attenuation = cue.position === undefined ? 1 : this.attenuationFor(cue.position, cue.radius ?? entry.radius);
    if (attenuation <= 0) return;
    source.buffer = buffer;
    setAudioParam(gain.gain, entry.volume * (cue.volume ?? 1) * attenuation, graph.context.currentTime);
    source.connect(gain);

    let panner: PannerNode | undefined;
    if (cue.position !== undefined) {
      panner = graph.context.createPanner();
      updatePanner(panner, cue.position, graph.context.currentTime);
      gain.connect(panner);
      panner.connect(graph.sfxGain);
    } else {
      gain.connect(graph.sfxGain);
    }

    source.addEventListener("ended", () => {
      disconnectNode(source);
      disconnectNode(gain);
      if (panner !== undefined) disconnectNode(panner);
    }, { once: true });
    source.start();
  }

  private bufferFor(soundId: SoundId): Promise<AudioBuffer | undefined> {
    const existing = this.buffers.get(soundId);
    if (existing !== undefined) return existing;

    const graph = this.ensureGraph();
    const entry = soundCatalogEntry(soundId);
    const load = this.host.fetch(entry.src, { signal: this.abortController.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${entry.src}`);
        return response.arrayBuffer();
      })
      .then((data) => graph.context.decodeAudioData(data))
      .catch((error: unknown) => {
        warnAudioFailure(`load ${soundId}`, error);
        // Evict the failed promise so a later attempt can retry the load.
        if (this.buffers.get(soundId) === load) this.buffers.delete(soundId);
        return undefined;
      });
    this.buffers.set(soundId, load);
    return load;
  }

  private reconcileAmbientLoops(): void {
    for (const entity of this.ambientLoops.keys()) {
      if (!this.ambientSnapshots.has(entity)) this.stopAmbientLoop(entity);
    }

    for (const [entity, snapshot] of this.ambientSnapshots) {
      const loop = this.ambientLoops.get(entity);
      if (loop !== undefined) {
        if (loop.soundId === snapshot.soundId) {
          this.updateAmbientLoop(loop, snapshot);
        } else {
          this.stopAmbientLoop(entity);
          void this.startAmbientLoop(snapshot);
        }
      } else {
        void this.startAmbientLoop(snapshot);
      }
    }
  }

  private async startAmbientLoop(snapshot: SoundEmitterSnapshot): Promise<void> {
    const graph = this.ensureGraph();
    const buffer = await this.bufferFor(snapshot.soundId);
    if (buffer === undefined || this.disposed || !this.unlocked || this.ambientLoops.has(snapshot.entity)) return;
    const latest = this.ambientSnapshots.get(snapshot.entity);
    // The decoded buffer belongs to snapshot.soundId; bail if the entity has
    // since been retargeted (or its id reused) to a different sound.
    if (latest === undefined || latest.soundId !== snapshot.soundId) return;

    const entry = soundCatalogEntry(latest.soundId);
    const source = graph.context.createBufferSource();
    const gain = graph.context.createGain();
    const panner = graph.context.createPanner();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(graph.ambientGain);
    const loop = { soundId: latest.soundId, source, gain, panner };
    this.updateAmbientLoop(loop, latest, 0);
    source.start();
    this.ambientLoops.set(latest.entity, loop);
    if (!entry.loop) source.loop = false;
  }

  private updateAmbientLoop(
    loop: AmbientLoop,
    snapshot: SoundEmitterSnapshot,
    rampSeconds = AMBIENT_GAIN_RAMP_SECONDS,
  ): void {
    const graph = this.ensureGraph();
    const entry = soundCatalogEntry(snapshot.soundId);
    const attenuation = this.attenuationFor(snapshot, snapshot.radius);
    rampAudioParam(
      loop.gain.gain,
      entry.volume * snapshot.volume * attenuation,
      graph.context.currentTime,
      rampSeconds,
    );
    updatePanner(loop.panner, snapshot, graph.context.currentTime);
  }

  private updateAmbientLoopGains(): void {
    for (const [entity, loop] of this.ambientLoops) {
      const snapshot = this.ambientSnapshots.get(entity);
      if (snapshot !== undefined) this.updateAmbientLoop(loop, snapshot);
    }
  }

  private attenuationFor(position: GridPoint, radius: number): number {
    if (this.listenerPosition === undefined) return 1;
    return soundAttenuationForDistance(gridDistance(this.listenerPosition, position), radius);
  }

  private stopAmbientLoop(entity: Entity): void {
    const loop = this.ambientLoops.get(entity);
    if (loop === undefined) return;
    try {
      loop.source.stop();
    } catch {
      // Already stopped.
    }
    disconnectNode(loop.source);
    disconnectNode(loop.gain);
    disconnectNode(loop.panner);
    this.ambientLoops.delete(entity);
  }

  private scheduleEnemyIdle(entity: Entity): void {
    if (this.enemyIdleTimers.has(entity)) return;
    const source = this.enemyIdleSources.get(entity);
    if (source === undefined) return;
    const delay = randomDelayMs(source.minDelayMs, source.maxDelayMs);
    const timer = this.host.setTimeout(() => {
      this.enemyIdleTimers.delete(entity);
      const latest = this.enemyIdleSources.get(entity);
      if (latest === undefined || !this.unlocked) return;
      this.playCues([{
        soundId: latest.soundId,
        position: { x: latest.x, y: latest.y },
        radius: latest.radius,
        volume: latest.volume,
      }]);
      this.scheduleEnemyIdle(entity);
    }, delay);
    this.enemyIdleTimers.set(entity, timer);
  }

  private clearEnemyIdleTimer(entity: Entity): void {
    const timer = this.enemyIdleTimers.get(entity);
    if (timer === undefined) return;
    this.host.clearTimeout(timer);
    this.enemyIdleTimers.delete(entity);
  }

  private queuePendingCues(cues: readonly SoundCue[]): void {
    for (const cue of cues) {
      this.pendingCues.push({ ...cue });
    }
  }

  private flushPendingCues(): void {
    const cues = this.pendingCues.splice(0);
    for (const cue of cues) void this.playCue(cue);
  }
}

function setAudioParam(param: AudioParam, value: number, now: number): void {
  param.setValueAtTime(value, now);
}

function rampAudioParam(param: AudioParam, value: number, now: number, rampSeconds: number): void {
  param.cancelScheduledValues(now);
  if (rampSeconds <= 0) {
    param.setValueAtTime(value, now);
    return;
  }
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + rampSeconds);
}

function updatePanner(panner: PannerNode, position: GridPoint, now: number): void {
  const point = soundPointForGrid(position);
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 1;
  panner.maxDistance = 10_000;
  panner.rolloffFactor = 0;
  setAudioParam(panner.positionX, point.x, now);
  setAudioParam(panner.positionY, point.y, now);
  setAudioParam(panner.positionZ, point.z, now);
}

function gridDistance(a: GridPoint, b: GridPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function copyGridPoint(point: GridPoint): GridPoint {
  return { x: point.x, y: point.y };
}

function copySoundEmitter(emitter: SoundEmitterSnapshot): SoundEmitterSnapshot {
  return {
    entity: emitter.entity,
    soundId: emitter.soundId,
    x: emitter.x,
    y: emitter.y,
    radius: emitter.radius,
    volume: emitter.volume,
  };
}

function copyEnemyIdleSoundSource(source: EnemyIdleSoundSource): EnemyIdleSoundSource {
  return {
    ...copySoundEmitter(source),
    minDelayMs: source.minDelayMs,
    maxDelayMs: source.maxDelayMs,
  };
}

function randomDelayMs(minDelayMs: number, maxDelayMs: number): number {
  const min = Math.max(0, Math.min(minDelayMs, maxDelayMs));
  const max = Math.max(min, maxDelayMs);
  return min + Math.floor(Math.random() * (max - min + 1));
}

function disconnectNode(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // Already disconnected.
  }
}

function warnAudioFailure(action: string, error: unknown): void {
  console.warn(`Failed to ${action}.`, error);
}
