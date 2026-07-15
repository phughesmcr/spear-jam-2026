import { assertAlmostEquals, assertEquals } from "@std/assert";
import type { AudioClip, AudioEmitter, AudioTrack, IdleAudioSource } from "@/src/engine/audio/mod.ts";
import { createWebAudioRuntime } from "@/src/platform/web/audio/mod.ts";
import { soundAttenuationForDistance } from "@/src/platform/web/audio/spatial.ts";

const TITLE_TRACK: AudioTrack = { id: "title", src: "title.mp3", volume: 0.8, loop: true };
const MAP_TRACK: AudioTrack = { id: "map", src: "map.mp3", volume: 0.7, loop: true };
const GREETING_VOICE: AudioClip = { id: "greeting", src: "greeting.wav", volume: 1, loop: false, radius: 0 };
const CODES_VOICE: AudioClip = { id: "codes", src: "codes.wav", volume: 1, loop: false, radius: 0 };
const PICKUP_CLIP: AudioClip = { id: "pickup", src: "pickup.wav", volume: 0.55, loop: false, radius: 3 };
const HUM_CLIP: AudioClip = { id: "hum", src: "hum.wav", volume: 0.4, loop: true, radius: 5 };

Deno.test("sound attenuation falls off inside the authored tile radius", () => {
  assertEquals(soundAttenuationForDistance(0, 2), 1);
  assertAlmostEquals(soundAttenuationForDistance(1, 2), 2 / 3);
  assertAlmostEquals(soundAttenuationForDistance(2, 2), 1 / 3);
  assertEquals(soundAttenuationForDistance(3, 2), 0);
});

Deno.test("sound attenuation clamps invalid distances and radii", () => {
  assertEquals(soundAttenuationForDistance(-1, 2), 1);
  assertEquals(soundAttenuationForDistance(0, -1), 1);
  assertEquals(soundAttenuationForDistance(1, -1), 0);
});

Deno.test("music preloads before audio unlock and reuses one media element between tracks", async () => {
  const host = new FakeAudioWindow();
  const runtime = createWebAudioRuntime(host as unknown as Window);

  runtime.playMusic(TITLE_TRACK);

  assertEquals(host.audio.src, TITLE_TRACK.src);
  assertEquals(host.audio.playCalls, 0);
  assertEquals(host.context.mediaSourceCreations, 0);

  await runtime.unlock();
  assertEquals(host.audio.playCalls, 1);
  assertEquals(host.context.mediaSourceCreations, 1);

  runtime.playMusic(MAP_TRACK);
  assertEquals(host.audio.src, MAP_TRACK.src);
  assertEquals(host.audio.playCalls, 2);
  assertEquals(host.context.mediaSourceCreations, 1);

  runtime[Symbol.dispose]();
});

Deno.test("dialogue voice waits for unlock and replaces or stops the active line", async () => {
  const host = new FakeAudioWindow();
  const runtime = createWebAudioRuntime(host as unknown as Window);

  runtime.setVoice(GREETING_VOICE);
  assertEquals(host.context.bufferSources.length, 0);

  await runtime.unlock();
  await settlePromises();
  assertEquals(host.fetched, [GREETING_VOICE.src]);
  assertEquals(host.context.bufferSources.length, 1);
  assertEquals(host.context.bufferSources[0]?.startCalls, 1);

  runtime.setVoice(CODES_VOICE);
  await settlePromises();
  assertEquals(host.context.bufferSources[0]?.stopCalls, 1);
  assertEquals(host.context.bufferSources[1]?.startCalls, 1);

  runtime.setVoice(undefined);
  assertEquals(host.context.bufferSources[1]?.stopCalls, 1);

  runtime[Symbol.dispose]();
});

