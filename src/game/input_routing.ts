import type { GameCommand } from "@/src/game/commands.ts";
import type { GameModel, GameTransitionEvent } from "@/src/game/transition.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { dialogueOptionSlotAt } from "@/src/render/dialogue.ts";
import { settingsBackButtonHit, settingsSliderAt, settingsSliderUnit } from "@/src/render/settings.ts";
import { titleHoverButtonAt, titleSettingsButtonHit, titleStartButtonHit } from "@/src/render/title.ts";
import { verbMenuTargetAt } from "@/src/render/verb_menu.ts";

export type PointerTransitionEvent = Extract<
  GameTransitionEvent,
  { readonly type: "dialoguePointer" | "verbPointer" | "settingsPointer" | "titlePointer" }
>;

export type PointerInputRoute =
  | { readonly type: "none" }
  | { readonly type: "command"; readonly command: GameCommand }
  | { readonly type: "transition"; readonly event: PointerTransitionEvent };

export function routePointerInput(
  model: GameModel,
  canvasSize: GameCanvasSize,
  input: CanvasPointerInput,
): PointerInputRoute {
  const mode = model.mode;
  if (mode.type === "title") return titlePointer(canvasSize, input);
  if (mode.type === "settings") return settingsPointer(model, canvasSize, input);
  if (mode.type === "intermission") return waitOnPointerUp(input);
  if (mode.type === "victory" || mode.type === "defeat") return waitOnPointerUp(input);

  if (mode.type === "dialogue") {
    return {
      type: "transition",
      event: {
        type: "dialoguePointer",
        phase: input.phase,
        optionSlot: dialogueOptionSlotAt(canvasSize, mode.choices, input),
      },
    };
  }

  if (mode.type === "help") return waitOnPointerUp(input);

  if (mode.type === "playing" && model.viewMode === "topDown") {
    return input.phase === "up" ? { type: "command", command: { type: "toggleView" } } : { type: "none" };
  }

  return {
    type: "transition",
    event: {
      type: "verbPointer",
      phase: input.phase,
      target: verbMenuTargetAt(canvasSize, input),
    },
  };
}

export function firstPersonTouchGesturesEnabled(model: GameModel): boolean {
  return model.mode.type === "playing" && model.viewMode === "firstPerson";
}

function waitOnPointerUp(input: CanvasPointerInput): PointerInputRoute {
  return input.phase === "up" ? { type: "command", command: { type: "wait" } } : { type: "none" };
}

function titlePointer(canvasSize: GameCanvasSize, input: CanvasPointerInput): PointerInputRoute {
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
  input: CanvasPointerInput,
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
