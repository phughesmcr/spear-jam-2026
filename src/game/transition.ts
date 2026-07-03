import type { Entity } from "@phughesmcr/miski";
import { combatFeedbackForEvents } from "@/src/game/combat_feedback.ts";
import type { CombatFeedback } from "@/src/game/combat_feedback.ts";
import { isPlayerCommand } from "@/src/game/commands.ts";
import type { GameCommand, PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import { messageForEvent } from "@/src/game/messages.ts";
import { createPlayerState } from "@/src/game/state.ts";
import type { GameMode, PlayerState, ViewMode } from "@/src/game/state.ts";
import { VERBS, verbToCommand } from "@/src/game/verbs.ts";

const MESSAGE_LOG_LIMIT = 5;

type IntermissionMode = Extract<GameMode, { readonly type: "intermission" }>;
type DialogueMode = Extract<GameMode, { readonly type: "dialogue" }>;
type VerbMenuMode = Extract<GameMode, { readonly type: "verbMenu" }>;

export type VerbPointerPhase = "move" | "down" | "up" | "cancel";

export type GameModel = {
  readonly startMapName: string;
  readonly currentMapName: string;
  readonly currentLevelEntryState?: PlayerState;
  readonly recentMessages: readonly string[];
  readonly combatFeedback: readonly CombatFeedback[];
  readonly mode: GameMode;
  readonly viewMode: ViewMode;
  readonly lastVerbIndex: number;
  readonly verbPointerDownIndex?: number;
};

export type GameEffect =
  | { readonly type: "render" }
  | { readonly type: "ensureInput" }
  | { readonly type: "loadMap"; readonly mapName: string; readonly playerState?: PlayerState }
  | { readonly type: "runPlayerCommand"; readonly command: PlayerCommand };

export type GameTransitionEvent =
  | { readonly type: "start" }
  | { readonly type: "mapLoaded"; readonly mapName: string; readonly playerState?: PlayerState }
  | { readonly type: "loadFailed"; readonly message: string }
  | { readonly type: "gameCommand"; readonly command: GameCommand }
  | { readonly type: "verbPointer"; readonly phase: VerbPointerPhase; readonly hotspotIndex?: number }
  | {
    readonly type: "playerCommandResult";
    readonly result: PlayerCommandResult;
    readonly playerEntity: Entity;
    readonly playerState: PlayerState;
  };

export type GameTransition = {
  readonly model: GameModel;
  readonly effects: readonly GameEffect[];
};

export function createGameModel(startMapName: string): GameModel {
  return {
    startMapName,
    currentMapName: startMapName,
    recentMessages: [],
    combatFeedback: [],
    mode: { type: "loading" },
    viewMode: "firstPerson",
    lastVerbIndex: 0,
  };
}

export function transition(model: GameModel, event: GameTransitionEvent): GameTransition {
  switch (event.type) {
    case "start":
      return done(model, [
        { type: "render" },
        { type: "loadMap", mapName: model.startMapName },
      ]);
    case "mapLoaded":
      return mapLoaded(model, event.mapName, event.playerState);
    case "loadFailed":
      return done({ ...model, mode: { type: "error", message: event.message } }, [{ type: "render" }]);
    case "gameCommand":
      return gameCommand(model, event.command);
    case "verbPointer":
      return verbPointer(model, event.phase, event.hotspotIndex);
    case "playerCommandResult":
      return playerCommandResult(model, event.result, event.playerEntity, event.playerState);
  }
}

function mapLoaded(model: GameModel, mapName: string, playerState?: PlayerState): GameTransition {
  return done({
    ...model,
    currentMapName: mapName,
    currentLevelEntryState: playerState === undefined ? undefined : createPlayerState(playerState),
    mode: { type: "playing" },
  }, [{ type: "ensureInput" }, { type: "render" }]);
}

function gameCommand(model: GameModel, command: GameCommand): GameTransition {
  const mode = model.mode;
  if (mode.type === "intermission") return intermissionCommand(model, mode, command);
  if (mode.type === "dialogue") return dialogueCommand(model, mode, command);
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
    case "pause":
      return togglePause(model);
    case "toggleView":
      return toggleView(model);
  }
}

function intermissionCommand(model: GameModel, mode: IntermissionMode, command: GameCommand): GameTransition {
  if (command.type !== "wait") return done(model);
  const playerState = createPlayerState(mode.playerState);
  return done(
    { ...model, mode: { type: "loading" } },
    [{ type: "render" }, { type: "loadMap", mapName: mode.goto, playerState }],
  );
}

function dialogueCommand(model: GameModel, _mode: DialogueMode, command: GameCommand): GameTransition {
  if (command.type !== "wait") return done(model);
  return done({ ...model, mode: { type: "playing" } }, [{ type: "render" }]);
}

function outcomeCommand(
  model: GameModel,
  outcome: "victory" | "defeat",
  command: GameCommand,
): GameTransition {
  if (command.type !== "wait") return done(model);

  const resetModel = {
    ...model,
    recentMessages: [],
    combatFeedback: [],
    mode: { type: "loading" },
  } satisfies GameModel;
  if (outcome === "victory") {
    return done(resetModel, [{ type: "render" }, { type: "loadMap", mapName: model.startMapName }]);
  }

  const playerState = model.currentLevelEntryState === undefined ?
    undefined :
    createPlayerState(model.currentLevelEntryState);
  return done(resetModel, [{ type: "render" }, { type: "loadMap", mapName: model.currentMapName, playerState }]);
}

