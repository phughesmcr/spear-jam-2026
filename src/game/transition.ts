import { dialogueTreeNode } from "@/src/dialogue/dialogue.ts";
import {
  type AudioChannel,
  type AudioSettings,
  DEFAULT_AUDIO_SETTINGS,
  withAudioVolume,
} from "@/src/game/audio_settings.ts";
import {
  type GameCommand,
  isPlayerCommand,
  type PlayerCommand,
  type PlayerCommandResult,
} from "@/src/game/commands.ts";
import { hasNextIntermissionPage, type IntermissionMode, isMessageRevealed } from "@/src/game/intermission.ts";
import { CONTINUE_INTERMISSION_PROMPT, INTRO_INTERMISSION } from "@/src/game/intro.ts";
import { consumeGameEvents, createPresentationState, type PresentationState } from "@/src/game/presentation.ts";
import type { GameMode, TitleHoverButton, VerbMenuTarget, ViewMode } from "@/src/game/state.ts";
import { openVerbMenu, verbMenuCommand, verbPointer } from "@/src/game/verb_menu_transition.ts";
import type { Entity } from "@phughesmcr/miski";

type DialogueMode = Extract<GameMode, { readonly type: "dialogue" }>;
type HelpMode = Extract<GameMode, { readonly type: "help" }>;
type SettingsMode = Extract<GameMode, { readonly type: "settings" }>;
type TitleMode = Extract<GameMode, { readonly type: "title" }>;

export type GameModelOptions = {
  readonly showIntro?: boolean;
  readonly showTitle?: boolean;
};

export type VerbPointerPhase = "move" | "down" | "up" | "cancel";
export type DialoguePointerPhase = VerbPointerPhase;

export type GameModel = {
  readonly startMapName: string;
  readonly showIntro: boolean;
  readonly showTitle: boolean;
  readonly currentMapName: string;
  readonly presentation: PresentationState;
  readonly mode: GameMode;
  readonly viewMode: ViewMode;
  readonly audio: AudioSettings;
  readonly lastVerbIndex: number;
  readonly verbPointerDownTarget?: VerbMenuTarget;
  readonly dialoguePointerDownSlot?: number;
};

export type GameEffect =
  | { readonly type: "render" }
  | { readonly type: "closeDialogue" }
  | { readonly type: "ensureInput" }
  | { readonly type: "applyAudioVolumes" }
  | { readonly type: "loadMap"; readonly mapName: string }
  | { readonly type: "retryMap"; readonly mapName: string }
  | { readonly type: "resetRun"; readonly mapName: string }
  | { readonly type: "runPlayerCommand"; readonly command: PlayerCommand };

export type SettingsPointerPhase = VerbPointerPhase;
export type TitlePointerPhase = VerbPointerPhase;

export type GameTransitionEvent =
  | { readonly type: "start"; readonly nowMs?: number }
  | { readonly type: "mapLoaded"; readonly mapName: string }
  | { readonly type: "loadFailed"; readonly message: string }
  | { readonly type: "gameCommand"; readonly command: GameCommand; readonly nowMs?: number }
  | { readonly type: "verbPointer"; readonly phase: VerbPointerPhase; readonly target?: VerbMenuTarget }
  | { readonly type: "dialoguePointer"; readonly phase: DialoguePointerPhase; readonly optionSlot?: number }
  | {
    readonly type: "titlePointer";
    readonly phase: TitlePointerPhase;
    readonly hoverButton?: TitleHoverButton;
  }
  | {
    readonly type: "settingsPointer";
    readonly phase: SettingsPointerPhase;
    readonly slider?: AudioChannel;
    readonly volume?: number;
  }
  | {
    readonly type: "playerCommandResult";
    readonly result: PlayerCommandResult;
    readonly playerEntity: Entity;
    readonly nowMs?: number;
  };

export type GameTransition = {
  readonly model: GameModel;
  readonly effects: readonly GameEffect[];
};

export function createGameModel(startMapName: string, options: GameModelOptions = {}): GameModel {
  return {
    startMapName,
    showIntro: options.showIntro ?? false,
    showTitle: options.showTitle ?? false,
    currentMapName: startMapName,
    presentation: createPresentationState(),
    mode: { type: "loading" },
    viewMode: "firstPerson",
    audio: DEFAULT_AUDIO_SETTINGS,
    lastVerbIndex: 0,
  };
}

