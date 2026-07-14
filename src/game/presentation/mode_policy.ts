import type { GameMode, ViewMode } from "@/src/game/model/state.ts";

export type ShellMode = Extract<GameMode, { type: "title" | "settings" | "loading" | "intermission" }>;
export type OverlayMode = Exclude<GameMode, ShellMode>;

export type RenderLayerPolicy = {
  readonly opaqueFirstPerson: boolean;
};

export function isShellMode(mode: GameMode): mode is ShellMode {
  return mode.type === "title" || mode.type === "settings" || mode.type === "loading" || mode.type === "intermission";
}

export function renderLayerPolicy(mode: GameMode, viewMode: ViewMode): RenderLayerPolicy {
  switch (mode.type) {
    case "title":
    case "settings":
    case "intermission":
    case "loading":
      return { opaqueFirstPerson: false };
    case "playing":
    case "victoryTransition":
    case "verbMenu":
      return {
        opaqueFirstPerson: viewMode === "firstPerson",
      };
    case "paused":
    case "help":
    case "dialogue":
    case "defeat":
    case "error":
      return { opaqueFirstPerson: false };
    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}