Deno.test("dialogue voice ignores a stale decode after the selected line changes", async () => {
  const host = new FakeAudioWindow();
  const greetingResponse = Promise.withResolvers<Response>();
  host.queueFetch(greetingResponse.promise);
  const runtime = createWebAudioRuntime(host as unknown as Window);

  runtime.setVoice(GREETING_VOICE);
  await runtime.unlock();
  runtime.setVoice(CODES_VOICE);
  await settlePromises();
  assertEquals(host.context.bufferSources.length, 1);

  greetingResponse.resolve(new Response(new Uint8Array([1])));
  await settlePromises();
  assertEquals(host.context.bufferSources.length, 1);
  assertEquals(host.fetched, [GREETING_VOICE.src, CODES_VOICE.src]);
  runtime[Symbol.dispose]();
});

Deno.test("stopSounds stops active effects and dialogue while leaving music available", async () => {
  const host = new FakeAudioWindow();
  const runtime = createWebAudioRuntime(host as unknown as Window);

  await runtime.unlock();
  runtime.setVoice(GREETING_VOICE);
  runtime.playCues([{ clip: PICKUP_CLIP }]);
  await settlePromises();
  assertEquals(host.context.bufferSources.length, 2);

  runtime.stopSounds();
  assertEquals(host.context.bufferSources.map((source) => source.stopCalls), [1, 1]);

  runtime.playMusic(TITLE_TRACK);
  assertEquals(host.audio.src, TITLE_TRACK.src);
  assertEquals(host.audio.playCalls, 1);

  runtime[Symbol.dispose]();
});

Deno.test("queued cues flush once when audio unlocks", async () => {
  const host = new FakeAudioWindow();
  const runtime = createWebAudioRuntime(host as unknown as Window);

  runtime.playCues([{ clip: PICKUP_CLIP }]);
  assertEquals(host.context.bufferSources.length, 0);

  await runtime.unlock();
  await runtime.unlock();
  await settlePromises();

  assertEquals(host.fetched, [PICKUP_CLIP.src]);
  assertEquals(host.context.bufferSources.length, 1);
  assertEquals(host.context.bufferSources[0]?.startCalls, 1);
  runtime[Symbol.dispose]();
});

Deno.test("stopSounds prevents an in-flight cue decode from starting", async () => {
  const host = new FakeAudioWindow();
  const response = Promise.withResolvers<Response>();
  host.queueFetch(response.promise);
  const runtime = createWebAudioRuntime(host as unknown as Window);

  await runtime.unlock();
  runtime.playCues([{ clip: PICKUP_CLIP }]);
  runtime.stopSounds();
  response.resolve(new Response(new Uint8Array([1])));
  await settlePromises();

  assertEquals(host.context.bufferSources.length, 0);
  runtime[Symbol.dispose]();
});

Deno.test("failed decoded-buffer loads are evicted so the next cue retries", async () => {
  const host = new FakeAudioWindow();
  host.queueFetch(Promise.resolve(new Response(undefined, { status: 500 })));
  const runtime = createWebAudioRuntime(host as unknown as Window);

  await runtime.unlock();
  runtime.playCues([{ clip: PICKUP_CLIP }]);
  await settlePromises();
  runtime.playCues([{ clip: PICKUP_CLIP }]);
  await settlePromises();

  assertEquals(host.fetched, [PICKUP_CLIP.src, PICKUP_CLIP.src]);
  assertEquals(host.context.bufferSources.length, 1);
  runtime[Symbol.dispose]();
});

Deno.test("ambient loops and idle timers follow the latest world snapshot", async () => {
  const host = new FakeAudioWindow();
  const runtime = createWebAudioRuntime(host as unknown as Window);
  const ambient: AudioEmitter = {
    id: 1,
    clip: HUM_CLIP,
    position: { x: 2, y: 0, z: 0 },
    radius: 5,
    volume: 0.75,
  };
  const idle: IdleAudioSource = { ...ambient, clip: PICKUP_CLIP, minDelayMs: 100, maxDelayMs: 100 };

  runtime.syncAmbientEmitters([ambient]);
  runtime.syncIdleSources([idle]);
  await runtime.unlock();
  await settlePromises();

  assertEquals(host.context.bufferSources.length, 1);
  assertEquals(host.context.bufferSources[0]?.loop, true);
  assertEquals(host.pendingTimerCount, 1);

  runtime.syncAmbientEmitters([]);
  runtime.syncIdleSources([]);
  assertEquals(host.context.bufferSources[0]?.stopCalls, 1);
  assertEquals(host.pendingTimerCount, 0);
  runtime[Symbol.dispose]();
});

