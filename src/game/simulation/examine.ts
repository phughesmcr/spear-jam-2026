import { readComponent } from "@/src/game/simulation/components.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import type { GameEvent } from "@/src/game/model/events.ts";
import { examineText, examineTextIdForCode } from "@/src/game/content/examine_text.ts";
import { displayNameForCode, displayNameText } from "@/src/game/content/names.ts";
import type { Entity } from "turn-based-engine/ecs";

export function examineEntity(runtime: GameRuntime, target: Entity | undefined): GameEvent {
  return {
    type: "examined",
    entity: target,
    text: resolvedExamineText(runtime, target),
  };
}

function resolvedExamineText(runtime: GameRuntime, target: Entity | undefined): string {
  if (target === undefined) return "Nothing of interest here.";

  const examineTextCode = readComponent(runtime.game, target, "ExamineTextRef")?.examineTextId;
  const text = examineTextCode === undefined ? undefined : examineText(examineTextIdForCode(examineTextCode));
  if (text !== undefined) return text;

  const displayNameCode = readComponent(runtime.game, target, "DisplayName")?.displayName;
  if (displayNameCode !== undefined) return `It's a ${displayNameText(displayNameForCode(displayNameCode))}.`;

  return "Nothing of interest here.";
}
