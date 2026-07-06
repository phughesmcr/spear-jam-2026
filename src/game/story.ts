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

// Each story flag owns one bit, positioned by its index in STORY_FLAG_ORDER, so a
// `Uint32Array` mask on the player entity can hold up to 32 flags as ECS-native state.
const STORY_FLAG_BITS = new Map<StoryFlag, number>(
  STORY_FLAG_ORDER.map((flag, index) => [flag, 1 << index]),
);

function storyFlagBit(flag: StoryFlag): number {
  const bit = STORY_FLAG_BITS.get(flag);
  if (bit === undefined) throw new Error(`Story flag "${flag}" has no assigned bit.`);
  return bit;
}

const STORY_EVENT_IDS: readonly StoryEventId[] = Object.values(StoryEventId);
const STORY_TARGET_IDS: readonly StoryTargetId[] = Object.values(StoryTargetId);

const STORY_EVENT_CODES: Readonly<Record<StoryEventId, number>> = {
  [StoryEventId.JohnSpoken]: 1,
};

const STORY_TARGET_CODES: Readonly<Record<StoryTargetId, number>> = {
  [StoryTargetId.John]: 1,
};

const STORY_EVENTS_BY_CODE = new Map<number, StoryEventId>(
  Object.entries(STORY_EVENT_CODES).map(([storyEventId, code]) => [code, storyEventId as StoryEventId]),
);

const STORY_TARGETS_BY_CODE = new Map<number, StoryTargetId>(
  Object.entries(STORY_TARGET_CODES).map(([storyTargetId, code]) => [code, storyTargetId as StoryTargetId]),
);

export function storyEventDefinition(event: StoryEventId): StoryEventDefinition {
  return STORY_EVENT_DEFINITIONS[event];
}

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
  return STORY_FLAG_ORDER.filter((flag) => (mask & storyFlagBit(flag)) !== 0);
}

export function storyEventIdFor(value: string, context: string): StoryEventId {
  return knownIdFor(STORY_EVENT_IDS, value, "story event", context);
}

export function storyTargetIdFor(value: string, context: string): StoryTargetId {
  return knownIdFor(STORY_TARGET_IDS, value, "story target", context);
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

function knownIdFor<T extends string>(ids: readonly T[], value: string, kind: string, context: string): T {
  if ((ids as readonly string[]).includes(value)) return value as T;
  throw new Error(`${context}: Unknown ${kind} "${value}".`);
}
