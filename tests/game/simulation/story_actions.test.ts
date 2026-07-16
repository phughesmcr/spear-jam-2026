import { playerHasStoryFlag } from "@/src/game/simulation/progression.ts";
import { createNpc, createPlayer, createRuntime } from "@/tests/game/simulation/helpers.ts";
import { applyEvent } from "@/src/game/simulation/session/story_actions.ts";
import { DisplayName } from "@/src/game/content/names.ts";
import { StoryEventId, StoryFlag, StoryTargetId } from "@/src/game/content/story.ts";
import { Direction } from "turn-based-engine/crawler";
import { flatTestMap } from "@/tests/game/simulation/helpers.ts";
import { assertEquals, assertThrows } from "@std/assert";

Deno.test("a rejected story flag update rolls back story movement", () => {
  const runtime = createRuntime(flatTestMap(5, 5));
  const player = createPlayer(runtime, { x: 1, y: 1, dir: Direction.East });
  const john = createNpc(runtime, {
    x: 2,
    y: 1,
    dir: Direction.South,
    displayName: DisplayName.John,
    storyId: StoryTargetId.John,
  });
  runtime.simulation.mutateAtomically(({ mutation }) => {
    mutation.removeComponent(player, runtime.simulation.ecs.components.StoryFlags);
  });

  assertThrows(() => applyEvent(runtime, player, StoryEventId.JohnSpoken));

  assertEquals(runtime.simulation.crawler.entityPosition(john), { x: 2, y: 1 });
  assertEquals(playerHasStoryFlag(runtime.simulation.ecs, player, StoryFlag.JohnSpoken), false);
  runtime.simulation.crawler.assertInvariants();
});
