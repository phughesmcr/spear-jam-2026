import { assertAlmostEquals, assertEquals } from "@std/assert";
import { createAudioRuntime, soundAttenuationForDistance } from "@/src/audio/audio_runtime.ts";
import { MUSIC_TRACKS, TrackId } from "@/src/audio/music_catalog.ts";

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
  const runtime = createAudioRuntime(host as unknown as Window);

  runtime.playMusic(TrackId.Title);

  assertEquals(host.audio.src, MUSIC_TRACKS[TrackId.Title].src);
  assertEquals(host.audio.playCalls, 0);
  assertEquals(host.context.mediaSourceCreations, 0);

  await runtime.unlock();
  assertEquals(host.audio.playCalls, 1);
  assertEquals(host.context.mediaSourceCreations, 1);

  runtime.playMusic(TrackId.Map2);
  assertEquals(host.audio.src, MUSIC_TRACKS[TrackId.Map2].src);
  assertEquals(host.audio.playCalls, 2);
  assertEquals(host.context.mediaSourceCreations, 1);

  runtime[Symbol.dispose]();
});

class FakeAudioWindow {
  readonly audio = new FakeAudioElement();
  readonly context = new FakeAudioContext();
  readonly document: Document;
  readonly AudioContext: new () => AudioContext;

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

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode;
  }

  createMediaElementSource(_element: HTMLMediaElement): MediaElementAudioSourceNode {
    this.mediaSourceCreations++;
    return new FakeAudioNode() as unknown as MediaElementAudioSourceNode;
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

class FakeAudioParam {
  value = 0;

  setValueAtTime(value: number, _startTime: number): AudioParam {
    this.value = value;
    return this as unknown as AudioParam;
  }
}
