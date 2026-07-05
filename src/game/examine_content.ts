export const ExamineTextId = {
  BootSectorUplinkTerminal: "bootSectorUplinkTerminal",
} as const;
export type ExamineTextId = (typeof ExamineTextId)[keyof typeof ExamineTextId];

const EXAMINE_TEXT: Readonly<Record<ExamineTextId, string>> = {
  [ExamineTextId.BootSectorUplinkTerminal]: "The uplink terminal hums, waiting for a valid code.",
};

const EXAMINE_TEXT_CODES: Readonly<Record<ExamineTextId, number>> = {
  [ExamineTextId.BootSectorUplinkTerminal]: 1,
};

const EXAMINE_TEXT_BY_CODE = new Map<number, ExamineTextId>(
  Object.entries(EXAMINE_TEXT_CODES).map(([examineTextId, code]) => [code, examineTextId as ExamineTextId]),
);

export function examineText(examineTextId: ExamineTextId): string | undefined {
  return EXAMINE_TEXT[examineTextId];
}

export function examineTextCode(examineTextId: ExamineTextId): number {
  return EXAMINE_TEXT_CODES[examineTextId];
}

export function examineTextIdForCode(code: number): ExamineTextId {
  const examineTextId = EXAMINE_TEXT_BY_CODE.get(code);
  if (examineTextId === undefined) throw new Error(`Unknown examine text code: ${code}`);
  return examineTextId;
}
