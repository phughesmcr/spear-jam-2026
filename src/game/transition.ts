import type { Entity } from "@phughesmcr/miski";
import { dialogueTreeNode } from "@/src/dialogue/dialogue.ts";
import { combatFeedbackForEvents } from "@/src/game/combat_feedback.ts";
import type { CombatFeedback } from "@/src/game/combat_feedback.ts";
import { isPlayerCommand } from "@/src/game/commands.ts";
import type { GameCommand, PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import type { GameMode, PlayerStateInput, ViewMode } from "@/src/game/state.ts";
import { VERBS, verbToCommand } from "@/src/game/verbs.ts";

type IntermissionMode = Extract<GameMode, { readonly type: "intermission" }>;
type DialogueMode = Extract<GameMode, { readonly type: "dialogue" }>;
type VerbMenuMode = Extract<GameMode, { readonly type: "verbMenu" }>;

export type VerbPointerPhase = "move" | "down" | "up" | "cancel";
export type DialoguePointerPhase = VerbPointerPhase;

export type GameModel = {
  readonly startMapName: string;
  readonly currentMapName: string;
  readonly currentLevelEntryState?: PlayerStateInput;
  readonly combatFeedback: readonly CombatFeedback[];
  readonly mode: GameMode;
  readonly viewMode: ViewMode;
  readonly lastVerbIndex: number;
  readonly verbPointerDownIndex?: number;
  readonly dialoguePointerDownSlot?: number;
};

export type GameEffect =
  | { readonly type: "render" }
  | { readonly type: "ensureInput" }
  | { readonly type: "loadMap"; readonly mapName: string; readonly playerState?: PlayerStateInput }
  | { readonly type: "runPlayerCommand"; readonly command: PlayerCommand };

export type GameTransitionEvent =
  | { readonly type: "start" }
  | { readonly type: "mapLoaded"; readonly mapName: string; readonly playerState?: PlayerStateInput }
  | { readonly type: "loadFailed"; readonly message: string }
  | { readonly type: "gameCommand"; readonly command: GameCommand }
  | { readonly type: "verbPointer"; readonly phase: VerbPointerPhase; readonly hotspotIndex?: number }
  | { readonly type: "dialoguePointer"; readonly phase: DialoguePointerPhase; readonly optionSlot?: number }
  | {
    readonly type: "playerCommandResult";
    readonly result: PlayerCommandResult;
    readonly playerEntity: Entity;
    readonly playerState: PlayerStateInput;
  };

export type GameTransition = {
  readonly model: GameModel;
  readonly effects: readonly GameEffect[];
};

export function createGameModel(startMapName: string): GameModel {
  return {
    startMapName,
    currentMapName: startMapName,
    combatFeedback: [],
    mode: { type: "loading" },
    viewMode: "firstPerson",
    lastVerbIndex: 0,
  };
}

export function transition(model: GameModel, event: GameTransitionEvent): GameTransition {
  switch (event.type) {
    case "start":
      return done(model, [
        { type: "render" },
        { type: "loadMap", mapName: model.startMapName },
      ]);
    case "mapLoaded":
      return mapLoaded(model, event.mapName, event.playerState);
    case "loadFailed":
      return done({ ...model, mode: { type: "error", message: event.message } }, [{ type: "render" }]);
    case "gameCommand":
      return gameCommand(model, event.command);
    case "verbPointer":
      return verbPointer(model, event.phase, event.hotspotIndex);
    case "dialoguePointer":
      return dialoguePointer(model, event.phase, event.optionSlot);
    case "playerCommandResult":
      return playerCommandResult(model, event.result, event.playerEntity, event.playerState);
  }
}

function mapLoaded(model: GameModel, mapName: string, playerState?: PlayerStateInput): GameTransition {
  return done({
    ...model,
    currentMapName: mapName,
    currentLevelEntryState: playerState === undefined ? undefined : clonePlayerStateInput(playerState),
    mode: { type: "playing" },
  }, [{ type: "ensureInput" }, { type: "render" }]);
}

function gameCommand(model: GameModel, command: GameCommand): GameTransition {
  const mode = model.mode;
  if (mode.type === "intermission") return intermissionCommand(model, mode, command);
  if (mode.type === "dialogue") return dialogueCommand(model, mode, command);
  if (mode.type === "verbMenu") return verbMenuCommand(model, mode, command);
  if (mode.type === "victory" || mode.type === "defeat") return outcomeCommand(model, mode.type, command);

  if (isPlayerCommand(command)) {
    if (mode.type !== "playing") return done(model);
    return done(model, [{ type: "runPlayerCommand", command }]);
  }

  switch (command.type) {
    case "action":
      if (model.mode.type !== "playing") return done(model);
      return done(openVerbMenu(model), [{ type: "render" }]);
    case "menu":
      return toggleMenu(model);
    case "pause":
      return togglePause(model);
    case "toggleView":
      return toggleView(model);
  }
}

function intermissionCommand(model: GameModel, mode: IntermissionMode, command: GameCommand): GameTransition {
  if (command.type !== "wait") return done(model);
  const playerState = clonePlayerStateInput(mode.playerState);
  return done(
    { ...model, mode: { type: "loading" } },
    [{ type: "render" }, { type: "loadMap", mapName: mode.goto, playerState }],
  );
}

function dialogueCommand(model: GameModel, mode: DialogueMode, command: GameCommand): GameTransition {
  if (command.type === "wait") return selectDialogueChoice(model, mode, 1);
  if (command.type === "selectWeapon") return selectDialogueChoice(model, mode, command.slot);
  return done(model);
}

function selectDialogueChoice(model: GameModel, mode: DialogueMode, slot: number): GameTransition {
  const choice = mode.choices[slot - 1];
  if (choice === undefined) return done(model);
  if (choice.next === undefined || mode.treeKey === undefined) return closeDialogue(model);

  const node = dialogueTreeNode(mode.treeKey, choice.next);
  return done({
    ...model,
    dialoguePointerDownSlot: undefined,
    mode: {
      type: "dialogue",
      title: mode.title,
      speaker: mode.speaker,
      treeKey: mode.treeKey,
      message: node.text,
      choices: node.choices,
    },
  }, [{ type: "render" }]);
}

function outcomeCommand(
  model: GameModel,
  outcome: "victory" | "defeat",
  command: GameCommand,
): GameTransition {
  if (command.type !== "wait") return done(model);

  const resetModel = {
    ...model,
    combatFeedback: [],
    mode: { type: "loading" },
  } satisfies GameModel;
  if (outcome === "victory") {
    return done(resetModel, [{ type: "render" }, { type: "loadMap", mapName: model.startMapName }]);
  }

  const playerState = model.currentLevelEntryState === undefined ?
    undefined :
    clonePlayerStateInput(model.currentLevelEntryState);
  return done(resetModel, [{ type: "render" }, { type: "loadMap", mapName: model.currentMapName, playerState }]);
}

function verbMenuCommand(model: GameModel, mode: VerbMenuMode, command: GameCommand): GameTransition {
  switch (command.type) {
    case "move":
      if (command.direction === "forward") {
        return done(selectVerb(model, (mode.selectedIndex - 1 + VERBS.length) % VERBS.length), [{ type: "render" }]);
      }
      if (command.direction === "backward") {
        return done(selectVerb(model, (mode.selectedIndex + 1) % VERBS.length), [{ type: "render" }]);
      }
      return done(model);
    case "wait":
    case "action":
      return confirmVerbSelection(model, mode);
    case "menu":
      return done({ ...model, verbPointerDownIndex: undefined, mode: { type: "playing" } }, [{ type: "render" }]);
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

function verbPointer(
  model: GameModel,
  phase: VerbPointerPhase,
  hotspotIndex: number | undefined,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "verbMenu") return done(model);

  switch (phase) {
    case "move":
      if (hotspotIndex !== undefined && hotspotIndex !== mode.selectedIndex) {
        return done(selectVerb(model, hotspotIndex), [{ type: "render" }]);
      }
      return done(model);
    case "down": {
      const downModel = { ...model, verbPointerDownIndex: hotspotIndex };
      if (hotspotIndex !== undefined && hotspotIndex !== mode.selectedIndex) {
        return done(selectVerb(downModel, hotspotIndex), [{ type: "render" }]);
      }
      return done(downModel);
    }
    case "up": {
      const downIndex = model.verbPointerDownIndex;
      const upModel = { ...model, verbPointerDownIndex: undefined };
      if (hotspotIndex === undefined) return done(upModel);

      const selectedMode = { type: "verbMenu", selectedIndex: hotspotIndex } satisfies VerbMenuMode;
      const selectedModel = { ...upModel, mode: selectedMode };
      if (downIndex === hotspotIndex) return confirmVerbSelection(selectedModel, selectedMode);
      return done(selectedModel, [{ type: "render" }]);
    }
    case "cancel":
      return done({ ...model, verbPointerDownIndex: undefined });
  }
}

function dialoguePointer(
  model: GameModel,
  phase: DialoguePointerPhase,
  optionSlot: number | undefined,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "dialogue") return done(model);

  switch (phase) {
    case "down":
      return done({ ...model, dialoguePointerDownSlot: optionSlot });
    case "up": {
      const downSlot = model.dialoguePointerDownSlot;
      const upModel = { ...model, dialoguePointerDownSlot: undefined };
      if (optionSlot !== undefined && downSlot === optionSlot) return selectDialogueChoice(upModel, mode, optionSlot);
      return done(upModel);
    }
    case "cancel":
      return done({ ...model, dialoguePointerDownSlot: undefined });
    case "move":
      return done(model);
  }
}

function playerCommandResult(
  model: GameModel,
  result: PlayerCommandResult,
  playerEntity: Entity,
  playerState: PlayerStateInput,
): GameTransition {
  const modelWithFeedback = applyCombatFeedback(model, playerEntity, result);
  if (result.outcome) {
    return done({ ...modelWithFeedback, mode: { type: result.outcome } }, [{ type: "render" }]);
  }
  if (result.mapChange) {
    return done(enterIntermission(modelWithFeedback, result.mapChange.goto, playerState), [{ type: "render" }]);
  }
  if (result.dialogue) {
    return done({
      ...modelWithFeedback,
      dialoguePointerDownSlot: undefined,
      mode: { type: "dialogue", ...result.dialogue },
    }, [{ type: "render" }]);
  }

  return done(modelWithFeedback, [{ type: "render" }]);
}

function toggleMenu(model: GameModel): GameTransition {
  switch (model.mode.type) {
    case "playing":
      return done({ ...model, mode: { type: "menu" } }, [{ type: "render" }]);
    case "menu":
      return done({ ...model, mode: { type: "playing" } }, [{ type: "render" }]);
    default:
      return done(model, [{ type: "render" }]);
  }
}

function toggleView(model: GameModel): GameTransition {
  const viewMode: ViewMode = model.viewMode === "firstPerson" ? "topDown" : "firstPerson";
  return done({ ...model, viewMode }, [{ type: "render" }]);
}

function togglePause(model: GameModel): GameTransition {
  switch (model.mode.type) {
    case "playing":
      return done({ ...model, mode: { type: "paused" } }, [{ type: "render" }]);
    case "paused":
      return done({ ...model, mode: { type: "playing" } }, [{ type: "render" }]);
    default:
      return done(model, [{ type: "render" }]);
  }
}

function openVerbMenu(model: GameModel): GameModel {
  return {
    ...model,
    dialoguePointerDownSlot: undefined,
    verbPointerDownIndex: undefined,
    mode: { type: "verbMenu", selectedIndex: model.lastVerbIndex },
  };
}

function selectVerb(model: GameModel, selectedIndex: number): GameModel {
  const mode = model.mode;
  if (mode.type === "verbMenu" && selectedIndex === mode.selectedIndex) return model;
  return { ...model, mode: { type: "verbMenu", selectedIndex } };
}

function confirmVerbSelection(model: GameModel, mode: VerbMenuMode): GameTransition {
  const selectedIndex = mode.selectedIndex;
  return done({
    ...model,
    dialoguePointerDownSlot: undefined,
    verbPointerDownIndex: undefined,
    lastVerbIndex: selectedIndex,
    mode: { type: "playing" },
  }, [{ type: "runPlayerCommand", command: verbToCommand(selectedIndex) }]);
}

function closeDialogue(model: GameModel): GameTransition {
  return done({
    ...model,
    dialoguePointerDownSlot: undefined,
    mode: { type: "playing" },
  }, [{ type: "render" }]);
}

function applyCombatFeedback(
  model: GameModel,
  playerEntity: Entity,
  result: PlayerCommandResult,
): GameModel {
  return {
    ...model,
    combatFeedback: combatFeedbackForEvents(playerEntity, result.events),
  };
}

function enterIntermission(model: GameModel, goto: string, playerState: PlayerStateInput): GameModel {
  return {
    ...model,
    mode: {
      type: "intermission",
      message: `Entering ${goto}. Space to continue.`,
      goto,
      playerState: clonePlayerStateInput(playerState),
    },
  };
}

function clonePlayerStateInput(playerState: PlayerStateInput): PlayerStateInput {
  return {
    ...(playerState.heldKeys === undefined ? {} : { heldKeys: [...playerState.heldKeys] }),
    ...(playerState.selectedWeapon === undefined ? {} : { selectedWeapon: playerState.selectedWeapon }),
    ...(playerState.unlockedWeapons === undefined ? {} : { unlockedWeapons: [...playerState.unlockedWeapons] }),
    ...(playerState.ammo === undefined ? {} : { ammo: { ...playerState.ammo } }),
    ...(playerState.health === undefined ? {} : { health: { ...playerState.health } }),
    ...(playerState.hasUplinkCode === undefined ? {} : { hasUplinkCode: playerState.hasUplinkCode }),
    ...(playerState.progress === undefined ? {} : { progress: { ...playerState.progress } }),
    ...(playerState.turnEffects === undefined ?
      {} :
      { turnEffects: playerState.turnEffects.map((effect) => ({ ...effect })) }),
  };
}

function done(model: GameModel, effects: readonly GameEffect[] = []): GameTransition {
  return { model, effects };
}
