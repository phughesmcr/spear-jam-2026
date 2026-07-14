import type { GameMode, ViewMode } from "@/src/game/model/state.ts";

export type RenderLayerPolicy = {
  readonly renderSession: boolean;
  readonly renderMessageLog: boolean;
  readonly opaqueFirstPerson: boolean;
};

export function renderLayerPolicy(mode: GameMode, viewMode: ViewMode): RenderLayerPolicy {
  switch (mode.type) {
    case "title":
    case "settings":
    case "intermission":
    case "loading":
      return { renderSession: false, renderMessageLog: false, opaqueFirstPerson: false };
    case "playing":
    case "victoryTransition":
    case "verbMenu":
      return {
        renderSession: true,
        renderMessageLog: true,
        opaqueFirstPerson: viewMode === "firstPerson",
      };
    case "paused":
    case "help":
    case "dialogue":
    case "defeat":
    case "error":
      return { renderSession: true, renderMessageLog: true, opaqueFirstPerson: false };
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}
