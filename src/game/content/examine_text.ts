import { createCodeRegistry } from "@/src/game/content/code_registry.ts";

export const ExamineTextId = {
  BootSectorUplinkTerminal: "bootSectorUplinkTerminal",
} as const;
export type ExamineTextId = (typeof ExamineTextId)[keyof typeof ExamineTextId];

const EXAMINE_TEXT: Readonly<Record<ExamineTextId, string>> = {
  [ExamineTextId.BootSectorUplinkTerminal]: "The uplink terminal hums, waiting for a valid code.",
};

// Codes are the 1-based position of each id in this list; only ever append to keep them stable.
const EXAMINE_TEXT_REGISTRY = createCodeRegistry("examine text", [ExamineTextId.BootSectorUplinkTerminal]);

export function examineText(examineTextId: ExamineTextId): string | undefined {
  return EXAMINE_TEXT[examineTextId];
}

export function examineTextCode(examineTextId: ExamineTextId): number {
  return EXAMINE_TEXT_REGISTRY.encode(examineTextId);
}

export function examineTextIdForCode(code: number): ExamineTextId {
  return EXAMINE_TEXT_REGISTRY.decode(code);
}
