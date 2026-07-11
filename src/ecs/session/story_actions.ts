import { readComponent, SpriteAnimationKind } from "@/src/ecs/components.ts";
import type { SpriteAnimationSchema } from "@/src/ecs/components.ts";
import { addPlayerStoryFlag, playerHasStoryFlag } from "@/src/ecs/progression.ts";
import type { GameRuntime } from "@/src/ecs/runtime.ts";
import {
  type StoryAction,
  storyEventDefinition,
  storyEventForCode,
  type StoryEventId,
  storyTargetForCode,
} from "@/src/game/story.ts";
import { TerrainBlock } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";

const STORY_MOVE_MS = 260;
type AnimationWriter = (entity: Entity, animation: SpriteAnimationSchema) => void;

export function queueTalkEvent(
  runtime: GameRuntime,
  player: Entity,
  target: Entity | undefined,
): StoryEventId | undefined {
  if (target === undefined) return undefined;
  const code = readComponent(runtime.game, target, "OnTalkEvent")?.onTalkEvent;
  if (code === undefined) return undefined;
  const event = storyEventForCode(code);
  return playerHasStoryFlag(runtime.game, player, storyEventDefinition(event).flag) ? undefined : event;
}

export function applyEvent(
  runtime: GameRuntime,
  player: Entity,
  event: StoryEventId,
  nowMs: number,
  writeAnimation: AnimationWriter,
): boolean {
  const definition = storyEventDefinition(event);
  if (playerHasStoryFlag(runtime.game, player, definition.flag) || !canApplyActions(runtime, definition.actions)) {
    return false;
  }
  for (const action of definition.actions) {
    const target = targetEntity(runtime, action.target);
    if (target === undefined) return false;
    runtime.crawler.teleport(target, action.destination.x, action.destination.y);
    writeAnimation(target, { kind: SpriteAnimationKind.Walk, startedAtMs: nowMs, durationMs: STORY_MOVE_MS });
  }
  addPlayerStoryFlag(runtime.game, player, definition.flag);
  runtime.crawler.assertInvariants();
  return true;
}

export function assertUniqueTargets(runtime: GameRuntime): void {
  const seen = new Set<string>();
  const query = runtime.game.query(runtime.game.components.StoryTarget);
  query.forEach((_entity, slot) => {
    const id = storyTargetForCode(runtime.game.storage.StoryTarget.getAt(slot, "storyId"));
    if (seen.has(id)) throw new Error(`Duplicate story target "${id}".`);
    seen.add(id);
  });
}

function canApplyActions(runtime: GameRuntime, actions: readonly StoryAction[]): boolean {
  for (const action of actions) {
    const target = targetEntity(runtime, action.target);
    if (target === undefined) return false;
    const blocker = runtime.crawler.entityAt(action.destination.x, action.destination.y, TerrainBlock.Movement);
    if (
      runtime.crawler.blocksAt(action.destination.x, action.destination.y, TerrainBlock.Movement) && blocker !== target
    ) return false;
  }
  return true;
}

function targetEntity(runtime: GameRuntime, targetId: StoryAction["target"]): Entity | undefined {
  let result: Entity | undefined;
  runtime.game.query(runtime.game.components.StoryTarget).forEach((entity, slot) => {
    if (storyTargetForCode(runtime.game.storage.StoryTarget.getAt(slot, "storyId")) === targetId) result = entity;
  });
  return result;
}
