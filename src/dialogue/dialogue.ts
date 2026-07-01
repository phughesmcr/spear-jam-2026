import dialogueTrees from "@/src/dialogue/dialogues.json" with { type: "json" };

export const DialogueTreeId = {
  None: 0,
  JohnIntro: 1,
} as const;
export type DialogueTreeId = (typeof DialogueTreeId)[keyof typeof DialogueTreeId];

type DialogueTree = {
  readonly lines: readonly string[];
};

const DIALOGUE_TREE_KEYS: Readonly<Record<number, string | undefined>> = {
  [DialogueTreeId.JohnIntro]: "john_intro",
};

const DIALOGUE_TREES = dialogueTrees as Readonly<Record<string, DialogueTree>>;

export function dialogueTreeText(dialogueTreeId: number): string | undefined {
  const treeKey = DIALOGUE_TREE_KEYS[dialogueTreeId];
  if (treeKey === undefined) return undefined;

  const lines = DIALOGUE_TREES[treeKey]?.lines;
  if (lines === undefined || lines.length === 0) return undefined;

  return lines.join(" ");
}
