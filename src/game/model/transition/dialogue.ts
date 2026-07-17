import type { DialogueContent } from "@/src/game/content/catalog.ts";
import type { VoiceId } from "@/src/game/content/dialogue/voices.ts";
import type { GameCommand } from "@/src/game/model/commands.ts";
import type { GameMode } from "@/src/game/model/state.ts";
import type { GameEffect, GameModel, GameTransition } from "@/src/game/model/transition/contracts.ts";
import { dispatchCommand, done, pointerGesture } from "@/src/game/model/transition/result.ts";
import type { PointerPhase } from "turn-based-web-engine/input";

type DialogueMode = Extract<GameMode, { readonly type: "dialogue" }>;

export function dialogueCommand(
  content: DialogueContent,
  model: GameModel,
  mode: DialogueMode,
  command: GameCommand,
): GameTransition {
  return dispatchCommand(model, command, {
    wait: () => selectDialogueChoice(content, model, mode, 1),
    selectWeapon: (select) => selectDialogueChoice(content, model, mode, select.slot),
  });
}

export function dialoguePointer(
  content: DialogueContent,
  model: GameModel,
  phase: PointerPhase,
  optionSlot: number | undefined,
): GameTransition {
  const mode = model.mode;
  if (mode.type !== "dialogue") return done(model);

  return pointerGesture(model, phase, {
    down: () => {
      const downMode = optionSlot === undefined ?
        withoutDialoguePointerDown(mode) :
        { ...mode, pointerDownSlot: optionSlot };
      return done({ ...model, mode: downMode });
    },
    up: () => {
      const downSlot = mode.pointerDownSlot;
      const upMode = withoutDialoguePointerDown(mode);
      const upModel = { ...model, mode: upMode };
      if (optionSlot !== undefined && downSlot === optionSlot) {
        return selectDialogueChoice(content, upModel, upMode, optionSlot);
      }
      return done(upModel);
    },
    cancel: () => done({ ...model, mode: withoutDialoguePointerDown(mode) }),
  });
}

export function dialogueRenderEffects(
  previousVoice: VoiceId | undefined,
  voice: VoiceId | undefined,
): readonly GameEffect[] {
  if (previousVoice === voice) return [{ type: "render" }];
  const voiceEffect: GameEffect = voice === undefined ?
    { type: "setDialogueVoice" } :
    { type: "setDialogueVoice", voice };
  return [voiceEffect, { type: "render" }];
}

function selectDialogueChoice(
  content: DialogueContent,
  model: GameModel,
  mode: DialogueMode,
  slot: number,
): GameTransition {
  const choice = mode.choices[slot - 1];
  if (choice === undefined) return done(model);
  if (choice.next === undefined || mode.treeKey === undefined) return closeDialogue(model);

  const node = content.node(mode.treeKey, choice.next);
  return done({
    ...model,
    mode: {
      type: "dialogue",
      title: mode.title,
      ...(mode.art === undefined ? {} : { art: mode.art }),
      speaker: mode.speaker,
      treeKey: mode.treeKey,
      message: node.text,
      ...(node.voice === undefined ? {} : { voice: node.voice }),
      choices: node.choices,
    },
  }, dialogueRenderEffects(mode.voice, node.voice));
}

function closeDialogue(model: GameModel): GameTransition {
  const voice = model.mode.type === "dialogue" ? model.mode.voice : undefined;
  const effects: readonly GameEffect[] = voice === undefined ?
    [{ type: "closeDialogue" }, { type: "render" }] :
    [{ type: "setDialogueVoice" }, { type: "closeDialogue" }, { type: "render" }];
  return done({ ...model, mode: { type: "playing" } }, effects);
}

function withoutDialoguePointerDown(mode: DialogueMode): DialogueMode {
  if (mode.pointerDownSlot === undefined) return mode;
  const { pointerDownSlot: _, ...rest } = mode;
  return rest;
}
