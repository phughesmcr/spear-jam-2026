import type { PlayerState } from "@/src/ecs/player.ts";

export type GameMode =
  | { readonly type: "loading" }
  | { readonly type: "playing" }
  | { readonly type: "paused" }
  | { readonly type: "menu" }
  | {
    readonly type: "intermission";
    readonly message: string;
    readonly goto: string;
    readonly playerState: PlayerState;
  }
  | { readonly type: "error"; readonly message: string };
