import type { Entity } from "turn-based-engine/ecs";
import { readComponent } from "@/src/ecs/components.ts";
import type { GameRuntime } from "@/src/ecs/runtime.ts";
import { examineText, examineTextIdForCode } from "@/src/game/examine_content.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { displayNameForCode, displayNameText } from "@/src/game/names.ts";

export { examineText, ExamineTextId } from "@/src/game/examine_content.ts";

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
