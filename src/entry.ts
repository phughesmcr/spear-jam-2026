import type { Entity } from "@phughesmcr/miski";
import { createGameSession, type GameSession } from "@/src/ecs/session.ts";
import { type GameCommand, type PlayerCommand, relativeMoveDirectionOffset } from "@/src/game/commands.ts";
import { directionDelta, normalizeDirection } from "@/src/grid/direction.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { messageForEvent } from "@/src/game/messages.ts";
import { SplitMix32 } from "@/src/game/rng.ts";
import {
  createGameModel,
  type GameEffect,
  type GameModel,
  type GameTransitionEvent,
  transition,
} from "@/src/game/transition.ts";
import { setupInput } from "@/src/input/input.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import { getMap, START_MAP_NAME } from "@/src/map/maps.ts";
import { configureCanvasDpi, DEFAULT_GAME_CANVAS_SIZE, type GameCanvasSize } from "@/src/render/canvas.ts";
import { dialogueOptionSlotAt } from "@/src/render/dialogue.ts";
import { createFirstPersonRenderer, type FirstPersonRenderer } from "@/src/render/first_person.ts";
import { preloadGameAssets, renderGameFrame } from "@/src/render/game.ts";
import { verbMenuTargetAt } from "@/src/render/verb_menu.ts";
import type { WeaponHudPhase } from "@/src/render/weapon_hud.ts";

const WEAPON_HUD_ACTIVE_MS = 140;
const KEY_HUD_VISIBLE_MS = 1400;
const MESSAGE_HUD_VISIBLE_MS = 2200;
const MESSAGE_HUD_MAX_LINES = 2;

type MessageHudEntry = {
  readonly id: number;
  readonly text: string;
  readonly timeoutId: number;
};

export interface GameSpec {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  seed: number;
  startMapName?: string;
  window: Window;
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
  private readonly firstPersonRenderer: FirstPersonRenderer;
  private readonly rng: SplitMix32;
  private model: GameModel;
  private canvasController: Disposable;
  private canvasSize: GameCanvasSize = DEFAULT_GAME_CANVAS_SIZE;
  private weaponHudPhase: WeaponHudPhase = "idle";
  private weaponHudTimeoutId?: number;
  private keyHudVisible = false;
  private keyHudTimeoutId?: number;
  private messageHudEntries: MessageHudEntry[] = [];
  private nextMessageHudId = 1;
  private inputController?: Disposable;
  private session?: GameSession;
  private started = false;
  private animationFrameId?: number;
  private readonly runAnimationFrame = (nowMs: number): void => {
    this.animationFrameId = undefined;
    this.updateAndRender(nowMs);
  };
  private readonly renderLoadedAssets = (): void => {
    if (this.started) this.updateAndRenderNow();
  };

  constructor(spec: GameSpec, controller: AbortController) {
    this.spec = spec;
    this.controller = controller;
    this.model = createGameModel(spec.startMapName ?? START_MAP_NAME, { showIntro: spec.startMapName === undefined });
    this.firstPersonRenderer = createFirstPersonRenderer();
    this.rng = new SplitMix32(spec.seed);
    this.canvasController = configureCanvasDpi(
      spec.window,
      spec.canvas,
      spec.ctx,
      (size) => this.resize(size),
    );
  }

  start(): void {
    this.started = true;
    this.apply({ type: "start", nowMs: performance.now() });
  }

  resize(size: GameCanvasSize): void {
    this.canvasSize = size;
    if (this.started) {
      this.updateAndRenderNow();
    }
  }

  private updateAndRenderNow(): void {
    if (!this.started || this.controller.signal.aborted) return;
    this.cancelPendingFrame();
    this.updateAndRender(performance.now());
  }

  private updateAndRender(nowMs: number): void {
    if (!this.started || this.controller.signal.aborted) return;
    const tickResult = this.tickSession(nowMs);
    const renderResult = renderGameFrame(
      this.spec.ctx,
      this.canvasSize,
      this.session,
      this.model.mode,
      this.messageHudEntries.map((entry) => entry.text),
      this.model.combatFeedback,
      this.model.viewMode,
      this.weaponHudPhase,
      this.firstPersonRenderer,
      { showKeys: this.keyHudVisible },
      nowMs,
      this.renderLoadedAssets,
    );
    this.setFrameNeeded(tickResult.needsFrame || renderResult.needsFrame);
  }

  private tickSession(nowMs: number): { readonly needsFrame: boolean } {
    if (this.session === undefined) return { needsFrame: false };
    const mode = this.model.mode.type;
    if (mode !== "playing" && mode !== "verbMenu") return { needsFrame: false };
    return this.session.tick(nowMs);
  }

  private setFrameNeeded(needsFrame: boolean): void {
    if (needsFrame) {
      this.requestNextFrame();
      return;
    }
    this.cancelPendingFrame();
  }

  private requestNextFrame(): void {
    if (this.animationFrameId !== undefined || this.controller.signal.aborted || !this.started) return;
    this.animationFrameId = this.spec.window.requestAnimationFrame(this.runAnimationFrame);
  }

  private cancelPendingFrame(): void {
    if (this.animationFrameId === undefined) return;
    this.spec.window.cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = undefined;
  }

  private async loadMap(mapName: string): Promise<void> {
    const map = getMap(mapName);
    let createdSession: GameSession | undefined;
    try {
      await preloadGameAssets(
        this.spec.canvas.ownerDocument,
        this.firstPersonRenderer,
        this.renderLoadedAssets,
      );
      if (this.session === undefined) {
        createdSession = await createGameSession(map, () => this.rng.nextFloat());
      } else {
        this.session.loadMap(map);
      }
    } catch (error) {
      createdSession?.[Symbol.dispose]();
      throw error;
    }
    if (this.controller.signal.aborted) {
      createdSession?.[Symbol.dispose]();
      return;
    }
    if (createdSession !== undefined) this.session = createdSession;
    this.finishMapLoad(mapName);
  }

