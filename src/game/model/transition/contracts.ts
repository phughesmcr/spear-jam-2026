import type { TrackId as MusicTrackId } from "@/src/game/content/audio/music.ts";
import type { VoiceId } from "@/src/game/content/dialogue/voices.ts";
import type { AudioSettings } from "@/src/game/model/audio_settings.ts";
import type { GameCommand, PlayerCommand, PlayerCommandResult } from "@/src/game/model/commands.ts";
import type { PresentationState } from "@/src/game/model/presentation_state.ts";
import type { SettingsSliderId } from "@/src/game/model/render_settings.ts";
import type { GameMode, TitleHoverButton, VerbMenuTarget, ViewMode } from "@/src/game/model/state.ts";
import type { PointerPhase } from "@/src/engine/input/mod.ts";
import type { Entity } from "turn-based-engine/ecs";

export type GameModelOptions = {
  readonly showIntro?: boolean;
  readonly showTitle?: boolean;
};

export type GameModel = {
  readonly startMapName: string;
  readonly showIntro: boolean;
  readonly showTitle: boolean;
  readonly currentMapName: string;
  readonly presentation: PresentationState;
  readonly mode: GameMode;
  readonly viewMode: ViewMode;
  readonly audio: AudioSettings;
  readonly interactiveFps: number;
  readonly lastVerbIndex: number;
};

export type GameEffect =
  | { readonly type: "render" }
  | { readonly type: "resetFirstPerson" }
  | { readonly type: "warmMapAssets"; readonly mapName: string }
  | { readonly type: "closeDialogue" }
  | { readonly type: "setDialogueVoice"; readonly voice?: VoiceId }
  | { readonly type: "ensureInput" }
  | { readonly type: "applyAudioVolumes" }
  | { readonly type: "playMusic"; readonly trackId: MusicTrackId }
  | { readonly type: "stopSounds" }
  | { readonly type: "scheduleVictory"; readonly delayMs: number }
  | { readonly type: "loadMap"; readonly mapName: string }
  | { readonly type: "retryMap"; readonly mapName: string }
  | { readonly type: "endRun" }
  | { readonly type: "runPlayerCommand"; readonly command: PlayerCommand };

export type GameTransitionEvent =
  | { readonly type: "start"; readonly nowMs?: number }
  | { readonly type: "mapLoaded"; readonly mapName: string }
  | { readonly type: "loadingProgress"; readonly loaded: number; readonly total: number }
  | { readonly type: "loadFailed"; readonly message: string }
  | { readonly type: "victoryTransitionComplete"; readonly nowMs?: number }
  | { readonly type: "gameCommand"; readonly command: GameCommand; readonly nowMs?: number }
  | {
    readonly type: "verbPointer";
    readonly phase: PointerPhase;
    readonly target?: VerbMenuTarget;
    readonly tap?: true;
  }
  | { readonly type: "dialoguePointer"; readonly phase: PointerPhase; readonly optionSlot?: number }
  | {
    readonly type: "titlePointer";
    readonly phase: PointerPhase;
    readonly hoverButton?: TitleHoverButton;
  }
  | {
    readonly type: "settingsPointer";
    readonly phase: PointerPhase;
    readonly slider?: SettingsSliderId;
    readonly volume?: number;
  }
  | {
    readonly type: "playerCommandResult";
    readonly result: PlayerCommandResult;
    readonly playerEntity: Entity;
    readonly nowMs?: number;
  };

export type GameTransition = {
  readonly model: GameModel;
  readonly effects: readonly GameEffect[];
};
