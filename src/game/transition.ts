import { dialogueTreeNode } from "@/src/dialogue/dialogue.ts";
import { type AudioSettings, DEFAULT_AUDIO_SETTINGS, withAudioVolume } from "@/src/game/audio_settings.ts";
import {
  type GameCommand,
  isPlayerCommand,
  type PlayerCommand,
  type PlayerCommandResult,
} from "@/src/game/commands.ts";
import { hasNextIntermissionPage, type IntermissionMode, isMessageRevealed } from "@/src/game/intermission.ts";
import { CONTINUE_INTERMISSION_PROMPT, INTRO_INTERMISSION } from "@/src/game/intro.ts";
import { dispatchCommand, done, pointerGesture } from "@/src/game/mode_handlers.ts";
import { consumeGameEvents, createPresentationState, type PresentationState } from "@/src/game/presentation.ts";
import {
  clampInteractiveFps,
  DEFAULT_INTERACTIVE_FPS,
  interactiveFpsFromUnit,
  type SettingsSliderId,
} from "@/src/game/render_settings.ts";
import type { GameMode, TitleHoverButton, VerbMenuTarget, ViewMode } from "@/src/game/state.ts";
import { openVerbMenu, verbMenuCommand, verbPointer } from "@/src/game/verb_menu_transition.ts";
import type { PointerPhase } from "@/src/input/pointer.ts";
import type { Entity } from "@phughesmcr/miski";

type DialogueMode = Extract<GameMode, { readonly type: "dialogue" }>;
type HelpMode = Extract<GameMode, { readonly type: "help" }>;
type SettingsMode = Extract<GameMode, { readonly type: "settings" }>;
type TitleMode = Extract<GameMode, { readonly type: "title" }>;
type ModeCommandHandler = (model: GameModel, command: GameCommand, nowMs: number) => GameTransition;

export type GameModelOptions = {
  readonly showIntro?: boolean;
  readonly showTitle?: boolean;
};

export type GameModel = {
  readonly startMapName: string;
  readonly showIntro: boolean;
  readonly showTitle: boolean;
  readonly currentMapName: string;
  readonly presentation: PresentationState;
  readonly mode: GameMode;
  readonly viewMode: ViewMode;
  readonly audio: AudioSettings;
  readonly interactiveFps: number;
  readonly lastVerbIndex: number;
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

export type GameTransitionEvent =
  | { readonly type: "start"; readonly nowMs?: number }
  | { readonly type: "mapLoaded"; readonly mapName: string }
  | { readonly type: "loadFailed"; readonly message: string }
  | { readonly type: "gameCommand"; readonly command: GameCommand; readonly nowMs?: number }
  | { readonly type: "verbPointer"; readonly phase: PointerPhase; readonly target?: VerbMenuTarget }
  | { readonly type: "dialoguePointer"; readonly phase: PointerPhase; readonly optionSlot?: number }
  | {
    readonly type: "titlePointer";
    readonly phase: PointerPhase;
    readonly hoverButton?: TitleHoverButton;
  }
  | {
    readonly type: "settingsPointer";
    readonly phase: PointerPhase;
    readonly slider?: SettingsSliderId;
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

/** Per-mode command policy. Modes omitted here ignore commands via {@link done}. */
const MODE_COMMANDS: { readonly [K in GameMode["type"]]?: ModeCommandHandler } = {
  title: titleCommand,
  settings: (model, command) => {
    const mode = model.mode;
    return mode.type === "settings" ? settingsCommand(model, mode, command) : done(model);
  },
  intermission: (model, command, nowMs) => {
    const mode = model.mode;
    return mode.type === "intermission" ? intermissionCommand(model, mode, command, nowMs) : done(model);
  },
  dialogue: (model, command) => {
    const mode = model.mode;
    return mode.type === "dialogue" ? dialogueCommand(model, mode, command) : done(model);
  },
  help: (model, command) => {
    const mode = model.mode;
    return mode.type === "help" ? helpCommand(model, mode, command) : done(model);
  },
  verbMenu: (model, command) => {
    const mode = model.mode;
    return mode.type === "verbMenu" ? verbMenuCommand(model, mode, command) : done(model);
  },
  victory: (model, command) => outcomeCommand(model, "victory", command),
  defeat: (model, command) => outcomeCommand(model, "defeat", command),
  playing: playingCommand,
  paused: overlayCommand,
  loading: overlayCommand,
  error: overlayCommand,
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
    interactiveFps: DEFAULT_INTERACTIVE_FPS,
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
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
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
  const handler = MODE_COMMANDS[model.mode.type];
  return handler === undefined ? done(model) : handler(model, command, nowMs);
}

function playingCommand(model: GameModel, command: GameCommand, _nowMs: number): GameTransition {
  if (isPlayerCommand(command)) return done(model, [{ type: "runPlayerCommand", command }]);
  return dispatchCommand(model, command, {
    action: () => done(openVerbMenu(model), [{ type: "render" }]),
    menu: () => toggleMenu(model),
    pause: () => togglePause(model),
    toggleView: () => toggleView(model),
  });
}

function overlayCommand(model: GameModel, command: GameCommand, _nowMs: number): GameTransition {
  return dispatchCommand(model, command, {
    menu: () => toggleMenu(model),
    pause: () => togglePause(model),
    toggleView: () => toggleView(model),
  });
}

function titleCommand(model: GameModel, command: GameCommand, nowMs: number): GameTransition {
  const mode = model.mode;
  if (mode.type !== "title") return done(model);

  return dispatchCommand(model, command, {
    menu: () => mode.intent === "resume" ? closeTitleMenu(model) : done(model),
    settings: () =>
      done({
        ...model,
        mode: { type: "settings", returnIntent: mode.intent },
      }, [{ type: "render" }]),
    help: () =>
      done({
        ...model,
        mode: { type: "help", returnTo: { kind: "title", intent: mode.intent } },
      }, [{ type: "render" }]),
    wait: () => mode.intent === "resume" ? closeTitleMenu(model) : beginGame(model, nowMs),
  });
}

function titlePointer(
  model: GameModel,
  phase: PointerPhase,
  hoverButton: TitleHoverButton | undefined,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "title") return done(model);

  return pointerGesture(model, phase, {
    move: () => hoverTitleButton(model, mode, hoverButton),
    down: () => done(model),
    up: () => done(model),
    cancel: () => done(model),
  });
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
  const close = (): GameTransition =>
    done({
      ...model,
      mode: { type: "title", intent: mode.returnIntent },
    }, [{ type: "render" }]);
  return dispatchCommand(model, command, {
    wait: close,
    action: close,
    menu: close,
    settings: close,
  });
}

function settingsPointer(
  model: GameModel,
  phase: PointerPhase,
  slider: SettingsSliderId | undefined,
  volume: number | undefined,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "settings") return done(model);

  return pointerGesture(model, phase, {
    down: () => {
      if (slider === undefined || volume === undefined) return done(model);
      return applySettingsSlider(model, mode, slider, volume, true);
    },
    move: () => {
      const dragging = mode.dragging;
      if (dragging === undefined || volume === undefined) return done(model);
      return applySettingsSlider(model, mode, dragging, volume, false);
    },
    up: () => {
      if (mode.dragging === undefined) return done(model);
      return done({
        ...model,
        mode: { type: "settings", returnIntent: mode.returnIntent },
      });
    },
    cancel: () => {
      if (mode.dragging === undefined) return done(model);
      return done({
        ...model,
        mode: { type: "settings", returnIntent: mode.returnIntent },
      });
    },
  });
}

