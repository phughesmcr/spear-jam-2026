export const ExamineTextId = {
  BootSectorUplinkTerminal: 1,
} as const;
export type ExamineTextId = (typeof ExamineTextId)[keyof typeof ExamineTextId];

const EXAMINE_TEXT: Readonly<Record<number, string | undefined>> = {
  [ExamineTextId.BootSectorUplinkTerminal]: "The uplink terminal hums, waiting for a valid code.",
};

export function examineText(examineTextId: number): string | undefined {
  return EXAMINE_TEXT[examineTextId];
}
