export const StoryEventId = {
  JohnSpoken: "johnSpoken",
} as const;
export type StoryEventId = (typeof StoryEventId)[keyof typeof StoryEventId];

export const StoryFlag = {
  JohnSpoken: "johnSpoken",
} as const;
export type StoryFlag = (typeof StoryFlag)[keyof typeof StoryFlag];

export const StoryTargetId = {
  John: "john",
} as const;
export type StoryTargetId = (typeof StoryTargetId)[keyof typeof StoryTargetId];

export const StoryPathId = {
  JohnAfterIntro: "johnAfterIntro",
} as const;
export type StoryPathId = (typeof StoryPathId)[keyof typeof StoryPathId];

export type StoryAction = {
  readonly type: "moveEntity";
  readonly target: StoryTargetId;
  readonly path: StoryPathId;
};

export type StoryEventDefinition = {
  readonly flag: StoryFlag;
  readonly actions: readonly StoryAction[];
};

type StoryPathDestination = {
  readonly x: number;
  readonly y: number;
};

const STORY_EVENT_DEFINITIONS: Readonly<Record<StoryEventId, StoryEventDefinition>> = {
  [StoryEventId.JohnSpoken]: {
    flag: StoryFlag.JohnSpoken,
    actions: [{
      type: "moveEntity",
      target: StoryTargetId.John,
      path: StoryPathId.JohnAfterIntro,
    }],
  },
};

const STORY_PATH_DESTINATIONS: Readonly<Record<StoryPathId, StoryPathDestination>> = {
  [StoryPathId.JohnAfterIntro]: { x: 1, y: 3 },
};

const STORY_FLAG_ORDER: readonly StoryFlag[] = [
  StoryFlag.JohnSpoken,
];

const STORY_EVENTS: Readonly<Record<string, StoryEventId>> = {
  [StoryEventId.JohnSpoken]: StoryEventId.JohnSpoken,
};

const STORY_TARGETS: Readonly<Record<string, StoryTargetId>> = {
  [StoryTargetId.John]: StoryTargetId.John,
};

const STORY_PATHS: Readonly<Record<string, StoryPathId>> = {
  [StoryPathId.JohnAfterIntro]: StoryPathId.JohnAfterIntro,
};

const STORY_EVENT_CODES: Readonly<Record<StoryEventId, number>> = {
  [StoryEventId.JohnSpoken]: 1,
};

const STORY_EVENTS_BY_CODE = new Map<number, StoryEventId>(
  Object.entries(STORY_EVENT_CODES).map(([event, code]) => [code, event as StoryEventId]),
);

const STORY_TARGET_CODES: Readonly<Record<StoryTargetId, number>> = {
  [StoryTargetId.John]: 1,
};

const STORY_TARGETS_BY_CODE = new Map<number, StoryTargetId>(
  Object.entries(STORY_TARGET_CODES).map(([target, code]) => [code, target as StoryTargetId]),
);

export function storyEventDefinition(event: StoryEventId): StoryEventDefinition {
  return STORY_EVENT_DEFINITIONS[event];
}

export function storyPathDestination(path: StoryPathId): StoryPathDestination {
  return STORY_PATH_DESTINATIONS[path];
}

export function normalizeStoryFlags(flags: readonly StoryFlag[] = []): readonly StoryFlag[] {
  const input = new Set(flags);
  return STORY_FLAG_ORDER.filter((flag) => input.has(flag));
}

export function storyEventCode(event: StoryEventId): number {
  return STORY_EVENT_CODES[event];
}

export function storyEventForCode(code: number): StoryEventId {
  const event = STORY_EVENTS_BY_CODE.get(code);
  if (event === undefined) throw new Error(`Unknown story event code: ${code}`);
  return event;
}

export function storyTargetCode(target: StoryTargetId): number {
  return STORY_TARGET_CODES[target];
}

export function storyTargetForCode(code: number): StoryTargetId {
  const target = STORY_TARGETS_BY_CODE.get(code);
  if (target === undefined) throw new Error(`Unknown story target code: ${code}`);
  return target;
}

export function storyEventIdFor(value: string, context: string): StoryEventId {
  return lookup(STORY_EVENTS, value, "story event", context);
}

export function storyTargetIdFor(value: string, context: string): StoryTargetId {
  return lookup(STORY_TARGETS, value, "story target", context);
}

export function storyPathIdFor(value: string, context: string): StoryPathId {
  return lookup(STORY_PATHS, value, "story path", context);
}

function lookup<T>(table: Readonly<Record<string, T>>, value: string, kind: string, context: string): T {
  const mapped = table[value] ?? table[lowerFirst(value)];
  if (mapped === undefined) throw new Error(`${context}: Unknown ${kind} "${value}".`);
  return mapped;
}

function lowerFirst(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toLowerCase()}${value.slice(1)}`;
}
