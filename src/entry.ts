import type { Entity } from "@phughesmcr/miski";
import { createGameSession as createRealGameSession, type GameSession } from "@/src/ecs/session.ts";
import { relativeMoveDirectionOffset } from "@/src/game/commands.ts";
import type { GameCommand } from "@/src/game/commands.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import { directionDelta, normalizeDirection } from "@/src/grid/direction.ts";
import type { CombatFeedback } from "@/src/game/combat_feedback.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { messageForEvent } from "@/src/game/messages.ts";
import { SplitMix32 } from "@/src/game/rng.ts";
import { createGameModel, transition } from "@/src/game/transition.ts";
import type { GameEffect, GameModel, GameTransitionEvent } from "@/src/game/transition.ts";
import type { GameMode, PlayerState, ViewMode } from "@/src/game/state.ts";
import { setupInput as setupRealInput } from "@/src/input/input.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import { getMap as getRealMap, START_MAP_NAME } from "@/src/map/maps.ts";
import { configureCanvasDpi as configureRealCanvasDpi, DEFAULT_GAME_CANVAS_SIZE } from "@/src/render/canvas.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { bumpFirstPersonView, markSpriteAttack, markSpriteDeath } from "@/src/render/first_person.ts";
import {
  preloadGameAssets as preloadRealGameAssets,
  renderGameFrame as renderRealGameFrame,
} from "@/src/render/game.ts";
import type { FirstPersonHudOptions } from "@/src/render/hud.ts";
import { verbMenuHotspotIndexAt } from "@/src/render/verb_menu.ts";
import type { WeaponHudPhase } from "@/src/render/weapon_hud.ts";

const WEAPON_HUD_ACTIVE_MS = 140;
const KEY_HUD_VISIBLE_MS = 1400;
const MESSAGE_HUD_VISIBLE_MS = 2200;
const MESSAGE_HUD_MAX_LINES = 2;

interface GameSessionHandle extends Disposable {
  readonly map: GameSession["map"];
  readonly player: Pick<GameSession["player"], "getEntity" | "getPosition" | "getFacing">;
  getPlayerState(): PlayerState;
  handlePlayerCommand(command: PlayerCommand): PlayerCommandResult;
}

type GameSessionFactory = (
  map: Parameters<typeof createRealGameSession>[0],
  random: Parameters<typeof createRealGameSession>[1],
  playerState?: Parameters<typeof createRealGameSession>[2],
) => Promise<GameSessionHandle>;

type GameFrameRenderer = (
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  session: GameSessionHandle | undefined,
  mode: GameMode,
  messages: readonly string[],
  combatFeedback: readonly CombatFeedback[],
  viewMode: ViewMode,
  weaponHudPhase: WeaponHudPhase,
  firstPersonHud: FirstPersonHudOptions,
  onAssetLoad?: () => void,
) => void;

type MessageHudEntry = {
  readonly id: number;
  readonly text: string;
  readonly timeoutId: number;
};

export interface GameRuntime {
  readonly configureCanvasDpi: typeof configureRealCanvasDpi;
  readonly createGameSession: GameSessionFactory;
  readonly getMap: typeof getRealMap;
  readonly preloadGameAssets: typeof preloadRealGameAssets;
  readonly renderGameFrame: GameFrameRenderer;
  readonly setupInput: typeof setupRealInput;
}

export interface GameSpec {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  seed: number;
  window: Window;
  runtime?: GameRuntime;
}

export function startGame(spec: GameSpec): Disposable {
  const controller = new AbortController();
  const game = new Game(spec, controller);
  game.start();
  return game;
}

class Game implements Disposable {
  private readonly spec: GameSpec;
  private readonly controller: AbortController;
  private readonly runtime: GameRuntime;
  private readonly rng: SplitMix32;
  private model: GameModel = createGameModel(START_MAP_NAME);
  private canvasController: Disposable;
  private canvasSize: GameCanvasSize = DEFAULT_GAME_CANVAS_SIZE;
  private weaponHudPhase: WeaponHudPhase = "idle";
  private weaponHudTimeoutId?: number;
  private keyHudVisible = false;
  private keyHudTimeoutId?: number;
  private messageHudEntries: MessageHudEntry[] = [];
  private nextMessageHudId = 1;
  private inputController?: Disposable;
  private session?: GameSessionHandle;
  private started = false;
  private readonly renderLoadedAssets = (): void => {
    if (this.started) this.render();
  };

