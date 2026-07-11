import { hasComponent } from "@/src/ecs/components.ts";
import { createNpc, createPlayer } from "@/src/ecs/prefabs.ts";
import { playerHasStoryFlag } from "@/src/ecs/progression.ts";
import { createRuntime } from "@/src/ecs/runtime.ts";
import { applyEvent } from "@/src/ecs/session/story_actions.ts";
import { DisplayName } from "@/src/game/names.ts";
import { StoryEventId, StoryFlag, StoryTargetId } from "@/src/game/story.ts";
import { Direction } from "@/src/grid/direction.ts";
import { flatTestMap } from "@/tests/ecs/helpers.ts";
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
  runtime.game.removeComponentFromEntity(player, runtime.game.components.StoryFlags);

  assertThrows(() => applyEvent(runtime, player, StoryEventId.JohnSpoken, 100));

  assertEquals(runtime.crawler.entityPosition(john), { x: 2, y: 1 });
  assertEquals(playerHasStoryFlag(runtime.game, player, StoryFlag.JohnSpoken), false);
  assertEquals(hasComponent(runtime.game, john, "SpriteAnimation"), false);
  runtime.crawler.assertInvariants();
});
