import type { Entity } from "@phughesmcr/miski";
import { entityContent, type EntityContentStore } from "@/src/ecs/entity_content.ts";
import { examineText } from "@/src/game/examine_content.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { displayNameText } from "@/src/game/names.ts";

export { examineText, ExamineTextId } from "@/src/game/examine_content.ts";

export function examineEntity(contentStore: EntityContentStore, target: Entity | undefined): GameEvent {
  return {
    type: "examined",
    entity: target,
    text: resolvedExamineText(contentStore, target),
  };
}

function resolvedExamineText(contentStore: EntityContentStore, target: Entity | undefined): string {
  if (target === undefined) return "Nothing of interest here.";

  const content = entityContent(contentStore, target);
  const text = content?.examineTextId === undefined ? undefined : examineText(content.examineTextId);
  if (text !== undefined) return text;

  const displayName = content?.displayName;
  if (displayName !== undefined) return `It's a ${displayNameText(displayName)}.`;

  return "Nothing of interest here.";
}
