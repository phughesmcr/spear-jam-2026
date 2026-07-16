import { hasComponent } from "@/src/game/simulation/components.ts";
import { playerHasStoryFlag } from "@/src/game/simulation/progression.ts";
import { createNpc, createPlayer, createRuntime } from "@/tests/game/simulation/helpers.ts";
import { applyEvent } from "@/src/game/simulation/session/story_actions.ts";
import { DisplayName } from "@/src/game/content/names.ts";
import { StoryEventId, StoryFlag, StoryTargetId } from "@/src/game/content/story.ts";
import { Direction } from "@/src/game/world/direction.ts";
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
  runtime.game.removeComponentFromEntity(player, runtime.game.components.StoryFlags);

  assertThrows(() => applyEvent(runtime, player, StoryEventId.JohnSpoken, 100));

  assertEquals(runtime.crawler.entityPosition(john), { x: 2, y: 1 });
  assertEquals(playerHasStoryFlag(runtime.game, player, StoryFlag.JohnSpoken), false);
  assertEquals(hasComponent(runtime.game, john, "SpriteAnimation"), false);
  runtime.crawler.assertInvariants();
});