Deno.test("ambient retargeting rejects a stale decode and copies the replacement snapshot", async () => {
  const host = new FakeAudioWindow();
  const humResponse = Promise.withResolvers<Response>();
  host.queueFetch(humResponse.promise);
  const runtime = createWebAudioRuntime(host as unknown as Window);
  const replacementPosition = { x: 7, y: 0, z: 3 };

  runtime.syncAmbientEmitters([{
    id: 1,
    clip: HUM_CLIP,
    position: { x: 2, y: 0, z: 0 },
    radius: 5,
    volume: 0.75,
  }]);
  await runtime.unlock();
  runtime.syncAmbientEmitters([{
    id: 1,
    clip: PICKUP_CLIP,
    position: replacementPosition,
    radius: 3,
    volume: 0.5,
  }]);
  replacementPosition.x = 99;
  await settlePromises();

  humResponse.resolve(new Response(new Uint8Array([1])));
  await settlePromises();

  assertEquals(host.fetched, [HUM_CLIP.src, PICKUP_CLIP.src]);
  assertEquals(host.context.bufferSources.length, 1);
  assertEquals(host.context.bufferSources[0]?.loop, false);
  assertEquals(host.context.panners[0]?.positionX.value, 7);
  runtime[Symbol.dispose]();
});

Deno.test("idle timers play the latest copied snapshot and reschedule once", async () => {
  const host = new FakeAudioWindow();
  const runtime = createWebAudioRuntime(host as unknown as Window);
  const position = { x: 4, y: 0, z: 6 };
  const idle: IdleAudioSource = {
    id: 2,
    clip: PICKUP_CLIP,
    position,
    radius: 3,
    volume: 0.25,
    minDelayMs: 100,
    maxDelayMs: 100,
  };

  runtime.syncIdleSources([idle]);
  await runtime.unlock();
  position.x = 99;
  host.runNextTimer();
  await settlePromises();

  assertEquals(host.context.bufferSources.length, 1);
  assertEquals(host.context.panners[0]?.positionX.value, 4);
  assertAlmostEquals(host.context.gains.at(-1)!.gain.value, PICKUP_CLIP.volume * idle.volume);
  assertEquals(host.pendingTimerCount, 1);
  runtime[Symbol.dispose]();
});

Deno.test("disposal is idempotent and prevents late decoded audio from starting", async () => {
  const host = new FakeAudioWindow();
  const response = Promise.withResolvers<Response>();
  host.queueFetch(response.promise);
  const runtime = createWebAudioRuntime(host as unknown as Window);

  await runtime.unlock();
  runtime.playCues([{ clip: PICKUP_CLIP }]);
  assertEquals(host.fetchSignals[0]?.aborted, false);
  runtime[Symbol.dispose]();
  runtime[Symbol.dispose]();
  assertEquals(host.fetchSignals[0]?.aborted, true);
  response.resolve(new Response(new Uint8Array([1])));
  await settlePromises();

  assertEquals(host.context.closeCalls, 1);
  assertEquals(host.context.bufferSources.length, 0);
});

