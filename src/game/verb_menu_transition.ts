import type { GameCommand } from "@/src/game/commands.ts";
import type { GameModel, GameTransition, VerbPointerPhase } from "@/src/game/transition.ts";
import type { CommandSlot, VerbMenuControl, VerbMenuTarget, ViewMode } from "@/src/game/state.ts";
import { VERBS, verbToCommand } from "@/src/game/verbs.ts";

type VerbMenuMode = Extract<GameModel["mode"], { readonly type: "verbMenu" }>;

export function openVerbMenu(model: GameModel): GameModel {
  return {
    ...model,
    dialoguePointerDownSlot: undefined,
    verbPointerDownTarget: undefined,
    mode: { type: "verbMenu", selectedIndex: model.lastVerbIndex },
  };
}

export function verbMenuCommand(model: GameModel, mode: VerbMenuMode, command: GameCommand): GameTransition {
  switch (command.type) {
    case "move":
      if (command.direction === "forward") {
        const selectedIndex = (mode.selectedIndex - 1 + VERBS.length) % VERBS.length;
        return done({
          ...model,
          mode: verbMenuMode(selectedIndex, { kind: "verb", verbIndex: selectedIndex }),
        }, [{ type: "render" }]);
      }
      if (command.direction === "backward") {
        const selectedIndex = (mode.selectedIndex + 1) % VERBS.length;
        return done({
          ...model,
          mode: verbMenuMode(selectedIndex, { kind: "verb", verbIndex: selectedIndex }),
        }, [{ type: "render" }]);
      }
      return done(model);
    case "wait":
    case "action":
      return confirmVerbSelection(model, mode);
    case "menu":
      return done({ ...model, verbPointerDownTarget: undefined, mode: { type: "playing" } }, [{ type: "render" }]);
    case "turn":
    case "interact":
    case "examine":
    case "attack":
    case "smartAction":
    case "selectWeapon":
    case "pause":
    case "toggleView":
      return done(model);
  }
}

export function verbPointer(
  model: GameModel,
  phase: VerbPointerPhase,
  target: VerbMenuTarget | undefined,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "verbMenu") return done(model);

  switch (phase) {
    case "move":
      return hoverVerbMenuTarget(model, mode, target);
    case "down": {
      const downModel = { ...model, verbPointerDownTarget: target };
      if (target?.kind === "verb" && target.verbIndex !== mode.selectedIndex) {
        return done(selectVerb(downModel, target.verbIndex), [{ type: "render" }]);
      }
      return done(downModel);
    }
    case "up": {
      const downTarget = model.verbPointerDownTarget;
      const upModel = { ...model, verbPointerDownTarget: undefined };
      if (target === undefined) return done(upModel);

      if (target.kind === "weapon") {
        if (sameVerbMenuTarget(downTarget, target)) return confirmWeaponSelection(upModel, target.slot);
        return done(upModel);
      }
      if (target.kind === "control") {
        if (sameVerbMenuTarget(downTarget, target)) return confirmControlSelection(upModel, target.control);
        return done(upModel);
      }

      const selectedMode = { type: "verbMenu", selectedIndex: target.verbIndex } satisfies VerbMenuMode;
      const selectedModel = { ...upModel, mode: selectedMode };
      if (sameVerbMenuTarget(downTarget, target)) return confirmVerbSelection(selectedModel, selectedMode);
      return done(selectedModel, [{ type: "render" }]);
    }
    case "cancel":
      return done({ ...model, verbPointerDownTarget: undefined });
  }
}

function selectVerb(model: GameModel, selectedIndex: number): GameModel {
  const mode = model.mode;
  if (mode.type === "verbMenu" && selectedIndex === mode.selectedIndex) return model;
  return { ...model, mode: { type: "verbMenu", selectedIndex } };
}

function hoverVerbMenuTarget(
  model: GameModel,
  mode: VerbMenuMode,
  target: VerbMenuTarget | undefined,
): GameTransition {
  const selectedIndex = target?.kind === "verb" ? target.verbIndex : mode.selectedIndex;
  if (mode.selectedIndex === selectedIndex && sameOptionalVerbMenuTarget(mode.hoverTarget, target)) return done(model);
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
    dialoguePointerDownSlot: undefined,
    verbPointerDownTarget: undefined,
    lastVerbIndex: selectedIndex,
    mode: { type: "playing" },
  }, [{ type: "runPlayerCommand", command: verbToCommand(selectedIndex) }]);
}

function confirmWeaponSelection(model: GameModel, slot: CommandSlot): GameTransition {
  return done({
    ...model,
    dialoguePointerDownSlot: undefined,
    verbPointerDownTarget: undefined,
    mode: { type: "playing" },
  }, [{ type: "runPlayerCommand", command: { type: "selectWeapon", slot } }]);
}

function confirmControlSelection(model: GameModel, control: VerbMenuControl): GameTransition {
  switch (control) {
    case "wait":
      return done({
        ...model,
        dialoguePointerDownSlot: undefined,
        verbPointerDownTarget: undefined,
        mode: { type: "playing" },
      }, [{ type: "runPlayerCommand", command: { type: "wait" } }]);
    case "toggleView": {
      const viewMode: ViewMode = model.viewMode === "firstPerson" ? "topDown" : "firstPerson";
      return done({
        ...model,
        dialoguePointerDownSlot: undefined,
        verbPointerDownTarget: undefined,
        mode: { type: "playing" },
        viewMode,
      }, [{ type: "render" }]);
    }
    case "help":
      return done({
        ...model,
        dialoguePointerDownSlot: undefined,
        verbPointerDownTarget: undefined,
        mode: { type: "help", selectedIndex: helpReturnSelectedIndex(model) },
      }, [{ type: "render" }]);
    case "close":
      return done({
        ...model,
        dialoguePointerDownSlot: undefined,
        verbPointerDownTarget: undefined,
        mode: { type: "playing" },
      }, [{ type: "render" }]);
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

function done(model: GameModel, effects: GameTransition["effects"] = []): GameTransition {
  return { model, effects };
}
