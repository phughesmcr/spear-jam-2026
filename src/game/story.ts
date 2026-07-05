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

const STORY_EVENT_DEFINITIONS: Readonly<Record<StoryEventId, StoryEventDefinition>> = {
  [StoryEventId.JohnSpoken]: {
    flag: StoryFlag.JohnSpoken,
    actions: [{
      type: "moveEntity",
      target: StoryTargetId.John,
      destination: { x: 1, y: 3 },
    }],
  },
};

const STORY_FLAG_ORDER: readonly StoryFlag[] = [
  StoryFlag.JohnSpoken,
];

const STORY_EVENT_IDS: readonly StoryEventId[] = Object.values(StoryEventId);
const STORY_TARGET_IDS: readonly StoryTargetId[] = Object.values(StoryTargetId);

const JOHN_SPOKEN_EVENT_CODE = 1;
const JOHN_TARGET_CODE = 1;

export function storyEventDefinition(event: StoryEventId): StoryEventDefinition {
  return STORY_EVENT_DEFINITIONS[event];
}

export function normalizeStoryFlags(flags: readonly StoryFlag[] = []): readonly StoryFlag[] {
  const input = new Set(flags);
  return STORY_FLAG_ORDER.filter((flag) => input.has(flag));
}

export function storyEventCode(_event: StoryEventId): number {
  return JOHN_SPOKEN_EVENT_CODE;
}

export function storyEventForCode(code: number): StoryEventId {
  if (code === JOHN_SPOKEN_EVENT_CODE) return StoryEventId.JohnSpoken;
  throw new Error(`Unknown story event code: ${code}`);
}

export function storyTargetCode(_target: StoryTargetId): number {
  return JOHN_TARGET_CODE;
}

export function storyTargetForCode(code: number): StoryTargetId {
  if (code === JOHN_TARGET_CODE) return StoryTargetId.John;
  throw new Error(`Unknown story target code: ${code}`);
}

export function storyEventIdFor(value: string, context: string): StoryEventId {
  return knownIdFor(STORY_EVENT_IDS, value, "story event", context);
}

export function storyTargetIdFor(value: string, context: string): StoryTargetId {
  return knownIdFor(STORY_TARGET_IDS, value, "story target", context);
}

function knownIdFor<T extends string>(ids: readonly T[], value: string, kind: string, context: string): T {
  if ((ids as readonly string[]).includes(value)) return value as T;
  throw new Error(`${context}: Unknown ${kind} "${value}".`);
}