async function settlePromises(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

class FakeAudioWindow {
  readonly audio = new FakeAudioElement();
  readonly context = new FakeAudioContext();
  readonly document: Document;
  readonly AudioContext: new () => AudioContext;
  readonly fetched: string[] = [];
  readonly fetchSignals: AbortSignal[] = [];
  private readonly fetchResponses: Promise<Response>[] = [];
  private readonly timers = new Map<number, () => void>();
  private nextTimer = 1;

  constructor() {
    this.document = {
      createElement: (tagName: string) => {
        if (tagName !== "audio") throw new Error(`Unexpected element ${tagName}.`);
        return this.audio;
      },
    } as unknown as Document;
    const context = this.context;
    this.AudioContext = function AudioContextConstructor(): FakeAudioContext {
      return context;
    } as unknown as new () => AudioContext;
  }

  fetch(input: URL | RequestInfo, init?: RequestInit): Promise<Response> {
    this.fetched.push(String(input));
    if (init?.signal != null) this.fetchSignals.push(init.signal);
    return this.fetchResponses.shift() ?? Promise.resolve(new Response(new Uint8Array([1])));
  }

  queueFetch(response: Promise<Response>): void {
    this.fetchResponses.push(response);
  }

  setTimeout(handler: TimerHandler): number {
    const id = this.nextTimer++;
    this.timers.set(id, handler as () => void);
    return id;
  }

  clearTimeout(id: number): void {
    this.timers.delete(id);
  }

  get pendingTimerCount(): number {
    return this.timers.size;
  }

  runNextTimer(): void {
    const next = this.timers.entries().next().value as [number, () => void] | undefined;
    if (next === undefined) throw new Error("No pending timer.");
    this.timers.delete(next[0]);
    next[1]();
  }
}

class FakeAudioElement {
  src = "";
  loop = false;
  preload = "";
  crossOrigin: string | null = null;
  playCalls = 0;
  pauseCalls = 0;

  play(): Promise<void> {
    this.playCalls++;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls++;
  }
}

class FakeAudioContext {
  readonly currentTime = 0;
  readonly destination = new FakeAudioNode() as unknown as AudioDestinationNode;
  readonly listener = {
    positionX: new FakeAudioParam(),
    positionY: new FakeAudioParam(),
    positionZ: new FakeAudioParam(),
    forwardX: new FakeAudioParam(),
    forwardY: new FakeAudioParam(),
    forwardZ: new FakeAudioParam(),
    upX: new FakeAudioParam(),
    upY: new FakeAudioParam(),
    upZ: new FakeAudioParam(),
  } as unknown as AudioListener;
  state: AudioContextState = "suspended";
  mediaSourceCreations = 0;
  closeCalls = 0;
  readonly bufferSources: FakeBufferSourceNode[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly panners: FakePannerNode[] = [];

  createGain(): GainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain as unknown as GainNode;
  }

  createMediaElementSource(_element: HTMLMediaElement): MediaElementAudioSourceNode {
    this.mediaSourceCreations++;
    return new FakeAudioNode() as unknown as MediaElementAudioSourceNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSourceNode();
    this.bufferSources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createPanner(): PannerNode {
    const panner = new FakePannerNode();
    this.panners.push(panner);
    return panner as unknown as PannerNode;
  }

  decodeAudioData(_audioData: ArrayBuffer): Promise<AudioBuffer> {
    return Promise.resolve({} as AudioBuffer);
  }

  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closeCalls++;
    this.state = "closed";
    return Promise.resolve();
  }
}

class FakeAudioNode {
  connect(_destination: AudioNode): AudioNode {
    return _destination;
  }

  disconnect(): void {}
}

class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam();
}

class FakeBufferSourceNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  startCalls = 0;
  stopCalls = 0;

  addEventListener(
    _type: string,
    _listener: EventListenerOrEventListenerObject,
    _options?: AddEventListenerOptions,
  ): void {}

  start(): void {
    this.startCalls++;
  }

  stop(): void {
    this.stopCalls++;
  }
}

class FakePannerNode extends FakeAudioNode {
  readonly positionX = new FakeAudioParam();
  readonly positionY = new FakeAudioParam();
  readonly positionZ = new FakeAudioParam();
  panningModel: PanningModelType = "equalpower";
  distanceModel: DistanceModelType = "inverse";
  refDistance = 1;
  maxDistance = 10_000;
  rolloffFactor = 1;
}

class FakeAudioParam {
  value = 0;

  setValueAtTime(value: number, _startTime: number): AudioParam {
    this.value = value;
    return this as unknown as AudioParam;
  }

  cancelScheduledValues(_cancelTime: number): AudioParam {
    return this as unknown as AudioParam;
  }

  linearRampToValueAtTime(value: number, _endTime: number): AudioParam {
    this.value = value;
    return this as unknown as AudioParam;
  }
}
