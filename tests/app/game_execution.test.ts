import { createGameExecution, type GameExecutionSpec } from "@/src/app/game_execution.ts";
import type { AudioRuntime } from "@/src/app/audio_runtime.ts";
import type { PresentationRuntime } from "@/src/app/presentation_runtime.ts";
import { musicTrackForMap, TrackId } from "@/src/game/content/audio/music.ts";
import { VoiceId } from "@/src/game/content/dialogue/voices.ts";
import type { AudioSettings } from "@/src/game/model/audio_settings.ts";
import type { SoundCue } from "@/src/game/model/sound.ts";
import { createGameModel, type GameModel, type GameTransitionEvent } from "@/src/game/model/transition/mod.ts";
import { DEFAULT_GAME_CANVAS_SIZE, type GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import { GAME_MAPS, START_MAP_NAME } from "@/src/game/world/campaign.ts";
import { assert, assertEquals } from "@std/assert";

Deno.test("game execution routes synchronous effects to their concrete owners", () => {
  const log: string[] = [];
  const model = createGameModel(START_MAP_NAME);
  const execution = createGameExecution(executionSpec({ log, model }));

  execution.execute([
    { type: "render" },
    { type: "resetFirstPerson" },
    { type: "warmMapAssets", mapName: START_MAP_NAME },
    { type: "setDialogueVoice", voice: VoiceId.JohnNexusGreet },
    { type: "ensureInput" },
    { type: "applyAudioVolumes" },
    { type: "playMusic", trackId: TrackId.Map3 },
    { type: "stopSounds" },
  ]);

  assertEquals(log, [
    "render",
    "reset",
    `warm-map:${START_MAP_NAME}`,
    `voice:${VoiceId.JohnNexusGreet}`,
    "input",
    `volumes:${model.audio.musicVolume}:${model.audio.soundVolume}`,
    `music:${TrackId.Map3}`,
    "stop",
  ]);
  execution[Symbol.dispose]();
});

Deno.test("game execution commits a loaded session before finalizing its output channels", async () => {
  const log: string[] = [];
  const events: GameTransitionEvent[] = [];
  let resolveLoaded: (() => void) | undefined;
  const loaded = new Promise<void>((resolve) => resolveLoaded = resolve);
  const execution = createGameExecution(executionSpec({
    log,
    apply(event) {
      events.push(event);
      log.push(`apply:${event.type}`);
      if (event.type === "mapLoaded") resolveLoaded?.();
    },
  }));

  execution.execute([{ type: "loadMap", mapName: START_MAP_NAME }]);
  await loaded;

  assert(execution.getSession() !== undefined);
  assertEquals(log, [
    `preload:${START_MAP_NAME}`,
    "reset",
    "listener",
    "world",
    `music:${TrackId.Map1}`,
    "apply:mapLoaded",
    `warm:${START_MAP_NAME}`,
  ]);
  assertEquals(events[0], { type: "mapLoaded", mapName: START_MAP_NAME });
  execution[Symbol.dispose]();
});

Deno.test("game execution reuses the existing session when loading another map", async () => {
  const execution = createGameExecution(executionSpec());
  execution.execute([{ type: "loadMap", mapName: START_MAP_NAME }]);
  await nextTask();
  const session = execution.getSession();
  assert(session !== undefined);
  const destination = GAME_MAPS.find((map) => map.name !== START_MAP_NAME);
  assert(destination !== undefined);

  execution.execute([{ type: "loadMap", mapName: destination.name }]);
  await nextTask();

  assert(execution.getSession() === session);
  assertEquals(session.getMap().name, destination.name);
  execution[Symbol.dispose]();
});

Deno.test("game execution does not commit or finalize an aborted map load", async () => {
  const controller = new AbortController();
  controller.abort();
  const log: string[] = [];
  const execution = createGameExecution(executionSpec({ log, controller }));

  execution.execute([{ type: "loadMap", mapName: START_MAP_NAME }]);
  await nextTask();

  assertEquals(execution.getSession(), undefined);
  assertEquals(log, [`preload:${START_MAP_NAME}`]);
  execution[Symbol.dispose]();
});

Deno.test("game execution does not mutate an existing session when preload is aborted", async () => {
  const controller = new AbortController();
  const presentation = new ControllablePreloadPresentation([]);
  const execution = createGameExecution(executionSpec({ controller, presentation }));
  execution.execute([{ type: "loadMap", mapName: START_MAP_NAME }]);
  presentation.resolveNext(START_MAP_NAME);
  await nextTask();
  const session = execution.getSession();
  assert(session !== undefined);
  const destination = GAME_MAPS.find((map) => map.name !== START_MAP_NAME);
  assert(destination !== undefined);

  execution.execute([{ type: "loadMap", mapName: destination.name }]);
  controller.abort();
  presentation.resolveNext(destination.name);
  await nextTask();

  assert(execution.getSession() === session);
  assertEquals(session.getMap().name, START_MAP_NAME);
  execution[Symbol.dispose]();
});

Deno.test("game execution reports an active retry without a session", async () => {
  const errors: unknown[] = [];
  const execution = createGameExecution(executionSpec({ onError: (error) => errors.push(error) }));

  execution.execute([{ type: "retryMap", mapName: START_MAP_NAME }]);
  await nextTask();

  assertEquals(errors.length, 1);
  assert(errors[0] instanceof Error);
  assertEquals(errors[0].message, "Cannot retry before the game session exists.");
  execution[Symbol.dispose]();
});

Deno.test("game execution retries the current session through the same finalization sequence", async () => {
  const log: string[] = [];
  let resolveTransition: (() => void) | undefined;
  const execution = createGameExecution(executionSpec({
    log,
    apply(event) {
      log.push(`apply:${event.type}`);
      if (event.type === "mapLoaded") resolveTransition?.();
    },
  }));
  let transitioned = new Promise<void>((resolve) => resolveTransition = resolve);
  execution.execute([{ type: "loadMap", mapName: START_MAP_NAME }]);
  await transitioned;
  const session = execution.getSession();
  assert(session !== undefined);
  const checkpointPosition = session.getPlayerPosition();
  execution.execute([{ type: "runPlayerCommand", command: { type: "move", direction: "backward" } }]);
  assertEquals(session.getPlayerPosition(), { x: checkpointPosition.x, y: checkpointPosition.y - 1 });
  log.length = 0;

  transitioned = new Promise<void>((resolve) => resolveTransition = resolve);
  execution.execute([{ type: "retryMap", mapName: START_MAP_NAME }]);
  await transitioned;

  assert(execution.getSession() === session);
  assertEquals(session.getPlayerPosition(), checkpointPosition);
  assertEquals(log, [
    `preload:${START_MAP_NAME}`,
    "reset",
    "listener",
    "world",
    `music:${TrackId.Map1}`,
    "apply:mapLoaded",
    `warm:${START_MAP_NAME}`,
  ]);
  execution[Symbol.dispose]();
});

Deno.test("game execution lets the latest overlapping existing-session load win", async () => {
  const log: string[] = [];
  const presentation = new ControllablePreloadPresentation(log);
  const execution = createGameExecution(executionSpec({ log, presentation }));

  execution.execute([{ type: "loadMap", mapName: START_MAP_NAME }]);
  presentation.resolveNext(START_MAP_NAME);
  await nextTask();
  assert(execution.getSession() !== undefined);
  log.length = 0;

  const destinations = GAME_MAPS.filter((map) => map.name !== START_MAP_NAME).slice(0, 2);
  assertEquals(destinations.length, 2);
  const [staleMap, winningMap] = destinations;
  execution.execute([{ type: "loadMap", mapName: staleMap!.name }]);
  execution.execute([{ type: "loadMap", mapName: winningMap!.name }]);
  presentation.resolveNext(winningMap!.name);
  await nextTask();
  const winningFinalization = [
    "reset",
    "listener",
    "world",
    `music:${musicTrackForMap(winningMap!.name)}`,
    "apply:mapLoaded",
    `warm:${winningMap!.name}`,
  ];
  assertEquals(log, winningFinalization);
  presentation.resolveNext(staleMap!.name);
  await nextTask();

  assertEquals(execution.getSession()?.getMap().name, winningMap!.name);
  assertEquals(log, winningFinalization);
  execution[Symbol.dispose]();
});

Deno.test("game execution suppresses a stale preload rejection", async () => {
  const errors: unknown[] = [];
  const presentation = new ControllablePreloadPresentation([]);
  const execution = createGameExecution(executionSpec({ presentation, onError: (error) => errors.push(error) }));
  execution.execute([{ type: "loadMap", mapName: START_MAP_NAME }]);
  presentation.resolveNext(START_MAP_NAME);
  await nextTask();
  const destinations = GAME_MAPS.filter((map) => map.name !== START_MAP_NAME).slice(0, 2);
  assertEquals(destinations.length, 2);
  const [staleMap, winningMap] = destinations;

  execution.execute([{ type: "loadMap", mapName: staleMap!.name }]);
  execution.execute([{ type: "loadMap", mapName: winningMap!.name }]);
  presentation.resolveNext(winningMap!.name);
  presentation.rejectNext(staleMap!.name, new Error("stale preload failed"));
  await nextTask();

  assertEquals(errors, []);
  assertEquals(execution.getSession()?.getMap().name, winningMap!.name);
  execution[Symbol.dispose]();
});

Deno.test("game execution reports an active preload rejection", async () => {
  const errors: unknown[] = [];
  const presentation = new ControllablePreloadPresentation([]);
  const execution = createGameExecution(executionSpec({ presentation, onError: (error) => errors.push(error) }));
  const failure = new Error("active preload failed");

  execution.execute([{ type: "loadMap", mapName: START_MAP_NAME }]);
  presentation.rejectNext(START_MAP_NAME, failure);
  await nextTask();

  assertEquals(errors, [failure]);
  assertEquals(execution.getSession(), undefined);
  execution[Symbol.dispose]();
});

Deno.test("game execution owns player-command audio sequencing and blocked-move recoil", async () => {
  const log: string[] = [];
  const events: GameTransitionEvent[] = [];
  let resolveLoaded: (() => void) | undefined;
  const loaded = new Promise<void>((resolve) => resolveLoaded = resolve);
  const execution = createGameExecution(executionSpec({
    log,
    apply(event) {
      events.push(event);
      if (event.type === "mapLoaded") resolveLoaded?.();
      else log.push(`apply:${event.type}`);
    },
  }));
  execution.execute([{ type: "loadMap", mapName: START_MAP_NAME }]);
  await loaded;
  log.length = 0;
  events.length = 0;

  const session = execution.getSession();
  assert(session !== undefined);
  Object.defineProperty(session, "handlePlayerCommand", {
    configurable: true,
    value: () => ({ type: "continue", events: [] }),
  });
  execution.execute([{ type: "runPlayerCommand", command: { type: "move", direction: "forward" } }]);

  assertEquals(log.slice(0, 3), ["listener", "cues", "world"]);
  assertEquals(log.at(-2), "bump");
  assertEquals(log.at(-1), "apply:playerCommandResult");
  assertEquals(events.at(-1)?.type, "playerCommandResult");
  execution[Symbol.dispose]();
});

Deno.test("game execution ticks sessions only in active play modes", async () => {
  let resolveLoaded: (() => void) | undefined;
  const loaded = new Promise<void>((resolve) => resolveLoaded = resolve);
  const execution = createGameExecution(executionSpec({
    apply(event) {
      if (event.type === "mapLoaded") resolveLoaded?.();
    },
  }));
  execution.execute([{ type: "loadMap", mapName: START_MAP_NAME }]);
  await loaded;

  const session = execution.getSession();
  assert(session !== undefined);
  const tickTimes: number[] = [];
  Object.defineProperty(session, "tick", {
    configurable: true,
    value(nowMs: number) {
      tickTimes.push(nowMs);
      return { needsFrame: true };
    },
  });

  assertEquals(execution.tick("title", 1), { needsFrame: false });
  assertEquals(execution.tick("paused", 2), { needsFrame: false });
  assertEquals(execution.tick("playing", 3), { needsFrame: true });
  assertEquals(execution.tick("verbMenu", 4), { needsFrame: true });
  assertEquals(tickTimes, [3, 4]);
  execution[Symbol.dispose]();
});

Deno.test("game execution disposes an ended session exactly once", async () => {
  let resolveLoaded: (() => void) | undefined;
  const loaded = new Promise<void>((resolve) => resolveLoaded = resolve);
  const execution = createGameExecution(executionSpec({
    apply(event) {
      if (event.type === "mapLoaded") resolveLoaded?.();
    },
  }));
  execution.execute([{ type: "loadMap", mapName: START_MAP_NAME }]);
  await loaded;

  const session = execution.getSession();
  assert(session !== undefined);
  let closeCount = 0;
  Object.defineProperty(session, "closeDialogue", {
    configurable: true,
    value: () => closeCount++,
  });
  const dispose = session[Symbol.dispose].bind(session);
  let disposeCount = 0;
  Object.defineProperty(session, Symbol.dispose, {
    configurable: true,
    value() {
      disposeCount++;
      dispose();
    },
  });

  execution.execute([{ type: "closeDialogue" }, { type: "endRun" }]);
  execution[Symbol.dispose]();

  assertEquals(execution.getSession(), undefined);
  assertEquals(closeCount, 1);
  assertEquals(disposeCount, 1);
});

Deno.test("game execution invalidates pending work on endRun and permits a later load", async () => {
  const log: string[] = [];
  const presentation = new ControllablePreloadPresentation(log);
  const execution = createGameExecution(executionSpec({ log, presentation }));
  execution.execute([{ type: "loadMap", mapName: START_MAP_NAME }]);
  presentation.resolveNext(START_MAP_NAME);
  await nextTask();
  assert(execution.getSession() !== undefined);
  log.length = 0;
  const destination = GAME_MAPS.find((map) => map.name !== START_MAP_NAME);
  assert(destination !== undefined);

  execution.execute([{ type: "loadMap", mapName: destination.name }]);
  execution.execute([{ type: "endRun" }]);
  presentation.resolveNext(destination.name);
  await nextTask();
  assertEquals(execution.getSession(), undefined);
  assertEquals(log, []);

  execution.execute([{ type: "loadMap", mapName: destination.name }]);
  presentation.resolveNext(destination.name);
  await nextTask();
  assertEquals(execution.getSession()?.getMap().name, destination.name);
  execution[Symbol.dispose]();
});

Deno.test("game execution disposal prevents a pending load from resurrecting a session", async () => {
  const log: string[] = [];
  const presentation = new ControllablePreloadPresentation(log);
  const execution = createGameExecution(executionSpec({ log, presentation }));

  execution.execute([{ type: "loadMap", mapName: START_MAP_NAME }]);
  execution[Symbol.dispose]();
  presentation.resolveNext(START_MAP_NAME);
  await nextTask();

  assertEquals(execution.getSession(), undefined);
  assertEquals(log, []);
});

Deno.test("game execution replaces, suppresses, and disposes victory timers", () => {
  const controller = new AbortController();
  const host = new FakeWindow();
  const events: GameTransitionEvent[] = [];
  const execution = createGameExecution(executionSpec({
    controller,
    host,
    apply: (event) => events.push(event),
  }));

  execution.execute([{ type: "scheduleVictory", delayMs: 10 }]);
  execution.execute([{ type: "scheduleVictory", delayMs: 20 }]);
  assertEquals(host.clearedTimeoutIds, [1]);
  host.runTimeout(2);
  assertEquals(events[0]?.type, "victoryTransitionComplete");

  execution.execute([{ type: "scheduleVictory", delayMs: 30 }]);
  controller.abort();
  host.runTimeout(3);
  assertEquals(events.length, 1);

  execution.execute([{ type: "scheduleVictory", delayMs: 40 }]);
  execution[Symbol.dispose]();
  assertEquals(host.clearedTimeoutIds, [1, 4]);
});

function executionSpec(options: {
  readonly log?: string[];
  readonly model?: GameModel;
  readonly controller?: AbortController;
  readonly host?: FakeWindow;
  readonly apply?: (event: GameTransitionEvent) => void;
  readonly presentation?: PresentationRuntime;
  readonly onError?: (error: unknown) => void;
} = {}): GameExecutionSpec {
  const log = options.log ?? [];
  const controller = options.controller ?? new AbortController();
  return {
    host: (options.host ?? new FakeWindow()) as unknown as Window,
    signal: controller.signal,
    seed: 1,
    presentation: options.presentation ?? new FakePresentationRuntime(log),
    audio: new FakeAudioRuntime(log),
    getModel: () => options.model ?? createGameModel(START_MAP_NAME),
    apply: options.apply ?? ((event) => log.push(`apply:${event.type}`)),
    ensureInput: () => log.push("input"),
    onError: options.onError ?? ((error) => {
      throw error;
    }),
  };
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

class FakePresentationRuntime implements PresentationRuntime {
  readonly canvasSize = DEFAULT_GAME_CANVAS_SIZE;
  private readonly log: string[];

  constructor(log: string[]) {
    this.log = log;
  }

  start(): void {}
  resize(_size: GameCanvasSize): void {}
  renderNow(): void {
    this.log.push("render");
  }
  preloadAssets(mapName: string): Promise<void> {
    this.log.push(`preload:${mapName}`);
    return Promise.resolve();
  }
  warmShellAssets(): void {}
  warmMapAssets(mapName: string): void {
    this.log.push(`warm-map:${mapName}`);
  }
  warmDeferredAssets(mapName: string): void {
    this.log.push(`warm:${mapName}`);
  }
  resetFirstPerson(): void {
    this.log.push("reset");
  }
  bumpFirstPerson(_dx: number, _dy: number, _nowMs: number): void {
    this.log.push("bump");
  }
  [Symbol.dispose](): void {}
}

class ControllablePreloadPresentation extends FakePresentationRuntime {
  private readonly pending: {
    readonly mapName: string;
    readonly resolve: () => void;
    readonly reject: (error: unknown) => void;
  }[] = [];

  override preloadAssets(mapName: string): Promise<void> {
    return new Promise((resolve, reject) => this.pending.push({ mapName, resolve, reject }));
  }

  resolveNext(mapName: string): void {
    const index = this.pending.findIndex((entry) => entry.mapName === mapName);
    assert(index >= 0);
    this.pending.splice(index, 1)[0]!.resolve();
  }

  rejectNext(mapName: string, error: unknown): void {
    const index = this.pending.findIndex((entry) => entry.mapName === mapName);
    assert(index >= 0);
    this.pending.splice(index, 1)[0]!.reject(error);
  }
}

class FakeAudioRuntime implements AudioRuntime {
  private readonly log: string[];

  constructor(log: string[]) {
    this.log = log;
  }

  unlock(): Promise<void> {
    return Promise.resolve();
  }
  setVolumes(volumes: AudioSettings): void {
    this.log.push(`volumes:${volumes.musicVolume}:${volumes.soundVolume}`);
  }
  updateListener(): void {
    this.log.push("listener");
  }
  playCues(_cues: readonly SoundCue[]): void {
    this.log.push("cues");
  }
  stopSounds(): void {
    this.log.push("stop");
  }
  setDialogueVoice(voice: VoiceId | undefined): void {
    this.log.push(`voice:${voice}`);
  }
  syncWorld(): void {
    this.log.push("world");
  }
  playMusic(trackId: TrackId): void {
    this.log.push(`music:${trackId}`);
  }
  [Symbol.dispose](): void {}
}

class FakeWindow {
  readonly clearedTimeoutIds: number[] = [];
  private nextTimeoutId = 1;
  private readonly callbacks = new Map<number, () => void>();

  setTimeout(handler: TimerHandler): number {
    const id = this.nextTimeoutId++;
    assert(typeof handler === "function");
    this.callbacks.set(id, handler as () => void);
    return id;
  }

  clearTimeout(id: number): void {
    this.clearedTimeoutIds.push(id);
    this.callbacks.delete(id);
  }

  runTimeout(id: number): void {
    const callback = this.callbacks.get(id);
    if (callback === undefined) throw new Error(`No timeout callback for ${id}.`);
    this.callbacks.delete(id);
    callback();
  }
}
