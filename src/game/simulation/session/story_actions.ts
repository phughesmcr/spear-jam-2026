import { readComponent } from "@/src/game/simulation/components.ts";
import { SpriteAnimationKind } from "@/src/game/model/render_snapshot.ts";
import { playerHasStoryFlag } from "@/src/game/simulation/progression.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import {
  maskWithStoryFlag,
  type StoryAction,
  storyEventDefinition,
  storyEventForCode,
  type StoryEventId,
  storyTargetForCode,
} from "@/src/game/content/story.ts";
import { TerrainBlock } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";

const STORY_MOVE_MS = 260;

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
): boolean {
  const definition = storyEventDefinition(event);
  if (playerHasStoryFlag(runtime.game, player, definition.flag)) return false;
  const actions = resolveActions(runtime, definition.actions);
  if (actions === undefined) return false;
  const storyFlags = readComponent(runtime.game, player, "StoryFlags")?.mask ?? 0;
  runtime.crawler.transaction((mutation) => {
    for (const { action, target } of actions) {
      mutation.teleport(target, action.destination.x, action.destination.y);
      const animation = { kind: SpriteAnimationKind.Walk, startedAtMs: nowMs, durationMs: STORY_MOVE_MS };
      if (runtime.game.entityHasComponent(target, runtime.game.components.SpriteAnimation)) {
        mutation.patchComponent(target, runtime.game.components.SpriteAnimation, animation);
      } else {
        mutation.addComponent(target, runtime.game.components.SpriteAnimation, animation);
      }
    }
    mutation.patchComponent(player, runtime.game.components.StoryFlags, {
      mask: maskWithStoryFlag(storyFlags, definition.flag),
    });
  });
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

function resolveActions(
  runtime: GameRuntime,
  actions: readonly StoryAction[],
): readonly { readonly action: StoryAction; readonly target: Entity }[] | undefined {
  const resolved: { action: StoryAction; target: Entity }[] = [];
  for (const action of actions) {
    const target = targetEntity(runtime, action.target);
    if (target === undefined) return undefined;
    const blocker = runtime.crawler.entityAt(action.destination.x, action.destination.y, TerrainBlock.Movement);
    if (
      runtime.crawler.blocksAt(action.destination.x, action.destination.y, TerrainBlock.Movement) && blocker !== target
    ) return undefined;
    resolved.push({ action, target });
  }
  return resolved;
}

function targetEntity(runtime: GameRuntime, targetId: StoryAction["target"]): Entity | undefined {
  let result: Entity | undefined;
  runtime.game.query(runtime.game.components.StoryTarget).forEach((entity, slot) => {
    if (storyTargetForCode(runtime.game.storage.StoryTarget.getAt(slot, "storyId")) === targetId) result = entity;
  });
  return result;
}
