import { TrackId } from "@/src/game/content/audio/music.ts";
import { CONTINUE_INTERMISSION_PROMPT } from "@/src/game/content/intro.ts";
import { VICTORY_FADE_MS, VICTORY_HOLD_MS, VICTORY_INTERMISSION } from "@/src/game/content/victory.ts";
import { type GameCommand, isPlayerCommand, type PlayerCommandResult } from "@/src/game/model/commands.ts";
import { formatLevelStats } from "@/src/game/model/level_stats.ts";
import { consumeGameEvents, createPresentationState } from "@/src/game/model/presentation_state.ts";
import type { GameModel, GameTransition } from "@/src/game/model/transition/contracts.ts";
import { dialogueRenderEffects } from "@/src/game/model/transition/dialogue.ts";
import { enterIntermission } from "@/src/game/model/transition/intermission.ts";
import { dispatchCommand, done } from "@/src/game/model/transition/result.ts";
import { openVerbMenu } from "@/src/game/model/transition/verb_menu.ts";
import { toggleView } from "@/src/game/model/transition/view.ts";
import type { Entity } from "turn-based-engine/ecs";

export function playingCommand(model: GameModel, command: GameCommand, _nowMs: number): GameTransition {
  if (isPlayerCommand(command)) return done(model, [{ type: "runPlayerCommand", command }]);
  return dispatchCommand(model, command, {
    action: () => done(openVerbMenu(model), [{ type: "render" }]),
    menu: () => toggleMenu(model),
    pause: () => togglePause(model),
    toggleView: () => toggleView(model),
  });
}

export function overlayCommand(model: GameModel, command: GameCommand, _nowMs: number): GameTransition {
  return dispatchCommand(model, command, {
    menu: () => toggleMenu(model),
    pause: () => togglePause(model),
    toggleView: () => toggleView(model),
  });
}

export function defeatCommand(model: GameModel, command: GameCommand): GameTransition {
  if (command.type !== "wait") return done(model);

  const resetModel = {
    ...model,
    presentation: createPresentationState(),
    mode: { type: "loading", loaded: 0, total: 0 },
  } satisfies GameModel;
  return done(resetModel, [{ type: "render" }, { type: "retryMap", mapName: model.currentMapName }]);
}

export function playerCommandResult(
  model: GameModel,
  result: PlayerCommandResult,
  playerEntity: Entity,
  nowMs: number,
): GameTransition {
  const modelWithPresentation = applyPresentation(model, playerEntity, result, nowMs);
  switch (result.type) {
    case "continue":
      return done(modelWithPresentation, [{ type: "render" }]);
    case "outcome": {
      if (result.outcome === "defeat") {
        return done({ ...modelWithPresentation, mode: { type: "defeat" } }, [{ type: "render" }]);
      }
      return done(
        {
          ...modelWithPresentation,
          mode: {
            type: "victoryTransition",
            fadeStartsAtMs: nowMs + VICTORY_HOLD_MS,
            completesAtMs: nowMs + VICTORY_HOLD_MS + VICTORY_FADE_MS,
            levelStats: result.levelStats,
          },
        },
        [
          { type: "stopSounds" },
          { type: "playMusic", trackId: TrackId.Title },
          { type: "scheduleVictory", delayMs: VICTORY_HOLD_MS + VICTORY_FADE_MS },
          { type: "render" },
        ],
      );
    }
    case "mapChange":
      return done(
        enterIntermission(modelWithPresentation, {
          pages: [formatLevelStats(result.levelStats), `Entering ${result.mapChange.goto}.`],
          prompt: CONTINUE_INTERMISSION_PROMPT,
          background: "system",
          completion: { type: "loadMap", mapName: result.mapChange.goto },
          nowMs,
        }),
        [{ type: "render" }],
      );
    case "dialogue":
      return done({
        ...modelWithPresentation,
        mode: { type: "dialogue", ...result.dialogue },
      }, dialogueRenderEffects(undefined, result.dialogue.voice));
    default: {
      const _exhaustive: never = result;
      return _exhaustive;
    }
  }
}

export function completeVictoryTransition(model: GameModel, nowMs: number): GameTransition {
  if (model.mode.type !== "victoryTransition") return done(model);
  return done(
    enterIntermission(model, {
      title: VICTORY_INTERMISSION.title,
      pages: [...VICTORY_INTERMISSION.pages, formatLevelStats(model.mode.levelStats)],
      prompt: VICTORY_INTERMISSION.prompt,
      background: "victory",
      completion: { type: "returnToTitle" },
      nowMs,
    }),
    [{ type: "render" }],
  );
}

function toggleMenu(model: GameModel): GameTransition {
  if (model.mode.type === "playing") {
    return done({ ...model, mode: { type: "title", intent: "resume" } }, [{ type: "render" }]);
  }
  return done(model, [{ type: "render" }]);
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