function verbMenuCommand(model: GameModel, mode: VerbMenuMode, command: GameCommand): GameTransition {
  switch (command.type) {
    case "move":
      if (command.direction === "forward") {
        return done(selectVerb(model, (mode.selectedIndex - 1 + VERBS.length) % VERBS.length), [{ type: "render" }]);
      }
      if (command.direction === "backward") {
        return done(selectVerb(model, (mode.selectedIndex + 1) % VERBS.length), [{ type: "render" }]);
      }
      return done(model);
    case "wait":
    case "action":
      return confirmVerbSelection(model, mode);
    case "menu":
      return done({ ...model, verbPointerDownIndex: undefined, mode: { type: "playing" } }, [{ type: "render" }]);
    case "turn":
    case "interact":
    case "examine":
    case "attack":
    case "selectWeapon":
    case "pause":
    case "toggleView":
      return done(model);
  }
}

function verbPointer(
  model: GameModel,
  phase: VerbPointerPhase,
  hotspotIndex: number | undefined,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "verbMenu") return done(model);

  switch (phase) {
    case "move":
      if (hotspotIndex !== undefined && hotspotIndex !== mode.selectedIndex) {
        return done(selectVerb(model, hotspotIndex), [{ type: "render" }]);
      }
      return done(model);
    case "down": {
      const downModel = { ...model, verbPointerDownIndex: hotspotIndex };
      if (hotspotIndex !== undefined && hotspotIndex !== mode.selectedIndex) {
        return done(selectVerb(downModel, hotspotIndex), [{ type: "render" }]);
      }
      return done(downModel);
    }
    case "up": {
      const downIndex = model.verbPointerDownIndex;
      const upModel = { ...model, verbPointerDownIndex: undefined };
      if (hotspotIndex === undefined) return done(upModel);

      const selectedMode = { type: "verbMenu", selectedIndex: hotspotIndex } satisfies VerbMenuMode;
      const selectedModel = { ...upModel, mode: selectedMode };
      if (downIndex === hotspotIndex) return confirmVerbSelection(selectedModel, selectedMode);
      return done(selectedModel, [{ type: "render" }]);
    }
    case "cancel":
      return done({ ...model, verbPointerDownIndex: undefined });
  }
}

function playerCommandResult(
  model: GameModel,
  result: PlayerCommandResult,
  playerEntity: Entity,
  playerState: PlayerState,
): GameTransition {
  const modelWithMessages = appendEventMessages(model, playerEntity, result);
  if (result.outcome) {
    return done({ ...modelWithMessages, mode: { type: result.outcome } }, [{ type: "render" }]);
  }
  if (result.mapChange) {
    return done(enterIntermission(modelWithMessages, result.mapChange.goto, playerState), [{ type: "render" }]);
  }
  if (result.dialogue) {
    return done({ ...modelWithMessages, mode: { type: "dialogue", ...result.dialogue } }, [{ type: "render" }]);
  }

  return done(modelWithMessages, [{ type: "render" }]);
}

function toggleMenu(model: GameModel): GameTransition {
  switch (model.mode.type) {
    case "playing":
      return done({ ...model, mode: { type: "menu" } }, [{ type: "render" }]);
    case "menu":
      return done({ ...model, mode: { type: "playing" } }, [{ type: "render" }]);
    default:
      return done(model, [{ type: "render" }]);
  }
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

function openVerbMenu(model: GameModel): GameModel {
  return {
    ...model,
    verbPointerDownIndex: undefined,
    mode: { type: "verbMenu", selectedIndex: model.lastVerbIndex },
  };
}

function selectVerb(model: GameModel, selectedIndex: number): GameModel {
  const mode = model.mode;
  if (mode.type === "verbMenu" && selectedIndex === mode.selectedIndex) return model;
  return { ...model, mode: { type: "verbMenu", selectedIndex } };
}

function confirmVerbSelection(model: GameModel, mode: VerbMenuMode): GameTransition {
  const selectedIndex = mode.selectedIndex;
  return done({
    ...model,
    verbPointerDownIndex: undefined,
    lastVerbIndex: selectedIndex,
    mode: { type: "playing" },
  }, [{ type: "runPlayerCommand", command: verbToCommand(selectedIndex) }]);
}

function appendEventMessages(
  model: GameModel,
  playerEntity: Entity,
  result: PlayerCommandResult,
): GameModel {
  const recentMessages = [
    ...model.recentMessages,
    ...result.events.map((event) => messageForEvent(playerEntity, event)),
  ];
  return {
    ...model,
    recentMessages: recentMessages.slice(Math.max(0, recentMessages.length - MESSAGE_LOG_LIMIT)),
    combatFeedback: combatFeedbackForEvents(playerEntity, result.events),
  };
}

function enterIntermission(model: GameModel, goto: string, playerState: PlayerState): GameModel {
  return {
    ...model,
    mode: {
      type: "intermission",
      message: `Entering ${goto}. Space to continue.`,
      goto,
      playerState: createPlayerState(playerState),
    },
  };
}

function done(model: GameModel, effects: readonly GameEffect[] = []): GameTransition {
  return { model, effects };
}
