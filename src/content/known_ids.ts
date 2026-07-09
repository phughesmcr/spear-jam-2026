// Single downstream coupling point for the content modules whose ids are validated during
// map authoring. The map schema (entity_content), the Tiled catalog, and the map compiler all
// need the same "known id" lists to reject unknown authored values; importing the underlying
// content modules here (instead of in each consumer) keeps that fan-in to one place.
import { ENEMY_ARCHETYPE_AUTHORING_KEYS, type EnemyArchetypeAuthoringKey } from "@/src/content/enemies.ts";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import { ExamineTextId } from "@/src/game/examine_content.ts";
import { DisplayName } from "@/src/game/names.ts";
import { AMBIENT_SOUND_IDS, type AmbientSoundId, type SoundId } from "@/src/game/sound.ts";
import { StoryEventId, StoryTargetId } from "@/src/game/story.ts";

export { AMBIENT_SOUND_IDS, ENEMY_ARCHETYPE_AUTHORING_KEYS };
export type {
  AmbientSoundId,
  DialogueTreeId,
  DisplayName,
  EnemyArchetypeAuthoringKey,
  ExamineTextId,
  SoundId,
  StoryEventId,
  StoryTargetId,
};

// The content enums map each PascalCase key to its lowerFirst authoring value, so `Object.values`
// yields exactly the authoring-facing ids used for both schema validation and Tiled enum options.
export const KNOWN_DISPLAY_NAMES: readonly DisplayName[] = Object.values(DisplayName);
export const KNOWN_DIALOGUE_TREE_IDS: readonly DialogueTreeId[] = Object.values(DialogueTreeId);
export const KNOWN_EXAMINE_TEXT_IDS: readonly ExamineTextId[] = Object.values(ExamineTextId);
export const KNOWN_STORY_TARGET_IDS: readonly StoryTargetId[] = Object.values(StoryTargetId);
export const KNOWN_STORY_EVENT_IDS: readonly StoryEventId[] = Object.values(StoryEventId);