function applySettingsSlider(
  model: GameModel,
  mode: SettingsMode,
  slider: SettingsSliderId,
  unit: number,
  startDrag: boolean,
): GameTransition {
  switch (slider) {
    case "music":
    case "sound": {
      const audio = withAudioVolume(model.audio, slider, unit);
      if (!startDrag && audio === model.audio) return done(model);
      return done({
        ...model,
        audio,
        mode: startDrag ? { type: "settings", returnIntent: mode.returnIntent, dragging: slider } : model.mode,
      }, [{ type: "applyAudioVolumes" }, { type: "render" }]);
    }
    case "fps": {
      const interactiveFps = interactiveFpsFromUnit(unit);
      if (!startDrag && interactiveFps === model.interactiveFps) return done(model);
      return done({
        ...model,
        interactiveFps: clampInteractiveFps(interactiveFps),
        mode: startDrag ? { type: "settings", returnIntent: mode.returnIntent, dragging: "fps" } : model.mode,
      }, [{ type: "render" }]);
    }
    default: {
      const _exhaustive: never = slider;
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
  return dispatchCommand(model, command, {
    wait: () => selectDialogueChoice(model, mode, 1),
    selectWeapon: (select) => selectDialogueChoice(model, mode, select.slot),
  });
}

function helpCommand(model: GameModel, mode: HelpMode, command: GameCommand): GameTransition {
  const close = (): GameTransition => {
    switch (mode.returnTo.kind) {
      case "verbMenu":
        return done({
          ...model,
          mode: { type: "verbMenu", selectedIndex: mode.returnTo.selectedIndex },
        }, [{ type: "render" }]);
      case "title":
        return done({
          ...model,
          mode: { type: "title", intent: mode.returnTo.intent },
        }, [{ type: "render" }]);
      default: {
        const _exhaustive: never = mode.returnTo;
        return _exhaustive;
      }
    }
  };
  return dispatchCommand(model, command, {
    wait: close,
    action: close,
    menu: close,
  });
}

function selectDialogueChoice(model: GameModel, mode: DialogueMode, slot: number): GameTransition {
  const choice = mode.choices[slot - 1];
  if (choice === undefined) return done(model);
  if (choice.next === undefined || mode.treeKey === undefined) return closeDialogue(model);

  const node = dialogueTreeNode(mode.treeKey, choice.next);
  return done({
    ...model,
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
  phase: PointerPhase,
  optionSlot: number | undefined,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "dialogue") return done(model);

  return pointerGesture(model, phase, {
    down: () => {
      const downMode = optionSlot === undefined ?
        withoutDialoguePointerDown(mode) :
        { ...mode, pointerDownSlot: optionSlot };
      return done({ ...model, mode: downMode });
    },
    up: () => {
      const downSlot = mode.pointerDownSlot;
      const upMode = withoutDialoguePointerDown(mode);
      const upModel = { ...model, mode: upMode };
      if (optionSlot !== undefined && downSlot === optionSlot) {
        return selectDialogueChoice(upModel, upMode, optionSlot);
      }
      return done(upModel);
    },
    cancel: () => done({ ...model, mode: withoutDialoguePointerDown(mode) }),
  });
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
        mode: { type: "dialogue", ...result.dialogue },
      }, [{ type: "render" }]);
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
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
  return done({ ...model, mode: { type: "playing" } }, [{ type: "closeDialogue" }, { type: "render" }]);
}

function withoutDialoguePointerDown(mode: DialogueMode): DialogueMode {
  if (mode.pointerDownSlot === undefined) return mode;
  const { pointerDownSlot: _, ...rest } = mode;
  return rest;
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
