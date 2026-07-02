import { createGameSession, type GameSession } from "@/src/ecs/session.ts";
import { isPlayerCommand } from "@/src/game/commands.ts";
import type { GameCommand } from "@/src/game/commands.ts";
import type { PlayerCommand } from "@/src/game/commands.ts";
import { combatFeedbackForEvents } from "@/src/game/combat_feedback.ts";
import type { CombatFeedback } from "@/src/game/combat_feedback.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { createPlayerState } from "@/src/game/state.ts";
import type { DialogueState, GameMode, PlayerState } from "@/src/game/state.ts";
import { messageForEvent } from "@/src/game/messages.ts";
import { SplitMix32 } from "@/src/game/rng.ts";
import { setupInput } from "@/src/input/input.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import { getMap, START_MAP_NAME } from "@/src/map/maps.ts";
import { configureCanvasDpi, DEFAULT_GAME_CANVAS_SIZE } from "@/src/render/canvas.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { renderGameFrame } from "@/src/render/game.ts";
import { verbMenuHotspotIndexAt } from "@/src/render/verb_menu.ts";
import { VERBS, verbToCommand } from "@/src/game/verbs.ts";

const MESSAGE_LOG_LIMIT = 5;

type IntermissionMode = Extract<GameMode, { readonly type: "intermission" }>;
type DialogueMode = Extract<GameMode, { readonly type: "dialogue" }>;
type VerbMenuMode = Extract<GameMode, { readonly type: "verbMenu" }>;

export interface GameSpec {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  seed: number;
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
  private readonly rng: SplitMix32;
  private canvasController: Disposable;
  private canvasSize: GameCanvasSize = DEFAULT_GAME_CANVAS_SIZE;
  private inputController?: Disposable;
  private session?: GameSession;
  private currentMapName = START_MAP_NAME;
  private currentLevelEntryState?: PlayerState;
  private recentMessages: string[] = [];
  private combatFeedback: readonly CombatFeedback[] = [];
  private mode: GameMode = { type: "loading" };
  private lastVerbIndex = 0;
  private verbPointerDownIndex?: number;
  private started = false;
  private readonly renderLoadedAssets = (): void => {
    if (this.started) this.render();
  };

  constructor(spec: GameSpec, controller: AbortController) {
    this.spec = spec;
    this.controller = controller;
    this.rng = new SplitMix32(spec.seed);
    this.canvasController = configureCanvasDpi(spec.window, spec.canvas, spec.ctx, (size) => this.resize(size));
  }

