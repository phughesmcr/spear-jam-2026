import type { GameCommand } from "@/src/game/model/commands.ts";
import type { CommandSlot, VerbMenuControl, VerbMenuTarget } from "@/src/game/model/state.ts";
import type { GameModel, GameTransition } from "@/src/game/model/transition/contracts.ts";
import { dispatchCommand, done, pointerGesture } from "@/src/game/model/transition/result.ts";
import { toggleView } from "@/src/game/model/transition/view.ts";
import { VERBS, verbToCommand } from "@/src/game/model/verbs.ts";
import type { PointerPhase } from "@/src/engine/input/mod.ts";

type VerbMenuMode = Extract<GameModel["mode"], { readonly type: "verbMenu" }>;

export function openVerbMenu(model: GameModel): GameModel {
  return {
    ...model,
    mode: { type: "verbMenu", selectedIndex: model.lastVerbIndex },
  };
}

export function verbMenuCommand(model: GameModel, mode: VerbMenuMode, command: GameCommand): GameTransition {
  return dispatchCommand(model, command, {
    move: (move) => {
      if (move.direction === "forward") {
        const selectedIndex = (mode.selectedIndex - 1 + VERBS.length) % VERBS.length;
        return done({
          ...model,
          mode: verbMenuMode(selectedIndex, { kind: "verb", verbIndex: selectedIndex }),
        }, [{ type: "render" }]);
      }
      if (move.direction === "backward") {
        const selectedIndex = (mode.selectedIndex + 1) % VERBS.length;
        return done({
          ...model,
          mode: verbMenuMode(selectedIndex, { kind: "verb", verbIndex: selectedIndex }),
        }, [{ type: "render" }]);
      }
      return done(model);
    },
    wait: () => confirmVerbSelection(model, mode),
    action: () => confirmVerbSelection(model, mode),
    menu: () => done({ ...model, mode: { type: "playing" } }, [{ type: "render" }]),
  });
}

export function verbPointer(
  model: GameModel,
  phase: PointerPhase,
  target: VerbMenuTarget | undefined,
  tap: boolean,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "verbMenu") return done(model);

  return pointerGesture(model, phase, {
    move: () => hoverVerbMenuTarget(model, mode, target),
    down: () => {
      const downMode = withVerbMenuPointerDown(mode, target);
      const downModel = { ...model, mode: downMode };
      if (target?.kind === "verb" && target.verbIndex !== mode.selectedIndex) {
        const selectedMode: VerbMenuMode = tap ? { ...downMode, selectedIndex: target.verbIndex } : {
          type: "verbMenu",
          selectedIndex: target.verbIndex,
        };
        return done({ ...downModel, mode: selectedMode }, [{ type: "render" }]);
      }
      return done(downModel);
    },
    up: () => {
      const downTarget = mode.pointerDownTarget;
      const upMode = withoutVerbMenuPointerDown(mode);
      const upModel = { ...model, mode: upMode };
      if (target === undefined) return done(upModel);

      if (target.kind === "weapon") {
        if (sameVerbMenuTarget(downTarget, target)) return confirmWeaponSelection(upModel, target.slot);
        return done(upModel);
      }
      if (target.kind === "control") {
        if (sameVerbMenuTarget(downTarget, target)) return confirmControlSelection(upModel, target.control);
        return done(upModel);
      }

      const selectedMode = { ...upMode, selectedIndex: target.verbIndex };
      const selectedModel = { ...model, mode: selectedMode };
      if (sameVerbMenuTarget(downTarget, target)) return confirmVerbSelection(selectedModel, selectedMode);
      return done(selectedModel, [{ type: "render" }]);
    },
    cancel: () => done({ ...model, mode: withoutVerbMenuPointerDown(mode) }),
  });
}

function hoverVerbMenuTarget(
  model: GameModel,
  mode: VerbMenuMode,
  target: VerbMenuTarget | undefined,
): GameTransition {
  const selectedIndex = target?.kind === "verb" ? target.verbIndex : mode.selectedIndex;
  if (mode.selectedIndex === selectedIndex && sameOptionalVerbMenuTarget(mode.hoverTarget, target)) {
    return done(model);
  }
  return done({ ...model, mode: verbMenuMode(selectedIndex, target) }, [{ type: "render" }]);
}

function verbMenuMode(selectedIndex: number, hoverTarget: VerbMenuTarget | undefined): VerbMenuMode {
  return hoverTarget === undefined ?
    { type: "verbMenu", selectedIndex } :
    { type: "verbMenu", selectedIndex, hoverTarget };
}

function confirmVerbSelection(model: GameModel, mode: VerbMenuMode): GameTransition {
  const selectedIndex = mode.selectedIndex;
  return done({
    ...model,
    lastVerbIndex: selectedIndex,
    mode: { type: "playing" },
  }, [{ type: "runPlayerCommand", command: verbToCommand(selectedIndex) }]);
}

function confirmWeaponSelection(model: GameModel, slot: CommandSlot): GameTransition {
  return done({
    ...model,
    mode: { type: "playing" },
  }, [{ type: "runPlayerCommand", command: { type: "selectWeapon", slot } }]);
}

function confirmControlSelection(model: GameModel, control: VerbMenuControl): GameTransition {
  switch (control) {
    case "wait":
      return done({
        ...model,
        mode: { type: "playing" },
      }, [{ type: "runPlayerCommand", command: { type: "wait" } }]);
    case "toggleView": {
      const toggled = toggleView(model);
      return { ...toggled, model: { ...toggled.model, mode: { type: "playing" } } };
    }
    case "help":
      return done({
        ...model,
        mode: {
          type: "help",
          returnTo: { kind: "verbMenu", selectedIndex: helpReturnSelectedIndex(model) },
        },
      }, [{ type: "render" }]);
    case "close":
      return done({
        ...model,
        mode: { type: "playing" },
      }, [{ type: "render" }]);
    default: {
      const _exhaustive: never = control;
      return _exhaustive;
    }
  }
}

function helpReturnSelectedIndex(model: GameModel): number {
  return model.mode.type === "verbMenu" ? model.mode.selectedIndex : model.lastVerbIndex;
}

function sameVerbMenuTarget(a: VerbMenuTarget | undefined, b: VerbMenuTarget): boolean {
  if (a === undefined) return false;
  if (a.kind === "verb") return b.kind === "verb" && a.verbIndex === b.verbIndex;
  if (a.kind === "weapon") return b.kind === "weapon" && a.slot === b.slot;
  return b.kind === "control" && a.control === b.control;
}

function sameOptionalVerbMenuTarget(a: VerbMenuTarget | undefined, b: VerbMenuTarget | undefined): boolean {
  if (a === undefined) return b === undefined;
  return b !== undefined && sameVerbMenuTarget(a, b);
}

function withVerbMenuPointerDown(mode: VerbMenuMode, target: VerbMenuTarget | undefined): VerbMenuMode {
  if (target === undefined) return withoutVerbMenuPointerDown(mode);
  return { ...mode, pointerDownTarget: target };
}

function withoutVerbMenuPointerDown(mode: VerbMenuMode): VerbMenuMode {
  if (mode.pointerDownTarget === undefined) return mode;
  const { pointerDownTarget: _, ...rest } = mode;
  return rest;
}
