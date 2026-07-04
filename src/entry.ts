import type { Entity } from "@phughesmcr/miski";
import { createGameSession, type GameSession } from "@/src/ecs/session.ts";
import { relativeMoveDirectionOffset } from "@/src/game/commands.ts";
import type { GameCommand } from "@/src/game/commands.ts";
import type { PlayerCommand } from "@/src/game/commands.ts";
import { directionDelta, normalizeDirection } from "@/src/grid/direction.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { messageForEvent } from "@/src/game/messages.ts";
import { SplitMix32 } from "@/src/game/rng.ts";
import { createGameModel, transition } from "@/src/game/transition.ts";
import type { GameEffect, GameModel, GameTransitionEvent } from "@/src/game/transition.ts";
import type { PlayerStateInput } from "@/src/game/state.ts";
import { setupInput } from "@/src/input/input.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import { getMap, START_MAP_NAME } from "@/src/map/maps.ts";
import { configureCanvasDpi, DEFAULT_GAME_CANVAS_SIZE } from "@/src/render/canvas.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { dialogueOptionSlotAt } from "@/src/render/dialogue.ts";
import { createFirstPersonRenderer } from "@/src/render/first_person.ts";
import type { FirstPersonRenderer } from "@/src/render/first_person.ts";
import { preloadGameAssets, renderGameFrame } from "@/src/render/game.ts";
import { verbMenuHotspotIndexAt } from "@/src/render/verb_menu.ts";
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
  private readonly renderLoadedAssets = (): void => {
    if (this.started) this.render();
  };

  constructor(spec: GameSpec, controller: AbortController) {
    this.spec = spec;
    this.controller = controller;
    this.model = createGameModel(spec.startMapName ?? START_MAP_NAME);
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
    this.apply({ type: "start" });
  }

  resize(size: GameCanvasSize): void {
    this.canvasSize = size;
    if (this.started) {
      this.render();
    }
  }

  private render(): void {
    renderGameFrame(
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
      this.renderLoadedAssets,
    );
  }

  private async loadMap(mapName: string, playerState?: PlayerStateInput): Promise<void> {
    const [session] = await Promise.all([
      createGameSession(getMap(mapName), () => this.rng.nextFloat(), playerState),
      preloadGameAssets(
        this.spec.canvas.ownerDocument,
        this.firstPersonRenderer,
        this.renderLoadedAssets,
      ),
    ]);
    if (this.controller.signal.aborted) {
      session[Symbol.dispose]();
      return;
    }

    const previousSession = this.session;
    this.session = session;
    this.firstPersonRenderer.reset();
    this.clearWeaponHudTimeout();
    this.clearKeyHudTimeout();
    this.clearMessageHudEntries();
    this.weaponHudPhase = "idle";
    this.keyHudVisible = false;
    previousSession?.[Symbol.dispose]();
    this.apply({ type: "mapLoaded", mapName, playerState });
  }

  private startLoad(mapName: string, playerState?: PlayerStateInput): void {
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
    const mode = this.model.mode;
    if (mode.type === "dialogue") {
      this.apply({
        type: "dialoguePointer",
        phase: input.phase,
        optionSlot: dialogueOptionSlotAt(this.canvasSize, mode.choices, input),
      });
      return;
    }

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
        this.firstPersonRenderer.bump(delta.dx, delta.dy);
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
      playerState: this.session.getPlayerState(),
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
    this.inputController ??= setupInput(
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
