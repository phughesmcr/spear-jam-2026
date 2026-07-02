import type { KeyColor } from "@/src/map/map.ts";
import { normalizeTurnEffects } from "@/src/game/turn_effects.ts";
import type { TurnEffectState } from "@/src/game/turn_effects.ts";

export type CommandSlot = 1 | 2 | 3;

export type AmmoKind = "pistol" | "cannon";

export type PlayerAmmoState = {
  readonly pistol: number;
  readonly cannon: number;
};

export type PlayerHealthState = {
  readonly current: number;
  readonly max: number;
};

export type PlayerProgressState = {
  readonly credits: number;
  readonly score: number;
  readonly xp: number;
  readonly levelCredits: number;
};

/** Player progress that survives map transitions. */
export type PlayerState = {
  readonly heldKeys: readonly KeyColor[];
  readonly selectedWeapon: CommandSlot;
  readonly unlockedWeapons: readonly CommandSlot[];
  readonly ammo: PlayerAmmoState;
  readonly health: PlayerHealthState;
  readonly hasUplinkCode: boolean;
  readonly progress: PlayerProgressState;
  readonly turnEffects: readonly TurnEffectState[];
};

export type PlayerStateInput = {
  readonly heldKeys?: readonly KeyColor[];
  readonly selectedWeapon?: CommandSlot;
  readonly unlockedWeapons?: readonly CommandSlot[];
  readonly ammo?: Partial<PlayerAmmoState>;
  readonly health?: Partial<PlayerHealthState>;
  readonly hasUplinkCode?: boolean;
  readonly progress?: Partial<PlayerProgressState>;
  readonly turnEffects?: readonly TurnEffectState[];
};

export const DEFAULT_PLAYER_STATE: PlayerState = Object.freeze({
  heldKeys: Object.freeze([]) as readonly KeyColor[],
  selectedWeapon: 1,
  unlockedWeapons: Object.freeze([1]) as readonly CommandSlot[],
  ammo: Object.freeze({ pistol: 0, cannon: 0 }),
  health: Object.freeze({ current: 10, max: 10 }),
  hasUplinkCode: false,
  progress: Object.freeze({ credits: 0, score: 0, xp: 0, levelCredits: 0 }),
  turnEffects: Object.freeze([]) as readonly TurnEffectState[],
});

export function createPlayerState(playerState: PlayerStateInput = {}): PlayerState {
  const unlockedWeapons = sortedWeaponSlots([
    ...DEFAULT_PLAYER_STATE.unlockedWeapons,
    ...(playerState.unlockedWeapons ?? []),
  ]);
  const selectedWeapon =
    playerState.selectedWeapon !== undefined && unlockedWeapons.includes(playerState.selectedWeapon) ?
      playerState.selectedWeapon :
      DEFAULT_PLAYER_STATE.selectedWeapon;

  return {
    heldKeys: [...(playerState.heldKeys ?? DEFAULT_PLAYER_STATE.heldKeys)],
    selectedWeapon,
    unlockedWeapons,
    ammo: {
      pistol: playerState.ammo?.pistol ?? DEFAULT_PLAYER_STATE.ammo.pistol,
      cannon: playerState.ammo?.cannon ?? DEFAULT_PLAYER_STATE.ammo.cannon,
    },
    health: {
      current: playerState.health?.current ?? DEFAULT_PLAYER_STATE.health.current,
      max: playerState.health?.max ?? DEFAULT_PLAYER_STATE.health.max,
    },
    hasUplinkCode: playerState.hasUplinkCode ?? DEFAULT_PLAYER_STATE.hasUplinkCode,
    progress: {
      credits: playerState.progress?.credits ?? DEFAULT_PLAYER_STATE.progress.credits,
      score: playerState.progress?.score ?? DEFAULT_PLAYER_STATE.progress.score,
      xp: playerState.progress?.xp ?? DEFAULT_PLAYER_STATE.progress.xp,
      levelCredits: playerState.progress?.levelCredits ?? DEFAULT_PLAYER_STATE.progress.levelCredits,
    },
    turnEffects: normalizeTurnEffects(playerState.turnEffects ?? DEFAULT_PLAYER_STATE.turnEffects),
  };
}

function sortedWeaponSlots(slots: readonly CommandSlot[]): readonly CommandSlot[] {
  return [...new Set(slots)].sort((a, b) => a - b);
}

export type DialogueState = {
  readonly title: string;
  readonly message: string;
};

export type GameMode =
  | { readonly type: "loading" }
  | { readonly type: "playing" }
  | { readonly type: "paused" }
  | { readonly type: "menu" }
  | { readonly type: "verbMenu"; readonly selectedIndex: number }
  | ({ readonly type: "dialogue" } & DialogueState)
  | {
    readonly type: "intermission";
    readonly message: string;
    readonly goto: string;
    readonly playerState: PlayerState;
  }
  | { readonly type: "victory" }
  | { readonly type: "defeat" }
  | { readonly type: "error"; readonly message: string };