  private async retryMap(mapName: string): Promise<void> {
    await this.withLoadedAssets(() => {
      const session = this.session;
      if (session === undefined) {
        throw new Error("Cannot retry before the game session exists.");
      }
      session.retryMap(getMap(mapName));
    });
    if (!this.controller.signal.aborted) this.finishMapLoad(mapName);
  }

  private async resetRun(mapName: string): Promise<void> {
    await this.withLoadedAssets(() => {
      const session = this.session;
      if (session === undefined) {
        throw new Error("Cannot reset before the game session exists.");
      }
      session.resetRun(getMap(mapName));
    });
    if (!this.controller.signal.aborted) this.finishMapLoad(mapName);
  }

  private async withLoadedAssets(run: () => void): Promise<void> {
    await preloadGameAssets(
      this.spec.canvas.ownerDocument,
      this.firstPersonRenderer,
      this.renderLoadedAssets,
    );
    if (this.controller.signal.aborted) return;
    run();
  }

  private finishMapLoad(mapName: string): void {
    this.firstPersonRenderer.reset();
    this.clearWeaponHudTimeout();
    this.clearKeyHudTimeout();
    this.clearMessageHudEntries();
    this.weaponHudPhase = "idle";
    this.keyHudVisible = false;
    this.apply({ type: "mapLoaded", mapName });
  }

  private startLoad(mapName: string): void {
    void this.loadMap(mapName).catch((error: unknown) => this.handleLoadError(error));
  }

  private startRetry(mapName: string): void {
    void this.retryMap(mapName).catch((error: unknown) => this.handleLoadError(error));
  }

  private startResetRun(mapName: string): void {
    void this.resetRun(mapName).catch((error: unknown) => this.handleLoadError(error));
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
    this.apply({ type: "gameCommand", command, nowMs: performance.now() });
  }

  private handlePointerInput(input: CanvasPointerInput): void {
    const mode = this.model.mode;
    if (mode.type === "intermission") {
      if (input.phase === "up") {
        this.handleGameCommand({ type: "wait" });
      }
      return;
    }

    if (mode.type === "victory" || mode.type === "defeat") {
      if (input.phase === "up") {
        this.handleGameCommand({ type: "wait" });
      }
      return;
    }

    if (mode.type === "dialogue") {
      this.apply({
        type: "dialoguePointer",
        phase: input.phase,
        optionSlot: dialogueOptionSlotAt(this.canvasSize, mode.choices, input),
      });
      return;
    }

    if (mode.type === "help") {
      if (input.phase === "up") {
        this.handleGameCommand({ type: "wait" });
      }
      return;
    }

    if (mode.type === "playing" && this.model.viewMode === "topDown") {
      if (input.phase === "up") {
        this.handleGameCommand({ type: "toggleView" });
      }
      return;
    }

    this.apply({
      type: "verbPointer",
      phase: input.phase,
      target: verbMenuTargetAt(this.canvasSize, input),
    });
  }

  private handlePlayerCommand(command: PlayerCommand): void {
    if (!this.session) return;

    const nowMs = performance.now();
    const playerEntity = this.session.playerEntity;
    const moveFrom = command.type === "move" ? this.session.getPlayerPosition() : undefined;
    const result = this.session.handlePlayerCommand(command);
    if (command.type === "move" && moveFrom !== undefined) {
      const position = this.session.getPlayerPosition();
      if (position.x === moveFrom.x && position.y === moveFrom.y) {
        // The move was blocked: play a recoil lunge toward the obstacle.
        const worldDir = normalizeDirection(
          this.session.getPlayerFacing().dir + relativeMoveDirectionOffset(command.direction),
        );
        const delta = directionDelta(worldDir);
        this.firstPersonRenderer.bump(delta.dx, delta.dy, nowMs);
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
      this.firstPersonRenderer.reset();
    }
    this.executeEffects(next.effects);
  }

  private executeEffects(effects: readonly GameEffect[]): void {
    for (const effect of effects) {
      switch (effect.type) {
        case "render":
          this.updateAndRenderNow();
          break;
        case "closeDialogue":
          this.session?.closeDialogue();
          break;
        case "ensureInput":
          this.ensureInput();
          break;
        case "loadMap":
          this.startLoad(effect.mapName);
          break;
        case "retryMap":
          this.startRetry(effect.mapName);
          break;
        case "resetRun":
          this.startResetRun(effect.mapName);
          break;
        case "runPlayerCommand":
          this.handlePlayerCommand(effect.command);
          break;
      }
    }
  }

  private ensureInput(): void {
    this.inputController ??= setupInput(
      this.spec.window,
      this.spec.canvas,
      () => this.canvasSize,
      (command) => this.handleGameCommand(command),
      (input) => this.handlePointerInput(input),
      () => this.model.mode.type === "playing" && this.model.viewMode === "firstPerson",
    );
  }

  private flashWeaponHud(): void {
    this.clearWeaponHudTimeout();
    this.weaponHudPhase = "active";
    this.weaponHudTimeoutId = this.spec.window.setTimeout(() => {
      this.weaponHudTimeoutId = undefined;
      this.weaponHudPhase = "idle";
      this.updateAndRenderNow();
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
      this.updateAndRenderNow();
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
    this.updateAndRenderNow();
  }

  private clearMessageHudEntries(): void {
    for (const entry of this.messageHudEntries) {
      this.spec.window.clearTimeout(entry.timeoutId);
    }
    this.messageHudEntries = [];
  }

  [Symbol.dispose](): void {
    this.controller.abort();
    this.cancelPendingFrame();
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