  constructor(spec: GameSpec, controller: AbortController) {
    this.spec = spec;
    this.controller = controller;
    this.runtime = spec.runtime ?? gameRuntime();
    this.rng = new SplitMix32(spec.seed);
    this.canvasController = this.runtime.configureCanvasDpi(
      spec.window,
      spec.canvas,
      spec.ctx,
      (size) => this.resize(size),
    );
  }

  start(): void {
    this.started = true;
    this.apply({ type: "start" });
  }

  resize(size: GameCanvasSize): void {
    this.canvasSize = size;
    if (this.started) {
      this.render();
    }
  }

  private render(): void {
    this.runtime.renderGameFrame(
      this.spec.ctx,
      this.canvasSize,
      this.session,
      this.model.mode,
      this.messageHudEntries.map((entry) => entry.text),
      this.model.combatFeedback,
      this.model.viewMode,
      this.weaponHudPhase,
      { showKeys: this.keyHudVisible },
      this.renderLoadedAssets,
    );
  }

  private async loadMap(mapName: string, playerState?: PlayerState): Promise<void> {
    const [session] = await Promise.all([
      this.runtime.createGameSession(this.runtime.getMap(mapName), () => this.rng.nextFloat(), playerState),
      this.runtime.preloadGameAssets(this.spec.canvas.ownerDocument, this.renderLoadedAssets),
    ]);
    if (this.controller.signal.aborted) {
      session[Symbol.dispose]();
      return;
    }

    const previousSession = this.session;
    this.session = session;
    this.clearWeaponHudTimeout();
    this.clearKeyHudTimeout();
    this.clearMessageHudEntries();
    this.weaponHudPhase = "idle";
    this.keyHudVisible = false;
    previousSession?.[Symbol.dispose]();
    this.apply({ type: "mapLoaded", mapName, playerState });
  }

  private startLoad(mapName: string, playerState?: PlayerState): void {
    void this.loadMap(mapName, playerState).catch((error: unknown) => this.handleLoadError(error));
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
    this.apply({ type: "gameCommand", command });
  }

  private handlePointerInput(input: CanvasPointerInput): void {
    this.apply({
      type: "verbPointer",
      phase: input.phase,
      hotspotIndex: verbMenuHotspotIndexAt(this.canvasSize, input),
    });
  }

  private handlePlayerCommand(command: PlayerCommand): void {
    if (!this.session) return;

    const playerEntity = this.session.player.getEntity();
    const moveFrom = command.type === "move" ? this.session.player.getPosition() : undefined;
    const result = this.session.handlePlayerCommand(command);
    if (command.type === "move" && moveFrom !== undefined) {
      const position = this.session.player.getPosition();
      if (position.x === moveFrom.x && position.y === moveFrom.y) {
        // The move was blocked: play a recoil lunge toward the obstacle.
        const worldDir = normalizeDirection(
          this.session.player.getFacing().dir + relativeMoveDirectionOffset(command.direction),
        );
        const delta = directionDelta(worldDir);
        bumpFirstPersonView(delta.dx, delta.dy);
      }
    }
    if (playerAttackOccurred(result.events, playerEntity)) {
      this.flashWeaponHud();
    }
    if (keyHudShouldFlash(result.events)) {
      this.flashKeyHud();
    }
    if (result.events.length > 0) {
      this.addMessageHudMessages(result.events.map((event) => messageForEvent(playerEntity, event)));
    }
    for (const event of result.events) {
      // First-person sprite animation: enemies strike a pose when they
      // attack and play a death sequence when defeated.
      if ((event.type === "damageDealt" || event.type === "attackMissed") && event.actor !== playerEntity) {
        markSpriteAttack(event.actor);
      } else if (event.type === "entityDefeated") {
        markSpriteDeath(event.entity);
      }
    }
    this.apply({
      type: "playerCommandResult",
      result,
      playerEntity,
      playerState: this.session.getPlayerState(),
    });
  }

  private apply(event: GameTransitionEvent): void {
    const next = transition(this.model, event);
    this.model = next.model;
    this.executeEffects(next.effects);
  }

