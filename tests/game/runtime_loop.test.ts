import type { AudioRuntime } from "@/src/audio/audio_runtime.ts";
import { createGameRuntimeLoop } from "@/src/game/runtime_loop.ts";
import type { RuntimeSession } from "@/src/game/session_ports.ts";
import { type EnemyIdleSoundSource, type SoundCue, type SoundEmitterSnapshot, SoundId } from "@/src/game/sound.ts";
import type { PlayerStatusSnapshot } from "@/src/game/state.ts";
import { createGameModel, type GameModel } from "@/src/game/transition.ts";
import { Direction } from "@/src/grid/direction.ts";
import { createGameMap } from "@/src/map/map.ts";
import type { FirstPersonRenderer } from "@/src/render/first_person.ts";
import type { Entity } from "@phughesmcr/miski";
import { assertEquals } from "@std/assert";

const EMITTER = 2 as Entity;

Deno.test("runtime renderNow cancels a pending RAF before rendering immediately", () => {
  const window = new FakeWindow();
  const audio = new FakeAudioRuntime();
  let model = modelNeedingFrame();
  const runtime = createGameRuntimeLoop({
    host: window as unknown as Window,
    document: new FakeDocument() as unknown as Document,
    ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
    signal: new AbortController().signal,
    getModel: () => model,
    getSession: () => undefined,
    dependencies: { audio, firstPersonRenderer: fakeFirstPersonRenderer() },
  });

  runtime.start();
  runtime.renderNow();
  runtime.renderNow();

  assertEquals(window.requestedFrameIds, [1, 2]);
  assertEquals(window.cancelledFrameIds, [1]);
  model = modelWithoutFrame();
  runtime[Symbol.dispose]();
});

Deno.test("runtime RAF callback clears the pending frame before requesting another", () => {
  const window = new FakeWindow();
  const runtime = createGameRuntimeLoop({
    host: window as unknown as Window,
    document: new FakeDocument() as unknown as Document,
    ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
    signal: new AbortController().signal,
    getModel: () => modelNeedingFrame(),
    getSession: () => undefined,
    dependencies: { audio: new FakeAudioRuntime(), firstPersonRenderer: fakeFirstPersonRenderer() },
  });

  runtime.start();
  runtime.renderNow();
  window.runFrame(1, 32);

  assertEquals(window.requestedFrameIds, [1, 2]);
  assertEquals(window.cancelledFrameIds, []);
  runtime[Symbol.dispose]();
});

Deno.test("runtime RAF skips work until the interactive fps budget elapses", () => {
  const window = new FakeWindow();
  let updateCount = 0;
  const nowMs = 1_000;
  const originalNow = performance.now.bind(performance);
  Object.defineProperty(performance, "now", {
    configurable: true,
    value: () => nowMs,
  });

  try {
    const runtime = createGameRuntimeLoop({
      host: window as unknown as Window,
      document: new FakeDocument() as unknown as Document,
      ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
      signal: new AbortController().signal,
      getModel: () => {
        updateCount++;
        return modelNeedingFrame();
      },
      getSession: () => undefined,
      dependencies: { audio: new FakeAudioRuntime(), firstPersonRenderer: fakeFirstPersonRenderer() },
    });

    runtime.start();
    runtime.renderNow();
    assertEquals(updateCount, 1);

    // First scheduled RAF is too soon after renderNow — reschedule without rendering.
    window.runFrame(1, nowMs + 1);
    assertEquals(updateCount, 1);
    assertEquals(window.requestedFrameIds, [1, 2]);

    // Past the ~28.6 ms budget — render again.
    window.runFrame(2, nowMs + 40);
    assertEquals(updateCount, 2);
    runtime[Symbol.dispose]();
  } finally {
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: originalNow,
    });
  }
});