export function transition(model: GameModel, event: GameTransitionEvent): GameTransition {
  switch (event.type) {
    case "start":
      if (model.showTitle) {
        return done({ ...model, mode: { type: "title", intent: "start" } }, [
          { type: "ensureInput" },
          { type: "applyAudioVolumes" },
          { type: "render" },
        ]);
      }
      return beginGame(model, event.nowMs ?? 0);
    case "mapLoaded":
      return mapLoaded(model, event.mapName);
    case "loadFailed":
      return done({ ...model, mode: { type: "error", message: event.message } }, [{ type: "render" }]);
    case "gameCommand":
      return gameCommand(model, event.command, event.nowMs ?? 0);
    case "verbPointer":
      return verbPointer(model, event.phase, event.target);
    case "dialoguePointer":
      return dialoguePointer(model, event.phase, event.optionSlot);
    case "titlePointer":
      return titlePointer(model, event.phase, event.hoverButton);
    case "settingsPointer":
      return settingsPointer(model, event.phase, event.slider, event.volume);
    case "playerCommandResult":
      return playerCommandResult(model, event.result, event.playerEntity, event.nowMs ?? 0);
  }
}

function beginGame(model: GameModel, nowMs: number): GameTransition {
  if (model.showIntro) {
    return done(
      enterIntermission(model, {
        title: INTRO_INTERMISSION.title,
        pages: INTRO_INTERMISSION.pages,
        prompt: INTRO_INTERMISSION.prompt,
        goto: model.startMapName,
        nowMs,
      }),
      [{ type: "ensureInput" }, { type: "applyAudioVolumes" }, { type: "render" }],
    );
  }
  return done({ ...model, mode: { type: "loading" } }, [
    { type: "applyAudioVolumes" },
    { type: "render" },
    { type: "loadMap", mapName: model.startMapName },
  ]);
}

function mapLoaded(model: GameModel, mapName: string): GameTransition {
  return done({
    ...model,
    currentMapName: mapName,
    presentation: createPresentationState(),
    mode: { type: "playing" },
  }, [{ type: "ensureInput" }, { type: "render" }]);
}

function gameCommand(model: GameModel, command: GameCommand, nowMs: number): GameTransition {
  const mode = model.mode;
  if (mode.type === "title") return titleCommand(model, command, nowMs);
  if (mode.type === "settings") return settingsCommand(model, mode, command);
  if (mode.type === "intermission") return intermissionCommand(model, mode, command, nowMs);
  if (mode.type === "dialogue") return dialogueCommand(model, mode, command);
  if (mode.type === "help") return helpCommand(model, mode, command);
  if (mode.type === "verbMenu") return verbMenuCommand(model, mode, command);
  if (mode.type === "victory" || mode.type === "defeat") return outcomeCommand(model, mode.type, command);

  if (isPlayerCommand(command)) {
    if (mode.type !== "playing") return done(model);
    return done(model, [{ type: "runPlayerCommand", command }]);
  }

  switch (command.type) {
    case "action":
      if (model.mode.type !== "playing") return done(model);
      return done(openVerbMenu(model), [{ type: "render" }]);
    case "menu":
      return toggleMenu(model);
    case "settings":
      return done(model);
    case "pause":
      return togglePause(model);
    case "toggleView":
      return toggleView(model);
  }
}

function titleCommand(model: GameModel, command: GameCommand, nowMs: number): GameTransition {
  const mode = model.mode;
  if (mode.type !== "title") return done(model);

  if (command.type === "menu") {
    if (mode.intent === "resume") return closeTitleMenu(model);
    return done(model);
  }
  if (command.type === "settings") {
    return done({
      ...model,
      mode: { type: "settings", returnIntent: mode.intent },
    }, [{ type: "render" }]);
  }
  if (command.type !== "wait") return done(model);
  if (mode.intent === "resume") return closeTitleMenu(model);
  return beginGame(model, nowMs);
}

