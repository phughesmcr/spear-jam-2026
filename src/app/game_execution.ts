import type { AudioRuntime } from "@/src/app/audio_runtime.ts";
import {
  loadMapSession,
  type LoadMapSessionSpec,
  retryMapSession,
  type SessionLifecycleResult,
} from "@/src/app/session_lifecycle.ts";
import type { PresentationRuntime } from "@/src/app/presentation_runtime.ts";
import { SplitMix32 } from "@/src/engine/random.ts";
import { musicTrackForMap } from "@/src/game/content/audio/music.ts";
import { relativeMoveDirectionOffset } from "@/src/game/model/commands.ts";
import type { GameEffect, GameModel, GameTransitionEvent } from "@/src/game/model/transition/mod.ts";
import type { GameSession } from "@/src/game/simulation/session.ts";
import { directionDelta, normalizeDirection } from "@/src/game/world/direction.ts";

const NO_FRAME = { needsFrame: false } as const;

type SessionTransitionKind = Extract<GameEffect, { readonly type: "loadMap" | "retryMap" }>["type"];

const SESSION_TRANSITIONS: Record<
  SessionTransitionKind,
  (spec: LoadMapSessionSpec) => Promise<SessionLifecycleResult | undefined>
> = {
  loadMap: loadMapSession,
  retryMap: retryMapSession,
};

export type GameExecutionSpec = {
  readonly host: Window;
  readonly signal: AbortSignal;
  readonly seed: number;
  readonly cheat?: boolean;
  readonly presentation: PresentationRuntime;
  readonly audio: AudioRuntime;
  readonly getModel: () => GameModel;
  readonly apply: (event: GameTransitionEvent) => void;
  readonly ensureInput: () => void;
  readonly onError: (error: unknown) => void;
};

export interface GameExecution extends Disposable {
  getSession(): GameSession | undefined;
  tick(modeType: GameModel["mode"]["type"], nowMs: number): { readonly needsFrame: boolean };
  execute(effects: readonly GameEffect[]): void;
}

export function createGameExecution(spec: GameExecutionSpec): GameExecution {
  return new Execution(spec);
}

class Execution implements GameExecution {
  private readonly spec: GameExecutionSpec;
  private readonly rng: SplitMix32;
  private session?: GameSession;
  private victoryTimeoutId?: number;

  constructor(spec: GameExecutionSpec) {
    this.spec = spec;
    this.rng = new SplitMix32(spec.seed);
  }

  getSession(): GameSession | undefined {
    return this.session;
  }

  tick(modeType: GameModel["mode"]["type"], nowMs: number): { readonly needsFrame: boolean } {
    if (this.session === undefined) return NO_FRAME;
    if (modeType !== "playing" && modeType !== "verbMenu") return NO_FRAME;
    return this.session.tick(nowMs);
  }

  execute(effects: readonly GameEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "render":
          this.spec.presentation.renderNow();
          break;
        case "resetFirstPerson":
          this.spec.presentation.resetFirstPerson();
          break;
        case "warmMapAssets":
          this.spec.presentation.warmMapAssets(effect.mapName);
          break;
        case "closeDialogue":
          this.session?.closeDialogue();
          break;
        case "setDialogueVoice":
          this.spec.audio.setDialogueVoice(effect.voice);
          break;
        case "ensureInput":
          this.spec.ensureInput();
          break;
        case "applyAudioVolumes":
          this.spec.audio.setVolumes(this.spec.getModel().audio);
          break;
        case "playMusic":
          this.spec.audio.playMusic(effect.trackId);
          break;
        case "stopSounds":
          this.spec.audio.stopSounds();
          break;
        case "endRun":
          this.disposeSession();
          break;
        case "scheduleVictory":
          this.scheduleVictory(effect.delayMs);
          break;
        case "loadMap":
        case "retryMap":
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

  [Symbol.dispose](): void {
    if (this.victoryTimeoutId !== undefined) {
      this.spec.host.clearTimeout(this.victoryTimeoutId);
      this.victoryTimeoutId = undefined;
    }
    this.disposeSession();
  }

  private startSessionTransition(kind: SessionTransitionKind, mapName: string): void {
    void this.runSessionTransition(kind, mapName).catch(this.spec.onError);
  }

  private async runSessionTransition(kind: SessionTransitionKind, mapName: string): Promise<void> {
    const result = await SESSION_TRANSITIONS[kind]({
      signal: this.spec.signal,
      preloadAssets: (mapName) => this.spec.presentation.preloadAssets(mapName),
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
    this.spec.presentation.resetFirstPerson();
    this.spec.audio.updateListener();
    this.spec.audio.syncWorld();
    this.spec.audio.playMusic(musicTrackForMap(mapName));
    this.spec.apply({ type: "mapLoaded", mapName });
    this.spec.presentation.warmDeferredAssets(mapName);
  }

  private handlePlayerCommand(command: Extract<GameEffect, { readonly type: "runPlayerCommand" }>["command"]): void {
    const session = this.session;
    if (session === undefined) return;

    const nowMs = performance.now();
    const playerEntity = session.getPlayerEntity();
    const moveFrom = command.type === "move" ? session.getPlayerPosition() : undefined;
    const result = session.handlePlayerCommand(command);
    this.spec.audio.updateListener();
    this.spec.audio.playCues(result.soundCues ?? []);
    this.spec.audio.syncWorld();
    if (command.type === "move" && moveFrom !== undefined) {
      const position = session.getPlayerPosition();
      if (position.x === moveFrom.x && position.y === moveFrom.y) {
        const worldDir = normalizeDirection(
          session.getPlayerFacing().dir + relativeMoveDirectionOffset(command.direction),
        );
        const delta = directionDelta(worldDir);
        this.spec.presentation.bumpFirstPerson(delta.dx, delta.dy, nowMs);
      }
    }
    this.spec.apply({
      type: "playerCommandResult",
      result,
      playerEntity,
      nowMs,
    });
  }

  private scheduleVictory(delayMs: number): void {
    if (this.victoryTimeoutId !== undefined) this.spec.host.clearTimeout(this.victoryTimeoutId);
    this.victoryTimeoutId = this.spec.host.setTimeout(() => {
      this.victoryTimeoutId = undefined;
      if (this.spec.signal.aborted) return;
      this.spec.apply({ type: "victoryTransitionComplete", nowMs: performance.now() });
    }, delayMs);
  }

  private disposeSession(): void {
    this.session?.[Symbol.dispose]();
    this.session = undefined;
  }
}