  private executeEffects(effects: readonly GameEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "render":
          this.render();
          break;
        case "ensureInput":
          this.ensureInput();
          break;
        case "loadMap":
          this.startLoad(effect.mapName, effect.playerState);
          break;
        case "runPlayerCommand":
          this.handlePlayerCommand(effect.command);
          break;
      }
    }
  }

  private ensureInput(): void {
    this.inputController ??= this.runtime.setupInput(
      this.spec.window,
      this.spec.canvas,
      () => this.canvasSize,
      (command) => this.handleGameCommand(command),
      (input) => this.handlePointerInput(input),
      () => this.model.mode.type === "playing",
    );
  }

  private flashWeaponHud(): void {
    this.clearWeaponHudTimeout();
    this.weaponHudPhase = "active";
    this.weaponHudTimeoutId = this.spec.window.setTimeout(() => {
      this.weaponHudTimeoutId = undefined;
      this.weaponHudPhase = "idle";
      this.render();
    }, WEAPON_HUD_ACTIVE_MS);
  }

  private clearWeaponHudTimeout(): void {
    if (this.weaponHudTimeoutId === undefined) return;
    this.spec.window.clearTimeout(this.weaponHudTimeoutId);
    this.weaponHudTimeoutId = undefined;
  }

  private flashKeyHud(): void {
    this.clearKeyHudTimeout();
    this.keyHudVisible = true;
    this.keyHudTimeoutId = this.spec.window.setTimeout(() => {
      this.keyHudTimeoutId = undefined;
      this.keyHudVisible = false;
      this.render();
    }, KEY_HUD_VISIBLE_MS);
  }

  private clearKeyHudTimeout(): void {
    if (this.keyHudTimeoutId === undefined) return;
    this.spec.window.clearTimeout(this.keyHudTimeoutId);
    this.keyHudTimeoutId = undefined;
  }

  private addMessageHudMessages(messages: readonly string[]): void {
    const activeTexts = new Set(this.messageHudEntries.map((entry) => entry.text));
    for (const text of messages) {
      if (activeTexts.has(text)) continue;
      activeTexts.add(text);
      const id = this.nextMessageHudId;
      this.nextMessageHudId++;
      const timeoutId = this.spec.window.setTimeout(() => this.expireMessageHudEntry(id), MESSAGE_HUD_VISIBLE_MS);
      this.messageHudEntries.push({ id, text, timeoutId });
    }
    this.trimMessageHudEntries();
  }

  private trimMessageHudEntries(): void {
    while (this.messageHudEntries.length > MESSAGE_HUD_MAX_LINES) {
      const entry = this.messageHudEntries[0];
      if (entry === undefined) return;
      this.spec.window.clearTimeout(entry.timeoutId);
      this.messageHudEntries = this.messageHudEntries.slice(1);
    }
  }

  private expireMessageHudEntry(id: number): void {
    this.messageHudEntries = this.messageHudEntries.filter((entry) => entry.id !== id);
    this.render();
  }

  private clearMessageHudEntries(): void {
    for (const entry of this.messageHudEntries) {
      this.spec.window.clearTimeout(entry.timeoutId);
    }
    this.messageHudEntries = [];
  }

  [Symbol.dispose](): void {
    this.controller.abort();
    this.clearWeaponHudTimeout();
    this.clearKeyHudTimeout();
    this.clearMessageHudEntries();
    this.inputController?.[Symbol.dispose]();
    this.session?.[Symbol.dispose]();
    this.canvasController?.[Symbol.dispose]();
  }
}

function playerAttackOccurred(events: readonly GameEvent[], playerEntity: Entity): boolean {
  return events.some((event) => {
    switch (event.type) {
      case "attackMissed":
      case "damageDealt":
      case "entityDefeated":
        return event.actor === playerEntity;
      default:
        return false;
    }
  });
}

function keyHudShouldFlash(events: readonly GameEvent[]): boolean {
  return events.some((event) => event.type === "keyPickedUp" || event.type === "doorLocked");
}

function gameRuntime(): GameRuntime {
  return {
    configureCanvasDpi: configureRealCanvasDpi,
    createGameSession: createRuntimeGameSession,
    getMap: getRealMap,
    preloadGameAssets: preloadRealGameAssets,
    renderGameFrame: renderRuntimeGameFrame,
    setupInput: setupRealInput,
  };
}

function createRuntimeGameSession(
  map: Parameters<typeof createRealGameSession>[0],
  random: Parameters<typeof createRealGameSession>[1],
  playerState?: Parameters<typeof createRealGameSession>[2],
): Promise<GameSessionHandle> {
  return createRealGameSession(map, random, playerState);
}

function renderRuntimeGameFrame(
  ctx: CanvasRenderingContext2D,
  canvasSize: GameCanvasSize,
  session: GameSessionHandle | undefined,
  mode: GameMode,
  messages: readonly string[],
  combatFeedback: readonly CombatFeedback[],
  viewMode: ViewMode,
  weaponHudPhase: WeaponHudPhase,
  firstPersonHud: FirstPersonHudOptions,
  onAssetLoad?: () => void,
): void {
  renderRealGameFrame(
    ctx,
    canvasSize,
    session as GameSession | undefined,
    mode,
    messages,
    combatFeedback,
    viewMode,
    weaponHudPhase,
    firstPersonHud,
    onAssetLoad,
  );
}
