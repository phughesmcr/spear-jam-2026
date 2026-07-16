import { readComponent } from "@/src/game/simulation/components.ts";
import { playerHasStoryFlag } from "@/src/game/simulation/progression.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import { maskWithStoryFlag, type StoryAction, type StoryEventId } from "@/src/game/content/story.ts";
import { type CrawlerCoreEvent, TerrainBlock } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";

export type StoryEventApplication = {
  readonly applied: boolean;
  readonly coreEvents: readonly CrawlerCoreEvent[];
};

export function queueTalkEvent(
  runtime: GameRuntime,
  player: Entity,
  target: Entity | undefined,
): StoryEventId | undefined {
  if (target === undefined) return undefined;
  const code = readComponent(runtime.simulation.ecs, target, "OnTalkEvent")?.onTalkEvent;
  if (code === undefined) return undefined;
  const event = runtime.content.simulation.storyEventForCode(code);
  return playerHasStoryFlag(runtime.simulation.ecs, player, runtime.content.simulation.storyEvent(event).flag) ?
    undefined :
    event;
}

export function applyEvent(
  runtime: GameRuntime,
  player: Entity,
  event: StoryEventId,
): StoryEventApplication {
  const definition = runtime.content.simulation.storyEvent(event);
  if (playerHasStoryFlag(runtime.simulation.ecs, player, definition.flag)) return { applied: false, coreEvents: [] };
  const actions = resolveActions(runtime, definition.actions);
  if (actions === undefined) return { applied: false, coreEvents: [] };
  const storyFlags = readComponent(runtime.simulation.ecs, player, "StoryFlags")?.mask ?? 0;
  const result = runtime.simulation.executeTurn(({ mutation }) => {
    for (const { action, target } of actions) {
      mutation.teleport(target, action.destination.x, action.destination.y);
    }
    mutation.patchComponent(player, runtime.simulation.ecs.components.StoryFlags, {
      mask: maskWithStoryFlag(storyFlags, definition.flag),
    });
  });
  runtime.simulation.crawler.assertInvariants();
  return { applied: true, coreEvents: result.coreEvents };
}

export function assertUniqueTargets(runtime: GameRuntime): void {
  const seen = new Set<string>();
  const query = runtime.simulation.ecs.query(runtime.simulation.ecs.components.StoryTarget);
  query.forEach((_entity, slot) => {
    const id = runtime.content.simulation.storyTargetForCode(
      runtime.simulation.ecs.storage.StoryTarget.getAt(slot, "storyId"),
    );
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
    const blocker = runtime.simulation.crawler.entityAt(
      action.destination.x,
      action.destination.y,
      TerrainBlock.Movement,
    );
    if (
      runtime.simulation.crawler.blocksAt(action.destination.x, action.destination.y, TerrainBlock.Movement) &&
      blocker !== target
    ) return undefined;
    resolved.push({ action, target });
  }
  return resolved;
}

function targetEntity(runtime: GameRuntime, targetId: StoryAction["target"]): Entity | undefined {
  let result: Entity | undefined;
  runtime.simulation.ecs.query(runtime.simulation.ecs.components.StoryTarget).forEach((entity, slot) => {
    if (
      runtime.content.simulation.storyTargetForCode(
        runtime.simulation.ecs.storage.StoryTarget.getAt(slot, "storyId"),
      ) ===
        targetId
    ) {
      result = entity;
    }
  });
  return result;
}
