import type { GameCommand } from "@/src/game/model/commands.ts";
import { hasNextIntermissionPage, type IntermissionMode, isMessageRevealed } from "@/src/game/model/intermission.ts";
import { createPresentationState } from "@/src/game/model/presentation_state.ts";
import type { GameModel, GameTransition } from "@/src/game/model/transition/contracts.ts";
import { done } from "@/src/game/model/transition/result.ts";

export type IntermissionInput = {
  readonly title?: string;
  readonly pages: readonly string[];
  readonly prompt: string;
  readonly background: IntermissionMode["background"];
  readonly completion: IntermissionMode["completion"];
  readonly nowMs: number;
};

export function enterIntermission(model: GameModel, input: IntermissionInput): GameModel {
  return {
    ...model,
    mode: {
      type: "intermission",
      ...(input.title === undefined ? {} : { title: input.title }),
      pages: input.pages,
      pageIndex: 0,
      prompt: input.prompt,
      background: input.background,
      completion: input.completion,
      revealStartedAtMs: input.nowMs,
      revealed: false,
    },
  };
}

export function intermissionCommand(
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
  switch (mode.completion.type) {
    case "loadMap": {
      const loadingModel = { ...model, mode: { type: "loading", loaded: 0, total: 0 } } satisfies GameModel;
      return done(loadingModel, [
        { type: "render" },
        { type: "loadMap", mapName: mode.completion.mapName },
      ]);
    }
    case "returnToTitle":
      return done({
        ...model,
        presentation: createPresentationState(),
        mode: { type: "title", intent: "start" },
      }, [
        { type: "render" },
        { type: "endRun" },
      ]);
    default: {
      const _exhaustive: never = mode.completion;
      return _exhaustive;
    }
  }
}
