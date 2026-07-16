export const StoryEventId = {
  JohnSpoken: "johnSpoken",
} as const;
export type StoryEventId = (typeof StoryEventId)[keyof typeof StoryEventId];

export const StoryFlag = StoryEventId;
export type StoryFlag = (typeof StoryFlag)[keyof typeof StoryFlag];

export const StoryTargetId = {
  John: "john",
} as const;
export type StoryTargetId = (typeof StoryTargetId)[keyof typeof StoryTargetId];

/** Persisted story-event codes are one-based positions in this append-only list. */
export const STORY_EVENT_IDS = Object.freeze(
  [StoryEventId.JohnSpoken] as const satisfies readonly StoryEventId[],
);

/** Persisted story-target codes are one-based positions in this append-only list. */
export const STORY_TARGET_IDS = Object.freeze(
  [StoryTargetId.John] as const satisfies readonly StoryTargetId[],
);

type StoryDestination = {
  readonly x: number;
  readonly y: number;
};

export type StoryAction = {
  readonly type: "moveEntity";
  readonly target: StoryTargetId;
  readonly destination: StoryDestination;
};

export type StoryEventDefinition = {
  readonly flag: StoryFlag;
  readonly actions: readonly StoryAction[];
};

export function maskHasStoryFlag(mask: number, flag: StoryFlag): boolean {
  return (mask & storyFlagBit(flag)) !== 0;
}

export function maskWithStoryFlag(mask: number, flag: StoryFlag): number {
  return (mask | storyFlagBit(flag)) >>> 0;
}

export function storyFlagsToMask(flags: Iterable<StoryFlag>): number {
  let mask = 0;
  for (const flag of flags) mask |= storyFlagBit(flag);
  return mask >>> 0;
}

export function storyFlagsFromMask(mask: number): readonly StoryFlag[] {
  return STORY_EVENT_IDS.filter((flag) => (mask & storyFlagBit(flag)) !== 0);
}

function storyFlagBit(flag: StoryFlag): number {
  const index = STORY_EVENT_IDS.indexOf(flag);
  if (index < 0) throw new Error(`Unknown story flag "${flag}".`);
  return 1 << index;
}
