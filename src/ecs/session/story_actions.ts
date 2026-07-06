import type { Entity, World } from "@phughesmcr/miski";
import { OnTalkEvent, SpriteAnimationKind, StoryTarget } from "@/src/ecs/components.ts";
import type { SpriteAnimationSchema } from "@/src/ecs/components.ts";
import { addPlayerStoryFlag, playerHasStoryFlag } from "@/src/ecs/progression.ts";
import { mapScopedQuery } from "@/src/ecs/queries.ts";
import type { SpatialIndex } from "@/src/ecs/spatial.ts";
import {
  type StoryAction,
  storyEventDefinition,
  storyEventForCode,
  type StoryEventId,
  storyTargetForCode,
} from "@/src/game/story.ts";

const STORY_MOVE_MS = 260;

type AnimationWriter = (entity: Entity, animation: SpriteAnimationSchema) => void;

export function queueTalkEvent(
  world: World,
  playerEntity: Entity,
  target: Entity | undefined,
): StoryEventId | undefined {
  if (target === undefined) return undefined;

  const eventCode = world.components.readEntityData(OnTalkEvent, target)?.onTalkEvent;
  if (eventCode === undefined) return undefined;

  const event = storyEventForCode(eventCode);
  const definition = storyEventDefinition(event);
  return playerHasStoryFlag(world, playerEntity, definition.flag) ? undefined : event;
}

export function applyEvent(
  world: World,
  playerEntity: Entity,
  spatial: SpatialIndex,
  event: StoryEventId,
  nowMs: number,
  writeAnimation: AnimationWriter,
): boolean {
  const definition = storyEventDefinition(event);
  if (playerHasStoryFlag(world, playerEntity, definition.flag)) return false;
  if (!canApplyActions(world, spatial, definition.actions)) return false;

  for (const action of definition.actions) {
    switch (action.type) {
      case "moveEntity": {
        const target = targetEntity(world, action.target);
        if (target === undefined) return false;
        spatial.moveEntity(target, action.destination);
        writeAnimation(target, {
          kind: SpriteAnimationKind.Walk,
          startedAtMs: nowMs,
          durationMs: STORY_MOVE_MS,
        });
        break;
      }
    }
  }

  addPlayerStoryFlag(world, playerEntity, definition.flag);
  world.refresh();
  return true;
}

export function assertUniqueTargets(world: World): void {
  const seen = new Set<string>();
  for (const entity of world.entities.query(mapScopedQuery)) {
    const storyCode = world.components.readEntityData(StoryTarget, entity)?.storyId;
    if (storyCode === undefined) continue;
    const storyId = storyTargetForCode(storyCode);
    if (seen.has(storyId)) throw new Error(`Duplicate story target "${storyId}".`);
    seen.add(storyId);
  }
}

function canApplyActions(world: World, spatial: SpatialIndex, actions: readonly StoryAction[]): boolean {
  for (const action of actions) {
    switch (action.type) {
      case "moveEntity": {
        const target = targetEntity(world, action.target);
        if (target === undefined) return false;

        const destination = action.destination;
        if (spatial.tileBlocks(destination.x, destination.y)) return false;

        const blocker = spatial.blockingEntityAt(destination.x, destination.y);
        if (blocker !== undefined && blocker !== target) return false;
        break;
      }
    }
  }
  return true;
}

function targetEntity(world: World, targetId: StoryAction["target"]): Entity | undefined {
  for (const entity of world.entities.query(mapScopedQuery)) {
    if (!world.entities.isActive(entity)) continue;
    const storyCode = world.components.readEntityData(StoryTarget, entity)?.storyId;
    if (storyCode !== undefined && storyTargetForCode(storyCode) === targetId) return entity;
  }
  return undefined;
}