function titlePointer(
  model: GameModel,
  phase: TitlePointerPhase,
  hoverButton: TitleHoverButton | undefined,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "title") return done(model);

  switch (phase) {
    case "move":
      return hoverTitleButton(model, mode, hoverButton);
    case "down":
    case "up":
    case "cancel":
      return done(model);
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function hoverTitleButton(
  model: GameModel,
  mode: TitleMode,
  hoverButton: TitleHoverButton | undefined,
): GameTransition {
  if (mode.hoverButton === hoverButton) return done(model);
  return done({ ...model, mode: titleMode(mode.intent, hoverButton) }, [{ type: "render" }]);
}

function titleMode(intent: TitleMode["intent"], hoverButton: TitleHoverButton | undefined): TitleMode {
  return hoverButton === undefined ? { type: "title", intent } : { type: "title", intent, hoverButton };
}

function settingsCommand(model: GameModel, mode: SettingsMode, command: GameCommand): GameTransition {
  switch (command.type) {
    case "wait":
    case "action":
    case "menu":
    case "settings":
      return done({
        ...model,
        mode: { type: "title", intent: mode.returnIntent },
      }, [{ type: "render" }]);
    case "move":
    case "turn":
    case "interact":
    case "examine":
    case "attack":
    case "smartAction":
    case "selectWeapon":
    case "pause":
    case "toggleView":
      return done(model);
  }
}

function settingsPointer(
  model: GameModel,
  phase: SettingsPointerPhase,
  slider: AudioChannel | undefined,
  volume: number | undefined,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "settings") return done(model);

  switch (phase) {
    case "down": {
      if (slider === undefined || volume === undefined) return done(model);
      const audio = withAudioVolume(model.audio, slider, volume);
      return done({
        ...model,
        audio,
        mode: { type: "settings", returnIntent: mode.returnIntent, dragging: slider },
      }, [{ type: "applyAudioVolumes" }, { type: "render" }]);
    }
    case "move": {
      const dragging = mode.dragging;
      if (dragging === undefined || volume === undefined) return done(model);
      const audio = withAudioVolume(model.audio, dragging, volume);
      if (audio === model.audio) return done(model);
      return done({ ...model, audio }, [{ type: "applyAudioVolumes" }, { type: "render" }]);
    }
    case "up":
    case "cancel":
      if (mode.dragging === undefined) return done(model);
      return done({
        ...model,
        mode: { type: "settings", returnIntent: mode.returnIntent },
      });
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}

function closeTitleMenu(model: GameModel): GameTransition {
  return done({ ...model, mode: { type: "playing" } }, [{ type: "render" }]);
}

function intermissionCommand(
  model: GameModel,
  mode: IntermissionMode,
  command: GameCommand,
  nowMs: number,
): GameTransition {
  if (command.type !== "wait") return done(model);
  if (!isMessageRevealed(mode, nowMs)) {
    return done({ ...model, mode: { ...mode, revealed: true } }, [{ type: "render" }]);
  }
  if (hasNextIntermissionPage(mode)) {
    return done({
      ...model,
      mode: {
        ...mode,
        pageIndex: mode.pageIndex + 1,
        revealStartedAtMs: nowMs,
        revealed: false,
      },
    }, [{ type: "render" }]);
  }
  return done(
    { ...model, mode: { type: "loading" } },
    [{ type: "render" }, { type: "loadMap", mapName: mode.goto }],
  );
}

function dialogueCommand(model: GameModel, mode: DialogueMode, command: GameCommand): GameTransition {
  if (command.type === "wait") return selectDialogueChoice(model, mode, 1);
  if (command.type === "selectWeapon") return selectDialogueChoice(model, mode, command.slot);
  return done(model);
}

function helpCommand(model: GameModel, mode: HelpMode, command: GameCommand): GameTransition {
  switch (command.type) {
    case "wait":
    case "action":
    case "menu":
      return done({
        ...model,
        mode: { type: "verbMenu", selectedIndex: mode.selectedIndex },
      }, [{ type: "render" }]);
    case "move":
    case "turn":
    case "interact":
    case "examine":
    case "attack":
    case "smartAction":
    case "selectWeapon":
    case "pause":
    case "toggleView":
    case "settings":
      return done(model);
  }
}

function selectDialogueChoice(model: GameModel, mode: DialogueMode, slot: number): GameTransition {
  const choice = mode.choices[slot - 1];
  if (choice === undefined) return done(model);
  if (choice.next === undefined || mode.treeKey === undefined) return closeDialogue(model);

  const node = dialogueTreeNode(mode.treeKey, choice.next);
  return done({
    ...model,
    dialoguePointerDownSlot: undefined,
    mode: {
      type: "dialogue",
      title: mode.title,
      speaker: mode.speaker,
      treeKey: mode.treeKey,
      message: node.text,
      choices: node.choices,
    },
  }, [{ type: "render" }]);
}

function outcomeCommand(
  model: GameModel,
  outcome: "victory" | "defeat",
  command: GameCommand,
): GameTransition {
  if (command.type !== "wait") return done(model);

  const resetModel = {
    ...model,
    presentation: createPresentationState(),
    mode: { type: "loading" },
  } satisfies GameModel;
  if (outcome === "victory") {
    return done(resetModel, [{ type: "render" }, { type: "resetRun", mapName: model.startMapName }]);
  }

  return done(resetModel, [{ type: "render" }, { type: "retryMap", mapName: model.currentMapName }]);
}

function dialoguePointer(
  model: GameModel,
  phase: DialoguePointerPhase,
  optionSlot: number | undefined,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "dialogue") return done(model);

  switch (phase) {
    case "down":
      return done({ ...model, dialoguePointerDownSlot: optionSlot });
    case "up": {
      const downSlot = model.dialoguePointerDownSlot;
      const upModel = { ...model, dialoguePointerDownSlot: undefined };
      if (optionSlot !== undefined && downSlot === optionSlot) return selectDialogueChoice(upModel, mode, optionSlot);
      return done(upModel);
    }
    case "cancel":
      return done({ ...model, dialoguePointerDownSlot: undefined });
    case "move":
      return done(model);
  }
}

