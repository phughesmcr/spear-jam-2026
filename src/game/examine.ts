import type { Entity, World } from "@phughesmcr/miski";
import { DisplayNameComponent, ExamineTextRef } from "@/src/ecs/components.ts";
import { examineText, examineTextIdForCode } from "@/src/game/examine_content.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { displayNameForCode, displayNameText } from "@/src/game/names.ts";

export { examineText, ExamineTextId } from "@/src/game/examine_content.ts";

export function examineEntity(world: World, target: Entity | undefined): GameEvent {
  return {
    type: "examined",
    entity: target,
    text: resolvedExamineText(world, target),
  };
}

function resolvedExamineText(world: World, target: Entity | undefined): string {
  if (target === undefined) return "Nothing of interest here.";

  const examineTextCode = world.components.readEntityData(ExamineTextRef, target)?.examineTextId;
  const text = examineTextCode === undefined ? undefined : examineText(examineTextIdForCode(examineTextCode));
  if (text !== undefined) return text;

  const displayNameCode = world.components.readEntityData(DisplayNameComponent, target)?.displayName;
  if (displayNameCode !== undefined) return `It's a ${displayNameText(displayNameForCode(displayNameCode))}.`;

  return "Nothing of interest here.";
}
