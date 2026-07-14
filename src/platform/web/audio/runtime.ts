import type {
  AudioClip,
  AudioCue,
  AudioEmitter,
  AudioPoint,
  AudioRuntime,
  AudioTrack,
  AudioVolumes,
  IdleAudioSource,
  ListenerPose,
} from "@/src/engine/audio/mod.ts";

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
  readonly clipId: string;
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly panner: PannerNode;
};

type ActiveCue = {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly panner?: PannerNode;
};

const AMBIENT_GAIN_RAMP_SECONDS = 0.18;

export function createWebAudioRuntime(host: Window): AudioRuntime {
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
  private musicTrack?: AudioTrack;
  private musicElement?: HTMLAudioElement;
  private musicTrackGain?: GainNode;
  private readonly buffers = new Map<string, Promise<AudioBuffer | undefined>>();
  private readonly voiceBuffers = new Map<string, Promise<AudioBuffer | undefined>>();
  private voice?: AudioClip;
  private voiceSource?: AudioBufferSourceNode;
  private voiceRequest = 0;
  private readonly ambientSnapshots = new Map<number, AudioEmitter>();
  private readonly ambientLoops = new Map<number, AmbientLoop>();
  private readonly idleSources = new Map<number, IdleAudioSource>();
  private readonly idleTimers = new Map<number, number>();
  private readonly pendingCues: AudioCue[] = [];
  private readonly activeCues = new Set<ActiveCue>();
  private soundRequest = 0;
  private readonly abortController = new AbortController();
  private listenerPosition?: AudioPoint;
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
    if (this.musicTrack !== undefined) this.playMusicNow(this.musicTrack);
    if (this.voice !== undefined) {
      void this.startVoice(this.voice, this.voiceRequest);
    }
    this.flushPendingCues();
    this.reconcileAmbientLoops();
    for (const id of this.idleSources.keys()) this.scheduleIdle(id);
  }

  playMusic(track: AudioTrack): void {
    if (this.disposed) return;
    this.musicTrack = track;
    this.prepareMusicElement(track);
    if (this.unlocked) this.playMusicNow(track);
  }

  stopSounds(): void {
    if (this.disposed) return;
    this.soundRequest++;
    this.pendingCues.length = 0;
    this.setVoice(undefined);
    this.syncAmbientEmitters([]);
    this.syncIdleSources([]);
    for (const cue of this.activeCues) this.stopActiveCue(cue);
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

  updateListener(pose: ListenerPose): void {
    this.listenerPosition = copyPoint(pose.position);
    if (this.graph === undefined) return;
    const listener = this.graph.context.listener;
    setAudioParam(listener.positionX, pose.position.x, this.graph.context.currentTime);
    setAudioParam(listener.positionY, pose.position.y, this.graph.context.currentTime);
    setAudioParam(listener.positionZ, pose.position.z, this.graph.context.currentTime);
    setAudioParam(listener.forwardX, pose.forward.x, this.graph.context.currentTime);
    setAudioParam(listener.forwardY, pose.forward.y, this.graph.context.currentTime);
    setAudioParam(listener.forwardZ, pose.forward.z, this.graph.context.currentTime);
    setAudioParam(listener.upX, pose.up.x, this.graph.context.currentTime);
    setAudioParam(listener.upY, pose.up.y, this.graph.context.currentTime);
    setAudioParam(listener.upZ, pose.up.z, this.graph.context.currentTime);
    this.updateAmbientLoopGains();
  }

  playCues(cues: readonly AudioCue[]): void {
    if (this.disposed || cues.length === 0) return;
    if (!this.unlocked) {
      this.queuePendingCues(cues);
      return;
    }
    for (const cue of cues) void this.playCue(cue, this.soundRequest);
  }

  setVoice(voice: AudioClip | undefined): void {
    if (this.disposed) return;
    this.voice = voice;
    this.voiceRequest++;
    this.stopVoice();
    if (this.unlocked && voice !== undefined) {
      void this.startVoice(voice, this.voiceRequest);
    }
  }

  syncAmbientEmitters(emitters: readonly AudioEmitter[]): void {
    this.ambientSnapshots.clear();
    for (const emitter of emitters) this.ambientSnapshots.set(emitter.id, copyAudioEmitter(emitter));
    if (this.unlocked) this.reconcileAmbientLoops();
  }

  syncIdleSources(sources: readonly IdleAudioSource[]): void {
    const nextIds = new Set<number>();
    for (const source of sources) {
      nextIds.add(source.id);
      this.idleSources.set(source.id, copyIdleAudioSource(source));
      if (this.unlocked) this.scheduleIdle(source.id);
    }

    for (const id of this.idleSources.keys()) {
      if (nextIds.has(id)) continue;
      this.idleSources.delete(id);
      this.clearIdleTimer(id);
    }
  }

  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.stopSounds();
    this.disposed = true;
    this.unlocked = false;
    this.musicTrack = undefined;
    this.abortController.abort();
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

  private playMusicNow(track: AudioTrack): void {
    const graph = this.ensureGraph();
    const audio = this.prepareMusicElement(track);
    let gain = this.musicTrackGain;
    if (gain === undefined) {
      const source = graph.context.createMediaElementSource(audio);
      gain = graph.context.createGain();
      source.connect(gain);
      gain.connect(graph.musicGain);
      this.musicTrackGain = gain;
    }
    setAudioParam(gain.gain, track.volume, graph.context.currentTime);
    void audio.play().catch((error: unknown) => warnAudioFailure("play music", error));
  }

  private prepareMusicElement(track: AudioTrack): HTMLAudioElement {
    const audio = this.musicElement ?? this.host.document.createElement("audio");
    if (this.musicElement === undefined) {
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      this.musicElement = audio;
    }
    if (audio.src !== track.src) {
      audio.pause();
      audio.src = track.src;
      audio.loop = track.loop;
    }
    return audio;
  }

  private async playCue(cue: AudioCue, request: number): Promise<void> {
    const graph = this.ensureGraph();
    const buffer = await this.bufferFor(cue.clip);
    if (buffer === undefined || this.disposed || !this.unlocked || request !== this.soundRequest) return;

    const source = graph.context.createBufferSource();
    const gain = graph.context.createGain();
    const attenuation = cue.position === undefined ?
      1 :
      this.attenuationFor(cue.position, cue.radius ?? cue.clip.radius);
    if (attenuation <= 0) return;
    source.buffer = buffer;
    setAudioParam(gain.gain, cue.clip.volume * (cue.volume ?? 1) * attenuation, graph.context.currentTime);
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

    const activeCue = panner === undefined ? { source, gain } : { source, gain, panner };
    this.activeCues.add(activeCue);
    source.addEventListener("ended", () => this.finishActiveCue(activeCue), { once: true });
    source.start();
  }

  private stopActiveCue(cue: ActiveCue): void {
    try {
      cue.source.stop();
    } catch {
      // Already stopped.
    }
    this.finishActiveCue(cue);
  }

  private finishActiveCue(cue: ActiveCue): void {
    if (!this.activeCues.delete(cue)) return;
    disconnectNode(cue.source);
    disconnectNode(cue.gain);
    if (cue.panner !== undefined) disconnectNode(cue.panner);
  }

  private bufferFor(clip: AudioClip): Promise<AudioBuffer | undefined> {
    return this.decodedBufferFor(clip.id, clip.src, this.buffers);
  }

  private voiceBufferFor(voice: AudioClip): Promise<AudioBuffer | undefined> {
    return this.decodedBufferFor(voice.id, voice.src, this.voiceBuffers);
  }

  private decodedBufferFor<Key>(
    key: Key,
    src: string,
    buffers: Map<Key, Promise<AudioBuffer | undefined>>,
  ): Promise<AudioBuffer | undefined> {
    const existing = buffers.get(key);
    if (existing !== undefined) return existing;

    const graph = this.ensureGraph();
    const load = this.host.fetch(src, { signal: this.abortController.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${src}`);
        return response.arrayBuffer();
      })
      .then((data) => graph.context.decodeAudioData(data))
      .catch((error: unknown) => {
        warnAudioFailure(`load ${String(key)}`, error);
        // Evict the failed promise so a later attempt can retry the load.
        if (buffers.get(key) === load) buffers.delete(key);
        return undefined;
      });
    buffers.set(key, load);
    return load;
  }

  private async startVoice(voice: AudioClip, request: number): Promise<void> {
    const graph = this.ensureGraph();
    const buffer = await this.voiceBufferFor(voice);
    if (
      buffer === undefined || this.disposed || !this.unlocked || this.voice?.id !== voice.id ||
      this.voiceRequest !== request
    ) return;

    const source = graph.context.createBufferSource();
    source.buffer = buffer;
    source.connect(graph.sfxGain);
    source.addEventListener("ended", () => {
      if (this.voiceSource === source) this.voiceSource = undefined;
      disconnectNode(source);
    }, { once: true });
    this.voiceSource = source;
    source.start();
  }

  private stopVoice(): void {
    const source = this.voiceSource;
    if (source === undefined) return;
    this.voiceSource = undefined;
    source.stop();
    disconnectNode(source);
  }

  private reconcileAmbientLoops(): void {
    for (const id of this.ambientLoops.keys()) {
      if (!this.ambientSnapshots.has(id)) this.stopAmbientLoop(id);
    }

    for (const [id, snapshot] of this.ambientSnapshots) {
      const loop = this.ambientLoops.get(id);
      if (loop !== undefined) {
        if (loop.clipId === snapshot.clip.id) {
          this.updateAmbientLoop(loop, snapshot);
        } else {
          this.stopAmbientLoop(id);
          void this.startAmbientLoop(snapshot);
        }
      } else {
        void this.startAmbientLoop(snapshot);
      }
    }
  }

  private async startAmbientLoop(snapshot: AudioEmitter): Promise<void> {
    const graph = this.ensureGraph();
    const buffer = await this.bufferFor(snapshot.clip);
    if (buffer === undefined || this.disposed || !this.unlocked || this.ambientLoops.has(snapshot.id)) return;
    const latest = this.ambientSnapshots.get(snapshot.id);
    // The decoded buffer belongs to snapshot.clip; bail if the id has since
    // been retargeted to a different clip.
    if (latest === undefined || latest.clip.id !== snapshot.clip.id) return;

    const source = graph.context.createBufferSource();
    const gain = graph.context.createGain();
    const panner = graph.context.createPanner();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    gain.connect(panner);
    panner.connect(graph.ambientGain);
    const loop = { clipId: latest.clip.id, source, gain, panner };
    this.updateAmbientLoop(loop, latest, 0);
    source.start();
    this.ambientLoops.set(latest.id, loop);
    if (!latest.clip.loop) source.loop = false;
  }

  private updateAmbientLoop(
    loop: AmbientLoop,
    snapshot: AudioEmitter,
    rampSeconds = AMBIENT_GAIN_RAMP_SECONDS,
  ): void {
    const graph = this.ensureGraph();
    const attenuation = this.attenuationFor(snapshot.position, snapshot.radius);
    rampAudioParam(
      loop.gain.gain,
      snapshot.clip.volume * snapshot.volume * attenuation,
      graph.context.currentTime,
      rampSeconds,
    );
    updatePanner(loop.panner, snapshot.position, graph.context.currentTime);
  }

  private updateAmbientLoopGains(): void {
    for (const [id, loop] of this.ambientLoops) {
      const snapshot = this.ambientSnapshots.get(id);
      if (snapshot !== undefined) this.updateAmbientLoop(loop, snapshot);
    }
  }

  private attenuationFor(position: AudioPoint, radius: number): number {
    if (this.listenerPosition === undefined) return 1;
    return soundAttenuationForDistance(pointDistance(this.listenerPosition, position), radius);
  }

  private stopAmbientLoop(id: number): void {
    const loop = this.ambientLoops.get(id);
    if (loop === undefined) return;
    try {
      loop.source.stop();
    } catch {
      // Already stopped.
    }
    disconnectNode(loop.source);
    disconnectNode(loop.gain);
    disconnectNode(loop.panner);
    this.ambientLoops.delete(id);
  }

  private scheduleIdle(id: number): void {
    if (this.idleTimers.has(id)) return;
    const source = this.idleSources.get(id);
    if (source === undefined) return;
    const delay = randomDelayMs(source.minDelayMs, source.maxDelayMs);
    const timer = this.host.setTimeout(() => {
      this.idleTimers.delete(id);
      const latest = this.idleSources.get(id);
      if (latest === undefined || !this.unlocked) return;
      this.playCues([{
        clip: latest.clip,
        position: latest.position,
        radius: latest.radius,
        volume: latest.volume,
      }]);
      this.scheduleIdle(id);
    }, delay);
    this.idleTimers.set(id, timer);
  }

  private clearIdleTimer(id: number): void {
    const timer = this.idleTimers.get(id);
    if (timer === undefined) return;
    this.host.clearTimeout(timer);
    this.idleTimers.delete(id);
  }

  private queuePendingCues(cues: readonly AudioCue[]): void {
    for (const cue of cues) {
      this.pendingCues.push({ ...cue });
    }
  }

  private flushPendingCues(): void {
    const cues = this.pendingCues.splice(0);
    for (const cue of cues) void this.playCue(cue, this.soundRequest);
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

function updatePanner(panner: PannerNode, point: AudioPoint, now: number): void {
  panner.panningModel = "HRTF";
  panner.distanceModel = "inverse";
  panner.refDistance = 1;
  panner.maxDistance = 10_000;
  panner.rolloffFactor = 0;
  setAudioParam(panner.positionX, point.x, now);
  setAudioParam(panner.positionY, point.y, now);
  setAudioParam(panner.positionZ, point.z, now);
}

function pointDistance(a: AudioPoint, b: AudioPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function copyPoint(point: AudioPoint): AudioPoint {
  return { x: point.x, y: point.y, z: point.z };
}

function copyAudioEmitter(emitter: AudioEmitter): AudioEmitter {
  return {
    id: emitter.id,
    clip: { ...emitter.clip },
    position: copyPoint(emitter.position),
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

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume));
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
