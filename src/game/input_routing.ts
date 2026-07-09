import type { GameCommand } from "@/src/game/commands.ts";
import type { GameModel, GameTransitionEvent } from "@/src/game/transition.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import type { GameCanvasSize } from "@/src/render/canvas.ts";
import { dialogueOptionSlotAt } from "@/src/render/dialogue.ts";
import { titleSettingsButtonHit, titleStartButtonHit } from "@/src/render/title.ts";
import { settingsBackButtonHit } from "@/src/render/settings.ts";
import { verbMenuTargetAt } from "@/src/render/verb_menu.ts";

export type PointerTransitionEvent = Extract<
  GameTransitionEvent,
  { readonly type: "dialoguePointer" | "verbPointer" }
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
  if (mode.type === "settings") return settingsPointer(canvasSize, input);
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
  if (input.phase !== "up") return { type: "none" };
  if (titleSettingsButtonHit(canvasSize, input)) {
    return { type: "command", command: { type: "settings" } };
  }
  if (!titleStartButtonHit(canvasSize, input)) return { type: "none" };
  return { type: "command", command: { type: "wait" } };
}

function settingsPointer(canvasSize: GameCanvasSize, input: CanvasPointerInput): PointerInputRoute {
  if (input.phase !== "up") return { type: "none" };
  if (!settingsBackButtonHit(canvasSize, input)) return { type: "none" };
  return { type: "command", command: { type: "wait" } };
}
