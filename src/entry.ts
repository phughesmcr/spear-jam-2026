import type { GameSession } from "@/src/ecs/session.ts";
import { musicTrackForMap } from "@/src/audio/music_catalog.ts";
import {
  loadMapSession,
  type LoadMapSessionSpec,
  resetRunSession,
  retryMapSession,
  type SessionLifecycleResult,
} from "@/src/entry/session_lifecycle.ts";
import { type GameCommand, type PlayerCommand, relativeMoveDirectionOffset } from "@/src/game/commands.ts";
import { firstPersonTouchGesturesEnabled, routePointerInput } from "@/src/game/input_routing.ts";
import { SplitMix32 } from "@/src/game/rng.ts";
import { createGameRuntimeLoop, type GameRuntimeLoop } from "@/src/game/runtime_loop.ts";
import {
  createGameModel,
  type GameEffect,
  type GameModel,
  type GameTransitionEvent,
  transition,
} from "@/src/game/transition.ts";
import { directionDelta, normalizeDirection } from "@/src/grid/direction.ts";
import { setupInput } from "@/src/input/input.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import { START_MAP_NAME } from "@/src/map/maps.ts";
import { canvasSizeController } from "@/src/render/canvas.ts";

export interface GameSpec {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  seed: number;
  startMapName?: string;
  cheat?: boolean;
  host: Window;
}

/** The map-loading effects, each carrying a `mapName`, that drive a session transition. */
type SessionTransitionKind = Extract<GameEffect, { readonly mapName: string }>["type"];

/** Maps each session-transition effect to the lifecycle function that fulfils it. */
const SESSION_TRANSITIONS: Record<
  SessionTransitionKind,
  (spec: LoadMapSessionSpec) => Promise<SessionLifecycleResult | undefined>
> = {
  loadMap: loadMapSession,
  retryMap: retryMapSession,
  resetRun: resetRunSession,
};

export function startGame(spec: GameSpec): Disposable {
  const controller = new AbortController();
  const game = new Game(spec, controller);
  game.start();
  return game;
}

class Game implements Disposable {
  private readonly spec: GameSpec;
  private readonly controller: AbortController;
  private readonly runtime: GameRuntimeLoop;
  private readonly rng: SplitMix32;
  private model: GameModel;
  private canvasController: Disposable;
  private inputController?: Disposable;
  private session?: GameSession;

  constructor(spec: GameSpec, controller: AbortController) {
    this.spec = spec;
    this.controller = controller;
    const fullBoot = spec.startMapName === undefined;
    this.model = createGameModel(spec.startMapName ?? START_MAP_NAME, {
      showTitle: fullBoot,
      showIntro: fullBoot,
    });
    this.runtime = createGameRuntimeLoop({
      host: spec.host,
      document: spec.canvas.ownerDocument,
      ctx: spec.ctx,
      signal: controller.signal,
      getModel: () => this.model,
      getSession: () => this.session,
    });
    this.rng = new SplitMix32(spec.seed);
    this.canvasController = canvasSizeController(
      spec.host,
      spec.canvas,
      spec.ctx,
      (size) => this.runtime.resize(size),
    );
  }

  start(): void {
    this.runtime.start();
    this.apply({ type: "start", nowMs: performance.now() });
  }

  private startSessionTransition(kind: SessionTransitionKind, mapName: string): void {
    void this.runSessionTransition(kind, mapName).catch((error: unknown) => this.handleLoadError(error));
  }

  private async runSessionTransition(kind: SessionTransitionKind, mapName: string): Promise<void> {
    const result = await SESSION_TRANSITIONS[kind]({
      signal: this.controller.signal,
      preloadAssets: () => this.runtime.preloadAssets(),
      mapName,
      currentSession: this.session,
      random: () => this.rng.nextFloat(),
      cheat: this.spec.cheat,
    });
    if (result === undefined) return;

    this.session = result.session;
    this.finishMapLoad(result.mapName);
  }