Deno.test("runtime RAF uses the model interactiveFps for the interactive budget", () => {
  const window = new FakeWindow();
  let updateCount = 0;
  const nowMs = 1_000;
  const originalNow = performance.now.bind(performance);
  Object.defineProperty(performance, "now", {
    configurable: true,
    value: () => nowMs,
  });

  try {
    const runtime = createGameRuntimeLoop({
      host: window as unknown as Window,
      document: new FakeDocument() as unknown as Document,
      ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
      signal: new AbortController().signal,
      getModel: () => {
        updateCount++;
        return { ...modelNeedingFrame(), interactiveFps: 12 };
      },
      getSession: () => undefined,
      dependencies: { audio: new FakeAudioRuntime(), firstPersonRenderer: fakeFirstPersonRenderer() },
    });

    runtime.start();
    runtime.renderNow();
    assertEquals(updateCount, 1);

    // Still inside the 12 fps (~83 ms) budget — reschedule without rendering.
    window.runFrame(1, nowMs + 40);
    assertEquals(updateCount, 1);
    assertEquals(window.requestedFrameIds, [1, 2]);

    // Past the 12 fps budget — render again.
    window.runFrame(2, nowMs + 90);
    assertEquals(updateCount, 2);
    runtime[Symbol.dispose]();
  } finally {
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: originalNow,
    });
  }
});

Deno.test("runtime RAF uses a 12 fps budget for ambient-only first-person animation", () => {
  const window = new FakeWindow();
  let updateCount = 0;
  const nowMs = 1_000;
  const originalNow = performance.now.bind(performance);
  Object.defineProperty(performance, "now", {
    configurable: true,
    value: () => nowMs,
  });
  const originalOffscreen = globalThis.OffscreenCanvas;
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    configurable: true,
    writable: true,
    value: FakeOffscreenCanvas as unknown as typeof OffscreenCanvas,
  });

  try {
    const runtime = createGameRuntimeLoop({
      host: window as unknown as Window,
      document: new FakeDocument() as unknown as Document,
      ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
      signal: new AbortController().signal,
      getModel: () => {
        updateCount++;
        return playingModel();
      },
      getSession: () => fakePlayingSession(),
      dependencies: {
        audio: new FakeAudioRuntime(),
        firstPersonRenderer: fakeFirstPersonRenderer({ needsFrame: true, ambientOnly: true }),
      },
    });

    runtime.start();
    runtime.renderNow();
    assertEquals(updateCount, 1);

    // Still inside the ambient ~83 ms budget — reschedule without rendering.
    window.runFrame(1, nowMs + 40);
    assertEquals(updateCount, 1);
    assertEquals(window.requestedFrameIds, [1, 2]);

    // Past the ambient budget — render again.
    window.runFrame(2, nowMs + 90);
    assertEquals(updateCount, 2);
    runtime[Symbol.dispose]();
  } finally {
    Object.defineProperty(performance, "now", {
      configurable: true,
      value: originalNow,
    });
    Object.defineProperty(globalThis, "OffscreenCanvas", {
      configurable: true,
      writable: true,
      value: originalOffscreen,
    });
  }
});

Deno.test("runtime dispose cancels pending RAF and disposes audio", () => {
  const window = new FakeWindow();
  const audio = new FakeAudioRuntime();
  const runtime = createGameRuntimeLoop({
    host: window as unknown as Window,
    document: new FakeDocument() as unknown as Document,
    ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
    signal: new AbortController().signal,
    getModel: () => modelNeedingFrame(),
    getSession: () => undefined,
    dependencies: { audio, firstPersonRenderer: fakeFirstPersonRenderer() },
  });

  runtime.start();
  runtime.renderNow();
  runtime[Symbol.dispose]();

  assertEquals(window.cancelledFrameIds, [1]);
  assertEquals(audio.disposed, true);
});

Deno.test("runtime audio world sync clears stale emitters when the session disappears", () => {
  const audio = new FakeAudioRuntime();
  let session: RuntimeSession | undefined = fakeAudioSession();
  const runtime = createGameRuntimeLoop({
    host: new FakeWindow() as unknown as Window,
    document: new FakeDocument() as unknown as Document,
    ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
    signal: new AbortController().signal,
    getModel: () => modelWithoutFrame(),
    getSession: () => session,
    dependencies: { audio, firstPersonRenderer: fakeFirstPersonRenderer() },
  });

  runtime.syncAudioWorld();
  assertEquals(audio.ambientEmitters, [ambientEmitter()]);
  assertEquals(audio.enemyIdleSources, [enemyIdleSource()]);

  session = undefined;
  runtime.syncAudioWorld();
  assertEquals(audio.ambientEmitters, []);
  assertEquals(audio.enemyIdleSources, []);
});

