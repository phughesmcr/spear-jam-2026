import { createCodeRegistry } from "@/src/utils/code_registry.ts";

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

// Codes are the 1-based position of each id in these lists; only ever append to keep them stable.
const STORY_EVENT_REGISTRY = createCodeRegistry("story event", [StoryEventId.JohnSpoken]);
const STORY_TARGET_REGISTRY = createCodeRegistry("story target", [StoryTargetId.John]);

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
  return STORY_EVENT_REGISTRY.assert(value, context);
}

export function storyTargetIdFor(value: string, context: string): StoryTargetId {
  return STORY_TARGET_REGISTRY.assert(value, context);
}

export function storyEventCode(event: StoryEventId): number {
  return STORY_EVENT_REGISTRY.encode(event);
}

export function storyEventForCode(code: number): StoryEventId {
  return STORY_EVENT_REGISTRY.decode(code);
}

export function storyTargetCode(target: StoryTargetId): number {
  return STORY_TARGET_REGISTRY.encode(target);
}

export function storyTargetForCode(code: number): StoryTargetId {
  return STORY_TARGET_REGISTRY.decode(code);
}
