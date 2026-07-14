import { assertAlmostEquals, assertEquals } from "@std/assert";
import type { AudioClip, AudioTrack } from "@/src/engine/audio/mod.ts";
import { createWebAudioRuntime, soundAttenuationForDistance } from "@/src/platform/web/audio/runtime.ts";

const TITLE_TRACK: AudioTrack = { id: "title", src: "title.mp3", volume: 0.8, loop: true };
const MAP_TRACK: AudioTrack = { id: "map", src: "map.mp3", volume: 0.7, loop: true };
const GREETING_VOICE: AudioClip = { id: "greeting", src: "greeting.wav", volume: 1, loop: false, radius: 0 };
const CODES_VOICE: AudioClip = { id: "codes", src: "codes.wav", volume: 1, loop: false, radius: 0 };
const PICKUP_CLIP: AudioClip = { id: "pickup", src: "pickup.wav", volume: 0.55, loop: false, radius: 3 };

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

async function settlePromises(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

class FakeAudioWindow {
  readonly audio = new FakeAudioElement();
  readonly context = new FakeAudioContext();
  readonly document: Document;
  readonly AudioContext: new () => AudioContext;
  readonly fetched: string[] = [];

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

  fetch(input: URL | RequestInfo): Promise<Response> {
    this.fetched.push(String(input));
    return Promise.resolve(new Response(new Uint8Array([1])));
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
  readonly bufferSources: FakeBufferSourceNode[] = [];

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode;
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

  decodeAudioData(_audioData: ArrayBuffer): Promise<AudioBuffer> {
    return Promise.resolve({} as AudioBuffer);
  }

  resume(): Promise<void> {
    this.state = "running";
    return Promise.resolve();
  }

  close(): Promise<void> {
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

class FakeAudioParam {
  value = 0;

  setValueAtTime(value: number, _startTime: number): AudioParam {
    this.value = value;
    return this as unknown as AudioParam;
  }
}
