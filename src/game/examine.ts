import type { Entity, World } from "@phughesmcr/miski";
import { DisplayNameComponent, Examine } from "@/src/ecs/components.ts";
import { examineText } from "@/src/game/examine_content.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { displayNameText } from "@/src/game/names.ts";

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

  const examine = world.components.readEntityData(Examine, target);
  const text = examine === undefined ? undefined : examineText(examine.examineTextId);
  if (text !== undefined) return text;

  const displayName = world.components.readEntityData(DisplayNameComponent, target)?.displayName;
  if (displayName !== undefined) return `It's a ${displayNameText(displayName)}.`;

  return "Nothing of interest here.";
}