function playerCommandResult(
  model: GameModel,
  result: PlayerCommandResult,
  playerEntity: Entity,
  nowMs: number,
): GameTransition {
  const modelWithPresentation = applyPresentation(model, playerEntity, result, nowMs);
  switch (result.type) {
    case "continue":
      return done(modelWithPresentation, [{ type: "render" }]);
    case "outcome":
      return done({ ...modelWithPresentation, mode: { type: result.outcome } }, [{ type: "render" }]);
    case "mapChange":
      return done(
        enterIntermission(modelWithPresentation, {
          pages: [`Entering ${result.mapChange.goto}.`],
          prompt: CONTINUE_INTERMISSION_PROMPT,
          goto: result.mapChange.goto,
          nowMs,
        }),
        [{ type: "render" }],
      );
    case "dialogue":
      return done({
        ...modelWithPresentation,
        dialoguePointerDownSlot: undefined,
        mode: { type: "dialogue", ...result.dialogue },
      }, [{ type: "render" }]);
  }
}

function toggleMenu(model: GameModel): GameTransition {
  if (model.mode.type === "playing") {
    return done({ ...model, mode: { type: "title", intent: "resume" } }, [{ type: "render" }]);
  }
  return done(model, [{ type: "render" }]);
}

function toggleView(model: GameModel): GameTransition {
  const viewMode: ViewMode = model.viewMode === "firstPerson" ? "topDown" : "firstPerson";
  return done({ ...model, viewMode }, [{ type: "render" }]);
}

function togglePause(model: GameModel): GameTransition {
  switch (model.mode.type) {
    case "playing":
      return done({ ...model, mode: { type: "paused" } }, [{ type: "render" }]);
    case "paused":
      return done({ ...model, mode: { type: "playing" } }, [{ type: "render" }]);
    default:
      return done(model, [{ type: "render" }]);
  }
}

function closeDialogue(model: GameModel): GameTransition {
  return done({
    ...model,
    dialoguePointerDownSlot: undefined,
    mode: { type: "playing" },
  }, [{ type: "closeDialogue" }, { type: "render" }]);
}

function applyPresentation(
  model: GameModel,
  playerEntity: Entity,
  result: PlayerCommandResult,
  nowMs: number,
): GameModel {
  return {
    ...model,
    presentation: consumeGameEvents(model.presentation, {
      playerEntity,
      events: result.events,
      nowMs,
    }),
  };
}

function enterIntermission(
  model: GameModel,
  input: {
    readonly title?: string;
    readonly pages: readonly string[];
    readonly prompt: string;
    readonly goto: string;
    readonly nowMs: number;
  },
): GameModel {
  return {
    ...model,
    mode: {
      type: "intermission",
      ...(input.title === undefined ? {} : { title: input.title }),
      pages: input.pages,
      pageIndex: 0,
      prompt: input.prompt,
      goto: input.goto,
      revealStartedAtMs: input.nowMs,
      revealed: false,
    },
  };
}

function done(model: GameModel, effects: readonly GameEffect[] = []): GameTransition {
  return { model, effects };
}
