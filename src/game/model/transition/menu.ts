import { withAudioVolume } from "@/src/game/model/audio_settings.ts";
import type { GameCommand } from "@/src/game/model/commands.ts";
import {
  clampInteractiveFps,
  interactiveFpsFromUnit,
  type SettingsSliderId,
} from "@/src/game/model/render_settings.ts";
import type { GameMode, TitleHoverButton } from "@/src/game/model/state.ts";
import type { GameModel, GameTransition } from "@/src/game/model/transition/contracts.ts";
import { beginGame } from "@/src/game/model/transition/lifecycle.ts";
import { dispatchCommand, done, pointerGesture } from "@/src/game/model/transition/result.ts";
import type { PointerPhase } from "@/src/engine/input/mod.ts";

type HelpMode = Extract<GameMode, { readonly type: "help" }>;
type SettingsMode = Extract<GameMode, { readonly type: "settings" }>;
type TitleMode = Extract<GameMode, { readonly type: "title" }>;

export function titleCommand(model: GameModel, command: GameCommand, nowMs: number): GameTransition {
  const mode = model.mode;
  if (mode.type !== "title") return done(model);

  return dispatchCommand(model, command, {
    menu: () => mode.intent === "resume" ? closeTitleMenu(model) : done(model),
    settings: () =>
      done({
        ...model,
        mode: { type: "settings", returnIntent: mode.intent },
      }, [{ type: "render" }]),
    help: () =>
      done({
        ...model,
        mode: { type: "help", returnTo: { kind: "title", intent: mode.intent } },
      }, [{ type: "render" }]),
    wait: () => mode.intent === "resume" ? closeTitleMenu(model) : beginGame(model, nowMs),
  });
}

export function titlePointer(
  model: GameModel,
  phase: PointerPhase,
  hoverButton: TitleHoverButton | undefined,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "title") return done(model);

  return pointerGesture(model, phase, {
    move: () => hoverTitleButton(model, mode, hoverButton),
    down: () => done(model),
    up: () => done(model),
    cancel: () => done(model),
  });
}

export function settingsCommand(model: GameModel, mode: SettingsMode, command: GameCommand): GameTransition {
  const close = (): GameTransition =>
    done({
      ...model,
      mode: { type: "title", intent: mode.returnIntent },
    }, [{ type: "render" }]);
  return dispatchCommand(model, command, {
    wait: close,
    action: close,
    menu: close,
    settings: close,
  });
}

export function settingsPointer(
  model: GameModel,
  phase: PointerPhase,
  slider: SettingsSliderId | undefined,
  volume: number | undefined,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "settings") return done(model);

  return pointerGesture(model, phase, {
    down: () => {
      if (slider === undefined || volume === undefined) return done(model);
      return applySettingsSlider(model, mode, slider, volume, true);
    },
    move: () => {
      const dragging = mode.dragging;
      if (dragging === undefined || volume === undefined) return done(model);
      return applySettingsSlider(model, mode, dragging, volume, false);
    },
    up: () => {
      if (mode.dragging === undefined) return done(model);
      return done({
        ...model,
        mode: { type: "settings", returnIntent: mode.returnIntent },
      });
    },
    cancel: () => {
      if (mode.dragging === undefined) return done(model);
      return done({
        ...model,
        mode: { type: "settings", returnIntent: mode.returnIntent },
      });
    },
  });
}

export function helpCommand(model: GameModel, mode: HelpMode, command: GameCommand): GameTransition {
  const close = (): GameTransition => {
    switch (mode.returnTo.kind) {
      case "verbMenu":
        return done({
          ...model,
          mode: { type: "verbMenu", selectedIndex: mode.returnTo.selectedIndex },
        }, [{ type: "render" }]);
      case "title":
        return done({
          ...model,
          mode: { type: "title", intent: mode.returnTo.intent },
        }, [{ type: "render" }]);
      default: {
        const _exhaustive: never = mode.returnTo;
        return _exhaustive;
      }
    }
  };
  return dispatchCommand(model, command, {
    wait: close,
    action: close,
    menu: close,
  });
}

function hoverTitleButton(
  model: GameModel,
  mode: TitleMode,
  hoverButton: TitleHoverButton | undefined,
): GameTransition {
  if (mode.hoverButton === hoverButton) return done(model);
  return done({ ...model, mode: titleMode(mode.intent, hoverButton) }, [{ type: "render" }]);
}

function titleMode(intent: TitleMode["intent"], hoverButton: TitleHoverButton | undefined): TitleMode {
  return hoverButton === undefined ? { type: "title", intent } : { type: "title", intent, hoverButton };
}

function applySettingsSlider(
  model: GameModel,
  mode: SettingsMode,
  slider: SettingsSliderId,
  unit: number,
  startDrag: boolean,
): GameTransition {
  switch (slider) {
    case "music":
    case "sound": {
      const audio = withAudioVolume(model.audio, slider, unit);
      if (!startDrag && audio === model.audio) return done(model);
      return done({
        ...model,
        audio,
        mode: startDrag ? { type: "settings", returnIntent: mode.returnIntent, dragging: slider } : model.mode,
      }, [{ type: "applyAudioVolumes" }, { type: "render" }]);
    }
    case "fps": {
      const interactiveFps = interactiveFpsFromUnit(unit);
      if (!startDrag && interactiveFps === model.interactiveFps) return done(model);
      return done({
        ...model,
        interactiveFps: clampInteractiveFps(interactiveFps),
        mode: startDrag ? { type: "settings", returnIntent: mode.returnIntent, dragging: "fps" } : model.mode,
      }, [{ type: "render" }]);
    }
    default: {
      const _exhaustive: never = slider;
      return _exhaustive;
    }
  }
}

function closeTitleMenu(model: GameModel): GameTransition {
  return done({ ...model, mode: { type: "playing" } }, [{ type: "render" }]);
}