  start(): void {
    this.started = true;
    this.render();
    void this.loadMap(START_MAP_NAME).catch((error: unknown) => this.handleLoadError(error));
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
      this.mode,
      this.recentMessages,
      this.combatFeedback,
      this.renderLoadedAssets,
    );
  }

  private async loadMap(mapName: string, playerState?: PlayerState): Promise<void> {
    this.mode = { type: "loading" };
    this.render();

    const session = await createGameSession(getMap(mapName), () => this.rng.nextFloat(), playerState);
    if (this.controller.signal.aborted) {
      session[Symbol.dispose]();
      return;
    }

    const previousSession = this.session;
    this.session = session;
    previousSession?.[Symbol.dispose]();
    this.currentMapName = mapName;
    this.currentLevelEntryState = snapshotPlayerState(playerState);
    this.mode = { type: "playing" };
    this.inputController ??= setupInput(
      this.spec.window,
      this.spec.canvas,
      () => this.canvasSize,
      (command) => this.handleGameCommand(command),
      (input) => this.handlePointerInput(input),
    );
    this.render();
  }

  private handleLoadError(error: unknown): void {
    if (this.controller.signal.aborted) return;
    console.error("Failed to start game.", error);
    this.mode = {
      type: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    };
    this.render();
  }

  private handleGameCommand(command: GameCommand): void {
    const mode = this.mode;
    if (mode.type === "intermission") {
      this.handleIntermissionCommand(mode, command);
      return;
    }

    if (mode.type === "dialogue") {
      this.handleDialogueCommand(mode, command);
      return;
    }

    if (mode.type === "verbMenu") {
      this.handleVerbMenuCommand(mode, command);
      return;
    }

    if (mode.type === "victory" || mode.type === "defeat") {
      if (command.type === "wait") this.restartFromOutcome(mode.type);
      return;
    }

    if (isPlayerCommand(command)) {
      if (mode.type !== "playing") return;
      this.handlePlayerCommands([command]);
      return;
    }

    switch (command.type) {
      case "action":
        if (this.mode.type !== "playing") return;
        this.openVerbMenu();
        this.render();
        return;
      case "menu":
        this.toggleMenu();
        this.render();
        return;
      case "pause":
        this.togglePause();
        this.render();
        return;
    }
  }

  private handleIntermissionCommand(mode: IntermissionMode, command: GameCommand): void {
    if (command.type !== "wait") return;
    const { goto, playerState } = mode;
    void this.loadMap(goto, playerState).catch((error: unknown) => this.handleLoadError(error));
  }

  private handleDialogueCommand(_mode: DialogueMode, command: GameCommand): void {
    if (command.type !== "wait") return;
    this.mode = { type: "playing" };
    this.render();
  }

  private handleVerbMenuCommand(mode: VerbMenuMode, command: GameCommand): void {
    switch (command.type) {
      case "move":
        if (command.direction === "forward") {
          this.moveVerbSelection(mode, -1);
          this.render();
          return;
        }
        if (command.direction === "backward") {
          this.moveVerbSelection(mode, 1);
          this.render();
          return;
        }
        return;
      case "wait":
      case "action":
        this.confirmVerbSelection(mode);
        return;
      case "menu":
        this.verbPointerDownIndex = undefined;
        this.mode = { type: "playing" };
        this.render();
        return;
      case "turn":
      case "interact":
      case "examine":
      case "attack":
      case "selectWeapon":
      case "pause":
        return;
    }
  }

  private handlePointerInput(input: CanvasPointerInput): void {
    const mode = this.mode;
    if (mode.type !== "verbMenu") return;

    const hotspotIndex = verbMenuHotspotIndexAt(this.canvasSize, input);
    switch (input.phase) {
      case "move":
        if (hotspotIndex !== undefined && hotspotIndex !== mode.selectedIndex) {
          this.selectVerbSelection(mode, hotspotIndex);
          this.render();
        }
        return;
      case "down":
        this.verbPointerDownIndex = hotspotIndex;
        if (hotspotIndex !== undefined && hotspotIndex !== mode.selectedIndex) {
          this.selectVerbSelection(mode, hotspotIndex);
          this.render();
        }
        return;
      case "up": {
        const downIndex = this.verbPointerDownIndex;
        this.verbPointerDownIndex = undefined;
        if (hotspotIndex === undefined) return;
        const selectedMode = this.selectVerbSelection(mode, hotspotIndex);
        if (downIndex === hotspotIndex) {
          this.confirmVerbSelection(selectedMode);
        } else {
          this.render();
        }
        return;
      }
      case "cancel":
        this.verbPointerDownIndex = undefined;
        return;
    }
  }

  private restartFromOutcome(outcome: "victory" | "defeat"): void {
    this.recentMessages = [];
    this.combatFeedback = [];
    if (outcome === "defeat") {
      void this.loadMap(this.currentMapName, snapshotPlayerState(this.currentLevelEntryState)).catch((error: unknown) =>
        this.handleLoadError(error)
      );
      return;
    }

    void this.loadMap(START_MAP_NAME).catch((error: unknown) => this.handleLoadError(error));
  }

  private toggleMenu(): void {
    switch (this.mode.type) {
      case "playing":
        this.mode = { type: "menu" };
        return;
      case "menu":
        this.mode = { type: "playing" };
        return;
    }
  }

  private togglePause(): void {
    switch (this.mode.type) {
      case "playing":
        this.mode = { type: "paused" };
        return;
      case "paused":
        this.mode = { type: "playing" };
        return;
    }
  }

  private openVerbMenu(): void {
    this.verbPointerDownIndex = undefined;
    this.mode = { type: "verbMenu", selectedIndex: this.lastVerbIndex };
  }

  private moveVerbSelection(mode: VerbMenuMode, delta: number): VerbMenuMode {
    const selectedIndex = (mode.selectedIndex + delta + VERBS.length) % VERBS.length;
    const nextMode = { type: "verbMenu", selectedIndex } satisfies VerbMenuMode;
    this.mode = nextMode;
    return nextMode;
  }

  private selectVerbSelection(mode: VerbMenuMode, selectedIndex: number): VerbMenuMode {
    if (selectedIndex === mode.selectedIndex) return mode;

    const nextMode = { type: "verbMenu", selectedIndex } satisfies VerbMenuMode;
    this.mode = nextMode;
    return nextMode;
  }

  private confirmVerbSelection(mode: VerbMenuMode): void {
    const selectedIndex = mode.selectedIndex;
    this.verbPointerDownIndex = undefined;
    this.lastVerbIndex = selectedIndex;
    this.mode = { type: "playing" };
    this.handlePlayerCommands([verbToCommand(selectedIndex)]);
  }

  private handlePlayerCommands(commands: readonly PlayerCommand[]): void {
    if (!this.session) return;

    for (const command of commands) {
      const result = this.session.handlePlayerCommand(command);
      this.appendEventMessages(result.events);
      if (result.outcome) {
        this.mode = { type: result.outcome };
        this.render();
        return;
      }
      if (result.mapChange) {
        this.enterIntermission(result.mapChange.goto);
        this.render();
        return;
      }
      if (result.dialogue) {
        this.enterDialogue(result.dialogue);
        this.render();
        return;
      }
    }

    this.render();
  }

  private appendEventMessages(events: readonly GameEvent[]): void {
    if (!this.session) return;

    const playerEntity = this.session.player.getEntity();
    this.combatFeedback = combatFeedbackForEvents(playerEntity, events);
    for (const event of events) {
      this.recentMessages.push(messageForEvent(playerEntity, event));
    }
    if (this.recentMessages.length > MESSAGE_LOG_LIMIT) {
      this.recentMessages.splice(0, this.recentMessages.length - MESSAGE_LOG_LIMIT);
    }
  }

  private enterIntermission(goto: string): void {
    if (!this.session) return;
    this.mode = {
      type: "intermission",
      message: `Entering ${goto}. Space to continue.`,
      goto,
      playerState: this.session.getPlayerState(),
    };
  }

  private enterDialogue(dialogue: DialogueState): void {
    this.mode = {
      type: "dialogue",
      ...dialogue,
    };
  }

  [Symbol.dispose](): void {
    this.controller.abort();
    this.inputController?.[Symbol.dispose]();
    this.session?.[Symbol.dispose]();
    this.canvasController?.[Symbol.dispose]();
  }
}

function snapshotPlayerState(playerState: PlayerState | undefined): PlayerState | undefined {
  if (playerState === undefined) return undefined;
  return createPlayerState(playerState);
}
