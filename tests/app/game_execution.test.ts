import { createGameExecution, type GameExecutionSpec } from "@/src/app/game_execution.ts";
import type { AudioRuntime } from "@/src/app/audio_runtime.ts";
import type { PresentationRuntime } from "@/src/app/presentation_runtime.ts";
import type {
  AssetPreparation,
  PrepareAssetsOptions,
  PresentationAssetRequest,
  PresentationAssets,
} from "@/src/app/presentation_assets.ts";
import { TrackId } from "@/src/game/content/audio/music.ts";
import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import { VoiceId } from "@/src/game/content/dialogue/voices.ts";
import type { AudioSettings } from "@/src/game/model/audio_settings.ts";
import type { SoundCue } from "@/src/game/model/sound.ts";
import { createGameModel, type GameModel, type GameTransitionEvent } from "@/src/game/model/transition/mod.ts";
import { DEFAULT_GAME_CANVAS_SIZE, type GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import type { PresentationAssetView } from "@/src/game/presentation/asset_view.ts";
import { TEST_SESSION_CONTENT } from "@/tests/game/simulation/helpers.ts";
import { assert, assertEquals } from "@std/assert";

const CAMPAIGN = {
  startMap: SHIPPED_GAME.levels.start.map,
  maps: SHIPPED_GAME.levels.all.map((level) => level.map),
};

Deno.test("game execution routes synchronous effects to their concrete owners", () => {
  const log: string[] = [];
  const model = createGameModel(CAMPAIGN.startMap.name);
  const execution = createGameExecution(executionSpec({ log, model }));

  execution.execute([
    { type: "render" },
    { type: "resetFirstPerson" },
    { type: "scheduleMapAssets", mapName: CAMPAIGN.startMap.name },
    { type: "setDialogueVoice", voice: VoiceId.JohnNexusGreet },
    { type: "ensureInput" },
    { type: "applyAudioVolumes" },
    { type: "playMusic", trackId: TrackId.Map3 },
    { type: "stopSounds" },
  ]);

  assertEquals(log, [
    "render",
    "reset",
    `schedule:${CAMPAIGN.startMap.name}`,
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

  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
  await loaded;

  assert(execution.getSession() !== undefined);
  assertEquals(log, [
    `prepare:${CAMPAIGN.startMap.name}`,
    "reset",
    "listener",
    "world",
    `music:${TrackId.Map1}`,
    "apply:mapLoaded",
    `deferred:${CAMPAIGN.startMap.name}`,
  ]);
  assertEquals(events[0], { type: "mapLoaded", mapName: CAMPAIGN.startMap.name });
  execution[Symbol.dispose]();
});

Deno.test("game execution reuses the existing session when loading another map", async () => {
  const execution = createGameExecution(executionSpec());
  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
  await nextTask();
  const session = execution.getSession();
  assert(session !== undefined);
  const destination = CAMPAIGN.maps.find((map) => map.name !== CAMPAIGN.startMap.name);
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

  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
  await nextTask();

  assertEquals(execution.getSession(), undefined);
  assertEquals(log, [`prepare:${CAMPAIGN.startMap.name}`]);
  execution[Symbol.dispose]();
});

Deno.test("game execution does not mutate an existing session when preload is aborted", async () => {
  const controller = new AbortController();
  const assets = new ControllablePresentationAssets([]);
  const execution = createGameExecution(executionSpec({ controller, assets }));
  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
  assets.resolveNext(CAMPAIGN.startMap.name);
  await nextTask();
  const session = execution.getSession();
  assert(session !== undefined);
  const destination = CAMPAIGN.maps.find((map) => map.name !== CAMPAIGN.startMap.name);
  assert(destination !== undefined);

  execution.execute([{ type: "loadMap", mapName: destination.name }]);
  controller.abort();
  assets.resolveNext(destination.name);
  await nextTask();

  assert(execution.getSession() === session);
  assertEquals(session.getMap().name, CAMPAIGN.startMap.name);
  execution[Symbol.dispose]();
});

Deno.test("game execution reports an active retry without a session", async () => {
  const errors: unknown[] = [];
  const execution = createGameExecution(executionSpec({ onError: (error) => errors.push(error) }));

  execution.execute([{ type: "retryMap", mapName: CAMPAIGN.startMap.name }]);
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
  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
  await transitioned;
  const session = execution.getSession();
  assert(session !== undefined);
  const checkpointPosition = session.getPlayerPosition();
  execution.execute([{ type: "runPlayerCommand", command: { type: "move", direction: "backward" } }]);
  assertEquals(session.getPlayerPosition(), { x: checkpointPosition.x, y: checkpointPosition.y - 1 });
  log.length = 0;

  transitioned = new Promise<void>((resolve) => resolveTransition = resolve);
  execution.execute([{ type: "retryMap", mapName: CAMPAIGN.startMap.name }]);
  await transitioned;

  assert(execution.getSession() === session);
  assertEquals(session.getPlayerPosition(), checkpointPosition);
  assertEquals(log, [
    `prepare:${CAMPAIGN.startMap.name}`,
    "reset",
    "listener",
    "world",
    `music:${TrackId.Map1}`,
    "apply:mapLoaded",
    `deferred:${CAMPAIGN.startMap.name}`,
  ]);
  execution[Symbol.dispose]();
});

Deno.test("game execution lets the latest overlapping existing-session load win", async () => {
  const log: string[] = [];
  const assets = new ControllablePresentationAssets(log);
  const execution = createGameExecution(executionSpec({ log, assets }));

  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
  assets.resolveNext(CAMPAIGN.startMap.name);
  await nextTask();
  assert(execution.getSession() !== undefined);
  log.length = 0;

  const destinations = CAMPAIGN.maps.filter((map) => map.name !== CAMPAIGN.startMap.name).slice(0, 2);
  assertEquals(destinations.length, 2);
  const [staleMap, winningMap] = destinations;
  execution.execute([{ type: "loadMap", mapName: staleMap!.name }]);
  execution.execute([{ type: "loadMap", mapName: winningMap!.name }]);
  assets.resolveNext(winningMap!.name);
  await nextTask();
  const winningFinalization = [
    "reset",
    "listener",
    "world",
    `music:${SHIPPED_GAME.levels.get(winningMap!.name).music}`,
    "apply:mapLoaded",
    `deferred:${winningMap!.name}`,
  ];
  assertEquals(log, winningFinalization);
  assets.resolveNext(staleMap!.name);
  await nextTask();

  assertEquals(execution.getSession()?.getMap().name, winningMap!.name);
  assertEquals(log, winningFinalization);
  execution[Symbol.dispose]();
});

Deno.test("game execution suppresses a stale preload rejection", async () => {
  const errors: unknown[] = [];
  const assets = new ControllablePresentationAssets([]);
  const execution = createGameExecution(executionSpec({ assets, onError: (error) => errors.push(error) }));
  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
  assets.resolveNext(CAMPAIGN.startMap.name);
  await nextTask();
  const destinations = CAMPAIGN.maps.filter((map) => map.name !== CAMPAIGN.startMap.name).slice(0, 2);
  assertEquals(destinations.length, 2);
  const [staleMap, winningMap] = destinations;

  execution.execute([{ type: "loadMap", mapName: staleMap!.name }]);
  execution.execute([{ type: "loadMap", mapName: winningMap!.name }]);
  assets.resolveNext(winningMap!.name);
  assets.rejectNext(staleMap!.name, new Error("stale preload failed"));
  await nextTask();

  assertEquals(errors, []);
  assertEquals(execution.getSession()?.getMap().name, winningMap!.name);
  execution[Symbol.dispose]();
});

Deno.test("game execution accepts progress only from the current blocking level request", async () => {
  const events: GameTransitionEvent[] = [];
  const assets = new ControllablePresentationAssets([]);
  const execution = createGameExecution(executionSpec({ assets, apply: (event) => events.push(event) }));
  const [staleLevel, activeLevel] = SHIPPED_GAME.levels.all.slice(0, 2);

  execution.execute([{ type: "loadMap", mapName: staleLevel!.map.name }]);
  execution.execute([{ type: "loadMap", mapName: activeLevel!.map.name }]);
  assets.reportProgress(staleLevel!.map.name, 1, 2);
  assets.reportProgress(activeLevel!.map.name, 1, 2);

  assertEquals(events, [{ type: "loadingProgress", completed: 1, total: 2 }]);
  assets.resolveNext(activeLevel!.map.name);
  await nextTask();
  execution[Symbol.dispose]();
});

Deno.test("game execution treats predictive preparation failure as diagnostic only", async () => {
  const failure = new Error("predictive preparation failed");
  const fatal: unknown[] = [];
  const diagnostics: unknown[] = [];
  const assets = new RejectingIdlePresentationAssets([], failure);
  const execution = createGameExecution(executionSpec({
    assets,
    onError: (error) => fatal.push(error),
    onDiagnostic: (error) => diagnostics.push(error),
  }));

  execution.execute([{ type: "scheduleMapAssets", mapName: CAMPAIGN.startMap.name }]);
  await nextTask();

  assertEquals(fatal, []);
  assertEquals(diagnostics, [failure]);
  execution[Symbol.dispose]();
});

Deno.test("game execution treats deferred preparation failure as diagnostic only", async () => {
  const failure = new Error("deferred preparation failed");
  const fatal: unknown[] = [];
  const diagnostics: unknown[] = [];
  const assets = new RejectingIdlePresentationAssets([], failure);
  const execution = createGameExecution(executionSpec({
    assets,
    onError: (error) => fatal.push(error),
    onDiagnostic: (error) => diagnostics.push(error),
  }));

  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
  await nextTask();

  assert(execution.getSession() !== undefined);
  assertEquals(fatal, []);
  assertEquals(diagnostics, [failure]);
  execution[Symbol.dispose]();
});

Deno.test("game execution commits after degraded critical presentation preparation", async () => {
  const events: GameTransitionEvent[] = [];
  const assets = new ControllablePresentationAssets([]);
  const execution = createGameExecution(executionSpec({ assets, apply: (event) => events.push(event) }));

  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
  assets.resolveNext(CAMPAIGN.startMap.name, {
    kind: "degraded",
    unavailable: [{ source: "missing.png", stage: "load" }],
  });
  await nextTask();

  assert(execution.getSession() !== undefined);
  assert(events.some((event) => event.type === "mapLoaded"));
  execution[Symbol.dispose]();
});

Deno.test("game execution reports an active preload rejection", async () => {
  const errors: unknown[] = [];
  const assets = new ControllablePresentationAssets([]);
  const execution = createGameExecution(executionSpec({ assets, onError: (error) => errors.push(error) }));
  const failure = new Error("active preload failed");

  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
  assets.rejectNext(CAMPAIGN.startMap.name, failure);
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
  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
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
  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
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

Deno.test("game execution releases an ended session", async () => {
  let resolveLoaded: (() => void) | undefined;
  const loaded = new Promise<void>((resolve) => resolveLoaded = resolve);
  const execution = createGameExecution(executionSpec({
    apply(event) {
      if (event.type === "mapLoaded") resolveLoaded?.();
    },
  }));
  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
  await loaded;

  const session = execution.getSession();
  assert(session !== undefined);
  let closeCount = 0;
  Object.defineProperty(session, "closeDialogue", {
    configurable: true,
    value: () => closeCount++,
  });
  execution.execute([{ type: "closeDialogue" }, { type: "endRun" }]);
  execution[Symbol.dispose]();

  assertEquals(execution.getSession(), undefined);
  assertEquals(closeCount, 1);
});

Deno.test("game execution invalidates pending work on endRun and permits a later load", async () => {
  const log: string[] = [];
  const assets = new ControllablePresentationAssets(log);
  const execution = createGameExecution(executionSpec({ log, assets }));
  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
  assets.resolveNext(CAMPAIGN.startMap.name);
  await nextTask();
  assert(execution.getSession() !== undefined);
  log.length = 0;
  const destination = CAMPAIGN.maps.find((map) => map.name !== CAMPAIGN.startMap.name);
  assert(destination !== undefined);

  execution.execute([{ type: "loadMap", mapName: destination.name }]);
  execution.execute([{ type: "endRun" }]);
  assets.resolveNext(destination.name);
  await nextTask();
  assertEquals(execution.getSession(), undefined);
  assertEquals(log, []);

  execution.execute([{ type: "loadMap", mapName: destination.name }]);
  assets.resolveNext(destination.name);
  await nextTask();
  assertEquals(execution.getSession()?.getMap().name, destination.name);
  execution[Symbol.dispose]();
});

Deno.test("game execution disposal prevents a pending load from resurrecting a session", async () => {
  const log: string[] = [];
  const assets = new ControllablePresentationAssets(log);
  const execution = createGameExecution(executionSpec({ log, assets }));

  execution.execute([{ type: "loadMap", mapName: CAMPAIGN.startMap.name }]);
  execution[Symbol.dispose]();
  assets.resolveNext(CAMPAIGN.startMap.name);
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
  readonly assets?: PresentationAssets;
  readonly onError?: (error: unknown) => void;
  readonly onDiagnostic?: (error: unknown) => void;
} = {}): GameExecutionSpec {
  const log = options.log ?? [];
  const controller = options.controller ?? new AbortController();
  return {
    sessionContent: TEST_SESSION_CONTENT,
    host: (options.host ?? new FakeWindow()) as unknown as Window,
    signal: controller.signal,
    seed: 1,
    assets: options.assets ?? new FakePresentationAssets(log),
    presentation: options.presentation ?? new FakePresentationRuntime(log),
    audio: new FakeAudioRuntime(log),
    getModel: () => options.model ?? createGameModel(CAMPAIGN.startMap.name),
    apply: options.apply ?? ((event) => log.push(`apply:${event.type}`)),
    ensureInput: () => log.push("input"),
    onError: options.onError ?? ((error) => {
      throw error;
    }),
    onDiagnostic: options.onDiagnostic ?? ((error) => {
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
  resetFirstPerson(): void {
    this.log.push("reset");
  }
  bumpFirstPerson(_dx: number, _dy: number, _nowMs: number): void {
    this.log.push("bump");
  }
  [Symbol.dispose](): void {}
}

class FakePresentationAssets implements PresentationAssets {
  protected readonly log: string[];

  constructor(log: string[]) {
    this.log = log;
  }

  prepare(
    request: PresentationAssetRequest,
    options: PrepareAssetsOptions,
  ): Promise<AssetPreparation> {
    if (request.kind === "level") {
      this.log.push(`${options.urgency === "blocking" ? "prepare" : "schedule"}:${request.level.map.name}`);
    } else if (request.kind === "deferred") {
      this.log.push(`deferred:${request.level.map.name}`);
    }
    return Promise.resolve({ kind: "ready" });
  }

  view(): PresentationAssetView {
    throw new Error("Fake asset view is not used by game execution.");
  }

  [Symbol.dispose](): void {}
}

class ControllablePresentationAssets extends FakePresentationAssets {
  private readonly pending: {
    readonly mapName: string;
    readonly resolve: (result: AssetPreparation) => void;
    readonly reject: (error: unknown) => void;
    readonly options: PrepareAssetsOptions;
  }[] = [];

  override prepare(
    request: PresentationAssetRequest,
    options: PrepareAssetsOptions,
  ): Promise<AssetPreparation> {
    if (request.kind !== "level" || options.urgency !== "blocking") {
      return super.prepare(request, options);
    }
    return new Promise((resolve, reject) =>
      this.pending.push({ mapName: request.level.map.name, resolve, reject, options })
    );
  }

  resolveNext(mapName: string, result: AssetPreparation = { kind: "ready" }): void {
    const index = this.pending.findIndex((entry) => entry.mapName === mapName);
    assert(index >= 0);
    this.pending.splice(index, 1)[0]!.resolve(result);
  }

  rejectNext(mapName: string, error: unknown): void {
    const index = this.pending.findIndex((entry) => entry.mapName === mapName);
    assert(index >= 0);
    this.pending.splice(index, 1)[0]!.reject(error);
  }

  reportProgress(mapName: string, completed: number, total: number): void {
    const entry = this.pending.find((candidate) => candidate.mapName === mapName);
    assert(entry !== undefined);
    entry.options.onProgress?.({ completed, total });
  }
}

class RejectingIdlePresentationAssets extends FakePresentationAssets {
  private readonly failure: unknown;

  constructor(log: string[], failure: unknown) {
    super(log);
    this.failure = failure;
  }

  override prepare(
    request: PresentationAssetRequest,
    options: PrepareAssetsOptions,
  ): Promise<AssetPreparation> {
    if (options.urgency === "idle") return Promise.reject(this.failure);
    return super.prepare(request, options);
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