  private finishMapLoad(mapName: string): void {
    this.runtime.resetFirstPerson();
    // Position the listener at the new map's player spawn before starting
    // ambient emitters/music so the first loops are spatialized correctly.
    this.runtime.updateAudioListener();
    this.runtime.syncAudioWorld();
    this.runtime.playMusic(musicTrackForMap(mapName));
    this.apply({ type: "mapLoaded", mapName });
  }

  private handleLoadError(error: unknown): void {
    if (this.controller.signal.aborted) return;
    console.error("Failed to start game.", error);
    this.apply({
      type: "loadFailed",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }

  private handleGameCommand(command: GameCommand): void {
    void this.runtime.unlockAudio();
    this.apply({ type: "gameCommand", command, nowMs: performance.now() });
  }

  private handlePointerInput(input: CanvasPointerInput): void {
    if (input.phase === "down") void this.runtime.unlockAudio();

    const route = routePointerInput(this.model, this.runtime.canvasSize, input);
    if (route.type === "command") {
      this.handleGameCommand(route.command);
      return;
    }
    if (route.type === "transition") this.apply(route.event);
  }

  private handlePlayerCommand(command: PlayerCommand): void {
    if (!this.session) return;

    const nowMs = performance.now();
    const playerEntity = this.session.getPlayerEntity();
    const moveFrom = command.type === "move" ? this.session.getPlayerPosition() : undefined;
    const result = this.session.handlePlayerCommand(command);
    // Refresh the listener pose before spatializing cues so movement, pickup,
    // door and attack sounds are panned from the player's new position/facing.
    this.runtime.updateAudioListener();
    this.runtime.playCues(result.soundCues ?? []);
    this.runtime.syncAudioWorld();
    if (command.type === "move" && moveFrom !== undefined) {
      const position = this.session.getPlayerPosition();
      if (position.x === moveFrom.x && position.y === moveFrom.y) {
        // The move was blocked: play a recoil lunge toward the obstacle.
        const worldDir = normalizeDirection(
          this.session.getPlayerFacing().dir + relativeMoveDirectionOffset(command.direction),
        );
        const delta = directionDelta(worldDir);
        this.runtime.bumpFirstPerson(delta.dx, delta.dy, nowMs);
      }
    }
    this.apply({
      type: "playerCommandResult",
      result,
      playerEntity,
      nowMs,
    });
  }

  private apply(event: GameTransitionEvent): void {
    const previousViewMode = this.model.viewMode;
    const next = transition(this.model, event);
    this.model = next.model;
    if (this.model.viewMode !== previousViewMode) {
      this.runtime.resetFirstPerson();
    }
    this.executeEffects(next.effects);
  }

  private executeEffects(effects: readonly GameEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "render":
          this.runtime.renderNow();
          break;
        case "closeDialogue":
          this.session?.closeDialogue();
          break;
        case "ensureInput":
          this.ensureInput();
          break;
        case "applyAudioVolumes":
          this.runtime.setAudioVolumes(this.model.audio);
          break;
        case "playMusic":
          this.runtime.playMusic(effect.trackId);
          break;
        case "loadMap":
        case "retryMap":
        case "resetRun":
          this.startSessionTransition(effect.type, effect.mapName);
          break;
        case "runPlayerCommand":
          this.handlePlayerCommand(effect.command);
          break;
        default: {
          const _exhaustive: never = effect;
          return _exhaustive;
        }
      }
    }
  }

  private ensureInput(): void {
    this.inputController ??= setupInput(
      this.spec.host,
      this.spec.canvas,
      () => this.runtime.canvasSize,
      (command) => this.handleGameCommand(command),
      (input) => this.handlePointerInput(input),
      () => firstPersonTouchGesturesEnabled(this.model),
    );
  }

  [Symbol.dispose](): void {
    this.controller.abort();
    this.runtime[Symbol.dispose]();
    this.inputController?.[Symbol.dispose]();
    this.session?.[Symbol.dispose]();
    this.canvasController?.[Symbol.dispose]();
  }
}
