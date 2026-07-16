import type { GameCommand } from "@/src/game/model/commands.ts";
import type { DialogueContent } from "@/src/game/content/catalog.ts";
import type { GameMode } from "@/src/game/model/state.ts";
import type { GameModel, GameTransition, GameTransitionEvent } from "@/src/game/model/transition/contracts.ts";
import { dialogueCommand, dialoguePointer } from "@/src/game/model/transition/dialogue.ts";
import {
  completeVictoryTransition,
  defeatCommand,
  overlayCommand,
  playerCommandResult,
  playingCommand,
} from "@/src/game/model/transition/gameplay.ts";
import { intermissionCommand } from "@/src/game/model/transition/intermission.ts";
import { loadingProgress, mapLoaded, startGame } from "@/src/game/model/transition/lifecycle.ts";
import {
  helpCommand,
  settingsCommand,
  settingsPointer,
  titleCommand,
  titlePointer,
} from "@/src/game/model/transition/menu.ts";
import { done } from "@/src/game/model/transition/result.ts";
import { verbMenuCommand, verbPointer } from "@/src/game/model/transition/verb_menu.ts";

type ModeCommandHandler = (model: GameModel, command: GameCommand, nowMs: number) => GameTransition;

function modeCommands(content: DialogueContent): { readonly [K in GameMode["type"]]: ModeCommandHandler } {
  return {
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
      return mode.type === "dialogue" ? dialogueCommand(content, model, mode, command) : done(model);
    },
    help: (model, command) => {
      const mode = model.mode;
      return mode.type === "help" ? helpCommand(model, mode, command) : done(model);
    },
    verbMenu: (model, command) => {
      const mode = model.mode;
      return mode.type === "verbMenu" ? verbMenuCommand(model, mode, command) : done(model);
    },
    defeat: defeatCommand,
    victoryTransition: (_model, _command) => done(_model),
    playing: playingCommand,
    paused: overlayCommand,
    loading: overlayCommand,
    error: overlayCommand,
  };
}

export type {
  GameEffect,
  GameModel,
  GameModelOptions,
  GameTransition,
  GameTransitionEvent,
} from "@/src/game/model/transition/contracts.ts";
import { createGameModel } from "@/src/game/model/transition/lifecycle.ts";
export { createGameModel };

export function createGameTransition(content: DialogueContent) {
  const commands = modeCommands(content);

  function transition(model: GameModel, event: GameTransitionEvent): GameTransition {
    switch (event.type) {
      case "start":
        return startGame(model, event.nowMs ?? 0);
      case "mapLoaded":
        return mapLoaded(model, event.mapName);
      case "loadingProgress":
        return loadingProgress(model, event.completed, event.total);
      case "loadFailed":
        return done({ ...model, mode: { type: "error", message: event.message } }, [{ type: "render" }]);
      case "victoryTransitionComplete":
        return completeVictoryTransition(model, event.nowMs ?? 0);
      case "gameCommand":
        return gameCommand(commands, model, event.command, event.nowMs ?? 0);
      case "verbPointer":
        return verbPointer(model, event.phase, event.target, event.tap === true);
      case "dialoguePointer":
        return dialoguePointer(content, model, event.phase, event.optionSlot);
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

  return transition;
}

function gameCommand(
  commands: { readonly [K in GameMode["type"]]: ModeCommandHandler },
  model: GameModel,
  command: GameCommand,
  nowMs: number,
): GameTransition {
  const handler = commands[model.mode.type];
  return handler(model, command, nowMs);
}
