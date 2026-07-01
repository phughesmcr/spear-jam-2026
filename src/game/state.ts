export type CommandSlot = 1 | 2 | 3;

export type PlayerState = {
  readonly heldKeys: readonly number[];
  readonly selectedWeapon: CommandSlot;
};

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
