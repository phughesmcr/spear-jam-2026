import { readComponent } from "@/src/game/simulation/components.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import type { GameEvent } from "@/src/game/model/events.ts";
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

  const examineTextCode = readComponent(runtime.simulation.ecs, target, "ExamineTextRef")?.examineTextId;
  const text = examineTextCode === undefined ?
    undefined :
    runtime.content.simulation.examineTextForCode(examineTextCode);
  if (text !== undefined) return text;

  const displayNameCode = readComponent(runtime.simulation.ecs, target, "DisplayName")?.displayName;
  if (displayNameCode !== undefined) {
    return `It's a ${runtime.content.simulation.displayNameForCode(displayNameCode).text}.`;
  }

  return "Nothing of interest here.";
}