Deno.test("runtime updateAudioListener uses the current session pose", () => {
  const audio = new FakeAudioRuntime();
  const runtime = createGameRuntimeLoop({
    host: new FakeWindow() as unknown as Window,
    document: new FakeDocument() as unknown as Document,
    ctx: new FakeContext() as unknown as CanvasRenderingContext2D,
    signal: new AbortController().signal,
    getModel: () => modelWithoutFrame(),
    getSession: () => fakeAudioSession(),
    dependencies: { audio, firstPersonRenderer: fakeFirstPersonRenderer() },
  });

  runtime.updateAudioListener();

  assertEquals(audio.listenerPosition, { x: 3, y: 4 });
  assertEquals(audio.listenerFacing, 1);
});

function modelNeedingFrame(): GameModel {
  const model = createGameModel("Level 1");
  return {
    ...model,
    presentation: {
      messages: [{ text: "keep drawing", expiresAtMs: Number.POSITIVE_INFINITY }],
      combatFeedback: [],
    },
  };
}

function modelWithoutFrame(): GameModel {
  return createGameModel("Level 1");
}

function playingModel(): GameModel {
  const model = createGameModel("Level 1");
  return {
    ...model,
    mode: { type: "playing" },
  };
}

function fakeFirstPersonRenderer(
  result: { readonly needsFrame: boolean; readonly ambientOnly?: boolean } = { needsFrame: false },
): FirstPersonRenderer {
  return {
    preloadAssets() {
      return Promise.resolve();
    },
    sceneForMap() {
      throw new Error("Unexpected sceneForMap call.");
    },
    reset() {},
    bump() {},
    render(_ctx, _rect, _session, _nowMs, out) {
      out.needsFrame = result.needsFrame;
      out.ambientOnly = result.ambientOnly === true;
      out.cameraAngle = 0;
    },
  };
}

