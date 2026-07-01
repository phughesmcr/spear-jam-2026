export type GameMode =
  | { readonly type: "loading" }
  | { readonly type: "playing" }
  | { readonly type: "paused" }
  | { readonly type: "menu" }
  | { readonly type: "intermission"; readonly message: string }
  | { readonly type: "error"; readonly message: string };
