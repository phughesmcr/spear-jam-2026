export const ExamineTextId = {
  BootSectorUplinkTerminal: "bootSectorUplinkTerminal",
} as const;
export type ExamineTextId = (typeof ExamineTextId)[keyof typeof ExamineTextId];

const EXAMINE_TEXT: Readonly<Record<ExamineTextId, string>> = {
  [ExamineTextId.BootSectorUplinkTerminal]: "The uplink terminal hums, waiting for a valid code.",
};

export function examineText(examineTextId: ExamineTextId): string | undefined {
  return EXAMINE_TEXT[examineTextId];
}
