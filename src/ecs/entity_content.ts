import type { Entity } from "@phughesmcr/miski";
import type { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import type { ExamineTextId } from "@/src/game/examine_content.ts";
import type { DisplayName } from "@/src/game/names.ts";
import type { StoryEventId, StoryTargetId } from "@/src/game/story.ts";

export type EntityContent = {
  readonly displayName?: DisplayName;
  readonly dialogueTreeId?: DialogueTreeId;
  readonly examineTextId?: ExamineTextId;
  readonly storyId?: StoryTargetId;
  readonly onTalkEvent?: StoryEventId;
  readonly terminalDestination?: string;
};

export type EntityContentStore = Map<Entity, EntityContent>;

export function createEntityContentStore(): EntityContentStore {
  return new Map();
}

export function setEntityContent(store: EntityContentStore, entity: Entity, content: EntityContent): void {
  const normalized = Object.fromEntries(
    Object.entries(content).filter((entry) => entry[1] !== undefined),
  ) as EntityContent;
  if (Object.keys(normalized).length === 0) {
    removeEntityContent(store, entity);
    return;
  }
  store.set(entity, normalized);
}

export function removeEntityContent(store: EntityContentStore, entity: Entity): void {
  store.delete(entity);
}

export function entityContent(store: EntityContentStore, entity: Entity): EntityContent | undefined {
  return store.get(entity);
}
