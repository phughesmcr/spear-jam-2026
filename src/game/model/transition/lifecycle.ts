import { TrackId } from "@/src/game/content/audio/music.ts";
import { INTRO_INTERMISSION } from "@/src/game/content/intro.ts";
import { DEFAULT_AUDIO_SETTINGS } from "@/src/game/model/audio_settings.ts";
import { createPresentationState } from "@/src/game/model/presentation_state.ts";
import { DEFAULT_INTERACTIVE_FPS } from "@/src/game/model/render_settings.ts";
import type { GameModel, GameModelOptions, GameTransition } from "@/src/game/model/transition/contracts.ts";
import { enterIntermission } from "@/src/game/model/transition/intermission.ts";
import { done } from "@/src/game/model/transition/result.ts";

export function createGameModel(startMapName: string, options: GameModelOptions = {}): GameModel {
  return {
    startMapName,
    showIntro: options.showIntro ?? false,
    showTitle: options.showTitle ?? false,
    currentMapName: startMapName,
    presentation: createPresentationState(),
    mode: { type: "loading", loaded: 0, total: 0 },
    viewMode: "firstPerson",
    audio: DEFAULT_AUDIO_SETTINGS,
    interactiveFps: DEFAULT_INTERACTIVE_FPS,
    lastVerbIndex: 0,
  };
}

export function startGame(model: GameModel, nowMs: number): GameTransition {
  if (model.showTitle) {
    return done({ ...model, mode: { type: "title", intent: "start" } }, [
      { type: "ensureInput" },
      { type: "applyAudioVolumes" },
      { type: "playMusic", trackId: TrackId.Title },
      { type: "render" },
    ]);
  }
  return beginGame(model, nowMs);
}

export function beginGame(model: GameModel, nowMs: number): GameTransition {
  if (model.showIntro) {
    return done(
      enterIntermission(model, {
        title: INTRO_INTERMISSION.title,
        pages: INTRO_INTERMISSION.pages,
        prompt: INTRO_INTERMISSION.prompt,
        background: "system",
        completion: { type: "loadMap", mapName: model.startMapName },
        nowMs,
      }),
      [
        { type: "ensureInput" },
        { type: "applyAudioVolumes" },
        { type: "playMusic", trackId: TrackId.Intro },
        { type: "render" },
      ],
    );
  }
  return done({ ...model, mode: { type: "loading", loaded: 0, total: 0 } }, [
    { type: "applyAudioVolumes" },
    { type: "render" },
    { type: "loadMap", mapName: model.startMapName },
  ]);
}

export function mapLoaded(model: GameModel, mapName: string): GameTransition {
  return done({
    ...model,
    currentMapName: mapName,
    presentation: createPresentationState(),
    mode: { type: "playing" },
  }, [{ type: "ensureInput" }, { type: "render" }]);
}

export function loadingProgress(model: GameModel, loaded: number, total: number): GameTransition {
  if (model.mode.type !== "loading") return done(model);
  if (model.mode.loaded === loaded && model.mode.total === total) return done(model);
  return done({ ...model, mode: { type: "loading", loaded, total } }, [{ type: "render" }]);
}
