import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  maskHasStoryFlag,
  maskWithStoryFlag,
  STORY_EVENT_IDS,
  STORY_TARGET_IDS,
  StoryEventId,
  StoryFlag,
  storyFlagsFromMask,
  storyFlagsToMask,
  StoryTargetId,
} from "@/src/game/content/story.ts";

Deno.test("story vocabulary preserves event and target code order", () => {
  assertEquals(STORY_EVENT_IDS, [StoryEventId.JohnSpoken]);
  assertEquals(STORY_TARGET_IDS, [StoryTargetId.John]);
});

Deno.test("story flag helpers preserve compact bit-mask state", () => {
  const mask = maskWithStoryFlag(0, StoryFlag.JohnSpoken);
  assertEquals(mask, 1);
  assertEquals(maskHasStoryFlag(mask, StoryFlag.JohnSpoken), true);
  assertEquals(storyFlagsToMask([StoryFlag.JohnSpoken]), mask);
  assertEquals(storyFlagsFromMask(mask), [StoryFlag.JohnSpoken]);
});

Deno.test("story event vocabulary is runtime-immutable and preserves flag bit identity", () => {
  const event = STORY_EVENT_IDS[0]!;
  const mask = storyFlagsToMask([event]);

  assertEquals(mask, 1);
  assert(Object.isFrozen(STORY_EVENT_IDS));
  assertThrows(() => {
    (STORY_EVENT_IDS as unknown as string[])[0] = "changed";
  }, TypeError);

  assertEquals(storyFlagsToMask([event]), mask);
  assertEquals(storyFlagsFromMask(mask), [event]);
});
