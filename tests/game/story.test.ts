import { assertEquals, assertThrows } from "@std/assert";
import {
  storyEventDefinition,
  StoryEventId,
  storyEventIdFor,
  StoryFlag,
  storyPathDestination,
  StoryPathId,
  storyPathIdFor,
  StoryTargetId,
  storyTargetIdFor,
} from "@/src/game/story.ts";

Deno.test("storyEventDefinition resolves John spoken into a one-shot move action", () => {
  assertEquals(storyEventDefinition(StoryEventId.JohnSpoken), {
    flag: StoryFlag.JohnSpoken,
    actions: [{
      type: "moveEntity",
      target: StoryTargetId.John,
      path: StoryPathId.JohnAfterIntro,
    }],
  });
  assertEquals(storyPathDestination(StoryPathId.JohnAfterIntro), { x: 1, y: 3 });
});

Deno.test("story id mappers reject unknown authoring ids", () => {
  assertEquals(storyEventIdFor("johnSpoken", "npc onTalkEvent"), StoryEventId.JohnSpoken);
  assertEquals(storyTargetIdFor("john", "npc storyId"), StoryTargetId.John);
  assertEquals(storyPathIdFor("johnAfterIntro", "story path"), StoryPathId.JohnAfterIntro);

  assertThrows(
    () => storyEventIdFor("missing", "npc onTalkEvent"),
    Error,
    'npc onTalkEvent: Unknown story event "missing".',
  );
  assertThrows(() => storyTargetIdFor("missing", "npc storyId"), Error, 'npc storyId: Unknown story target "missing".');
  assertThrows(() => storyPathIdFor("missing", "story path"), Error, 'story path: Unknown story path "missing".');
});
