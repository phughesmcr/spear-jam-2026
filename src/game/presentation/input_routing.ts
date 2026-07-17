import type { GameCommand } from "@/src/game/model/commands.ts";
import type { PointerInput } from "turn-based-web-engine/input";
import type { GameMode } from "@/src/game/model/state.ts";
import type { GameModel, GameTransitionEvent } from "@/src/game/model/transition/mod.ts";
import type { GameCanvasSize } from "@/src/game/presentation/canvas_size.ts";
import { dialogueOptionSlotAt } from "@/src/game/presentation/ui/dialogue.ts";
import { settingsBackButtonHit, settingsSliderAt, settingsSliderUnit } from "@/src/game/presentation/ui/settings.ts";
import {
  titleHelpButtonHit,
  titleHoverButtonAt,
  titleSettingsButtonHit,
  titleStartButtonHit,
} from "@/src/game/presentation/ui/title.ts";
import { verbMenuTargetAt } from "@/src/game/presentation/ui/verb_menu.ts";

export type PointerTransitionEvent = Extract<
  GameTransitionEvent,
  { readonly type: "dialoguePointer" | "verbPointer" | "settingsPointer" | "titlePointer" }
>;

export type PointerInputRoute =
  | { readonly type: "none" }
  | { readonly type: "command"; readonly command: GameCommand }
  | { readonly type: "transition"; readonly event: PointerTransitionEvent };

type PointerRouter = (
  model: GameModel,
  canvasSize: GameCanvasSize,
  input: PointerInput,
) => PointerInputRoute;

/** Per-mode pointer routing. Modes omitted here fall through to the verb menu. */
const MODE_POINTERS: { readonly [K in GameMode["type"]]?: PointerRouter } = {
  title: (_model, canvasSize, input) => titlePointer(canvasSize, input),
  settings: settingsPointer,
  intermission: (_model, _canvasSize, input) => waitOnPointerUp(input),
  defeat: (_model, _canvasSize, input) => waitOnPointerUp(input),
  dialogue: (model, canvasSize, input) => {
    const mode = model.mode;
    if (mode.type !== "dialogue") return { type: "none" };
    return {
      type: "transition",
      event: {
        type: "dialoguePointer",
        phase: input.phase,
        optionSlot: dialogueOptionSlotAt(canvasSize, mode.choices, input, mode.art),
      },
    };
  },
  help: (_model, _canvasSize, input) => waitOnPointerUp(input),
  playing: (model, canvasSize, input) => {
    if (model.viewMode === "topDown") {
      return input.phase === "up" ? { type: "command", command: { type: "toggleView" } } : { type: "none" };
    }
    return verbMenuPointer(canvasSize, input);
  },
  verbMenu: (_model, canvasSize, input) => verbMenuPointer(canvasSize, input),
};

export function routePointerInput(
  model: GameModel,
  canvasSize: GameCanvasSize,
  input: PointerInput,
): PointerInputRoute {
  const router = MODE_POINTERS[model.mode.type];
  return router === undefined ? verbMenuPointer(canvasSize, input) : router(model, canvasSize, input);
}

export function firstPersonTouchGesturesEnabled(model: GameModel): boolean {
  return model.mode.type === "playing" && model.viewMode === "firstPerson";
}

function waitOnPointerUp(input: PointerInput): PointerInputRoute {
  return input.phase === "up" ? { type: "command", command: { type: "wait" } } : { type: "none" };
}

function verbMenuPointer(canvasSize: GameCanvasSize, input: PointerInput): PointerInputRoute {
  return {
    type: "transition",
    event: {
      type: "verbPointer",
      phase: input.phase,
      target: verbMenuTargetAt(canvasSize, input),
      ...(input.interaction === "tap" ? { tap: true } : {}),
    },
  };
}

function titlePointer(canvasSize: GameCanvasSize, input: PointerInput): PointerInputRoute {
  switch (input.phase) {
    case "move":
      return {
        type: "transition",
        event: {
          type: "titlePointer",
          phase: "move",
          hoverButton: titleHoverButtonAt(canvasSize, input),
        },
      };
    case "up":
      if (titleHelpButtonHit(canvasSize, input)) {
        return { type: "command", command: { type: "help" } };
      }
      if (titleSettingsButtonHit(canvasSize, input)) {
        return { type: "command", command: { type: "settings" } };
      }
      if (!titleStartButtonHit(canvasSize, input)) return { type: "none" };
      return { type: "command", command: { type: "wait" } };
    case "down":
    case "cancel":
      return { type: "none" };
    default: {
      const _exhaustive: never = input.phase;
      return _exhaustive;
    }
  }
}

function settingsPointer(
  model: GameModel,
  canvasSize: GameCanvasSize,
  input: PointerInput,
): PointerInputRoute {
  const mode = model.mode;
  if (mode.type !== "settings") return { type: "none" };

  const slider = settingsSliderAt(canvasSize, input);
  const dragging = mode.dragging;
  const activeSlider = dragging ?? slider;
  const volume = activeSlider === undefined ? undefined : settingsSliderUnit(canvasSize, activeSlider, input);

  switch (input.phase) {
    case "down":
      if (slider === undefined) return { type: "none" };
      return {
        type: "transition",
        event: { type: "settingsPointer", phase: "down", slider, volume },
      };
    case "move":
      if (dragging === undefined) return { type: "none" };
      return {
        type: "transition",
        event: { type: "settingsPointer", phase: "move", slider: dragging, volume },
      };
    case "up":
      if (dragging !== undefined) {
        return {
          type: "transition",
          event: { type: "settingsPointer", phase: "up", slider: dragging, volume },
        };
      }
      if (!settingsBackButtonHit(canvasSize, input)) return { type: "none" };
      return { type: "command", command: { type: "wait" } };
    case "cancel":
      if (dragging === undefined) return { type: "none" };
      return {
        type: "transition",
        event: { type: "settingsPointer", phase: "cancel", slider: dragging, volume },
      };
    default: {
      const _exhaustive: never = input.phase;
      return _exhaustive;
    }
  }
}