function fakePlayingSession(): RuntimeSession {
  return {
    getPlayerPosition: () => ({ x: 0, y: 0 }),
    getPlayerFacing: () => ({ dir: Direction.East }),
    forEachSoundEmitter() {},
    forEachEnemyIdleSoundSource() {},
    getMap: () =>
      createGameMap("Fake Map", [[1]], [], {
        palette: [{ kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" }],
      }),
    getPlayerStatus: () => playerSnapshot(),
    getVisibility: () => ({ isVisible: () => false, isExplored: () => false }),
    forEachDrawable() {},
    forEachLight() {},
    tick: () => ({ needsFrame: false }),
    getPlayerEntity: () => 1 as Entity,
  };
}

function fakeAudioSession(): RuntimeSession {
  return {
    getPlayerPosition: () => ({ x: 3, y: 4 }),
    getPlayerFacing: () => ({ dir: Direction.East }),
    forEachSoundEmitter(visit: (emitter: SoundEmitterSnapshot) => void): void {
      visit(ambientEmitter());
    },
    forEachEnemyIdleSoundSource(visit: (source: EnemyIdleSoundSource) => void): void {
      visit(enemyIdleSource());
    },
    getMap: () =>
      createGameMap("Fake Map", [[1]], [], {
        palette: [{ kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" }],
      }),
    getPlayerStatus: () => playerSnapshot(),
    getVisibility: () => ({ isVisible: () => false, isExplored: () => false }),
    forEachDrawable() {},
    forEachLight() {},
    tick: () => ({ needsFrame: false }),
    getPlayerEntity: () => 1 as Entity,
  };
}

function playerSnapshot(): PlayerStatusSnapshot {
  return {
    heldKeys: [],
    selectedWeapon: 1,
    unlockedWeapons: [1],
    ammo: { pistol: 0, cannon: 0 },
    health: { current: 10, max: 10 },
    hasUplinkCode: false,
    progress: {
      credits: 0,
      score: 0,
      xp: 0,
      levelCredits: 0,
    },
  };
}

function ambientEmitter(): SoundEmitterSnapshot {
  return {
    entity: EMITTER,
    soundId: SoundId.AmbientHum,
    x: 5,
    y: 6,
    radius: 7,
    volume: 0.8,
  };
}

function enemyIdleSource(): EnemyIdleSoundSource {
  return {
    entity: EMITTER,
    soundId: SoundId.DogIdle,
    x: 5,
    y: 6,
    radius: 7,
    volume: 0.8,
    minDelayMs: 100,
    maxDelayMs: 200,
  };
}

class FakeAudioRuntime implements AudioRuntime {
  disposed = false;
  listenerPosition?: { readonly x: number; readonly y: number };
  listenerFacing?: number;
  ambientEmitters: readonly SoundEmitterSnapshot[] = [];
  enemyIdleSources: readonly EnemyIdleSoundSource[] = [];
  cues: readonly SoundCue[] = [];
  musicStarted = false;
  unlocks = 0;
  volumes?: { readonly musicVolume: number; readonly soundVolume: number };

  unlock(): Promise<void> {
    this.unlocks++;
    return Promise.resolve();
  }

  startMusic(): void {
    this.musicStarted = true;
  }

  setVolumes(volumes: { readonly musicVolume: number; readonly soundVolume: number }): void {
    this.volumes = { ...volumes };
  }

  updateListener(position: { readonly x: number; readonly y: number }, facing: number): void {
    this.listenerPosition = { ...position };
    this.listenerFacing = facing;
  }

  playCues(cues: readonly SoundCue[]): void {
    this.cues = [...cues];
  }

  syncAmbientEmitters(emitters: readonly SoundEmitterSnapshot[]): void {
    this.ambientEmitters = emitters.map((emitter) => ({ ...emitter }));
  }

  syncEnemyIdleSources(sources: readonly EnemyIdleSoundSource[]): void {
    this.enemyIdleSources = sources.map((source) => ({ ...source }));
  }

  [Symbol.dispose](): void {
    this.disposed = true;
  }
}

class FakeWindow {
  readonly requestedFrameIds: number[] = [];
  readonly cancelledFrameIds: number[] = [];
  private nextFrameId = 1;
  private readonly callbacks = new Map<number, FrameRequestCallback>();

  requestAnimationFrame(callback: FrameRequestCallback): number {
    const id = this.nextFrameId++;
    this.requestedFrameIds.push(id);
    this.callbacks.set(id, callback);
    return id;
  }

  cancelAnimationFrame(id: number): void {
    this.cancelledFrameIds.push(id);
    this.callbacks.delete(id);
  }

  runFrame(id: number, nowMs: number): void {
    const callback = this.callbacks.get(id);
    if (callback === undefined) throw new Error(`No RAF callback for id ${id}.`);
    this.callbacks.delete(id);
    callback(nowMs);
  }
}

class FakeDocument {
  createElement(tagName: string): FakeImage {
    if (tagName !== "img") throw new Error(`Unexpected element ${tagName}.`);
    return new FakeImage();
  }
}

class FakeImage {
  decoding: "async" | "auto" | "sync" = "auto";
  src = "";
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  addEventListener(): void {}
  decode(): Promise<void> {
    return Promise.resolve();
  }
}

class FakeOffscreenContext {
  fillStyle: string | CanvasGradient | CanvasPattern = "";

  createRadialGradient(): CanvasGradient {
    return {
      addColorStop() {},
    } as unknown as CanvasGradient;
  }

  fillRect(): void {}
}

class FakeOffscreenCanvas {
  readonly width: number;
  readonly height: number;
  private readonly context = new FakeOffscreenContext();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(contextId: string): FakeOffscreenContext | null {
    return contextId === "2d" ? this.context : null;
  }
}

class FakeContext {
  readonly canvas = { ownerDocument: new FakeDocument() };
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  font = "";
  globalAlpha = 1;
  globalCompositeOperation: GlobalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;
  lineCap: CanvasLineCap = "butt";
  lineWidth = 1;
  strokeStyle: string | CanvasGradient | CanvasPattern = "";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";

  beginPath(): void {}
  closePath(): void {}
  clip(): void {}
  createRadialGradient(): CanvasGradient {
    return {
      addColorStop() {},
    } as unknown as CanvasGradient;
  }
  drawImage(): void {}
  ellipse(): void {}
  fill(): void {}
  fillRect(): void {}
  fillText(): void {}
  lineTo(): void {}
  moveTo(): void {}
  rect(): void {}
  restore(): void {}
  save(): void {}
  stroke(): void {}
  strokeRect(): void {}

  measureText(text: string): TextMetrics {
    return { width: text.length * 8 } as TextMetrics;
  }
}
