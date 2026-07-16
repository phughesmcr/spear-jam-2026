export const ExamineTextId = {
  BootSectorUplinkTerminal: "bootSectorUplinkTerminal",
} as const;
export type ExamineTextId = (typeof ExamineTextId)[keyof typeof ExamineTextId];

/** Persisted examine-text codes are one-based positions in this append-only list. */
export const EXAMINE_TEXT_IDS = [
  ExamineTextId.BootSectorUplinkTerminal,
] as const satisfies readonly ExamineTextId[];
