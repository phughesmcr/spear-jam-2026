import dialogueTrees from "@/src/dialogue/dialogues.json" with { type: "json" };

export const DialogueTreeId = {
  None: 0,
  JohnIntro: 1,
} as const;
export type DialogueTreeId = (typeof DialogueTreeId)[keyof typeof DialogueTreeId];

type DialogueTree = {
  readonly lines: readonly string[];
};

const DIALOGUE_TREE_KEYS = {
  [DialogueTreeId.None]: undefined,
  [DialogueTreeId.JohnIntro]: "john_intro",
} as const satisfies Readonly<Record<DialogueTreeId, string | undefined>>;

const DIALOGUE_TREES = validateDialogueTrees(dialogueTrees);

export function validateDialogueTrees(
  rawTrees: unknown,
  treeKeys: Readonly<Record<number, string | undefined>> = DIALOGUE_TREE_KEYS,
): Readonly<Record<string, DialogueTree>> {
  if (!recordLike(rawTrees)) throw new Error("Dialogue content must be a JSON object.");

  const requiredKeys = new Set(Object.values(treeKeys).filter((key): key is string => key !== undefined));
  const trees: Record<string, DialogueTree> = {};
  for (const key of requiredKeys) {
    const rawTree = rawTrees[key];
    if (rawTree === undefined) throw new Error(`Missing dialogue tree "${key}".`);
    if (!recordLike(rawTree)) throw new Error(`Dialogue tree "${key}" must be a JSON object.`);

    const lines = rawTree.lines;
    if (!Array.isArray(lines) || lines.length === 0) {
      throw new Error(`Dialogue tree "${key}" must have at least one line.`);
    }

    trees[key] = {
      lines: lines.map((line, index) => {
        if (typeof line !== "string" || line.trim().length === 0) {
          throw new Error(`Dialogue tree "${key}" line ${index} must be a non-empty string.`);
        }
        return line;
      }),
    };
  }

  for (const key of Object.keys(rawTrees)) {
    if (!requiredKeys.has(key)) throw new Error(`Dialogue tree "${key}" is not mapped to a DialogueTreeId.`);
  }

  return trees;
}

export function dialogueTreeText(dialogueTreeId: number): string | undefined {
  if (dialogueTreeId === DialogueTreeId.None) return undefined;

  const treeKey = DIALOGUE_TREE_KEYS[dialogueTreeId as DialogueTreeId];
  if (treeKey === undefined) throw new Error(`Unknown dialogue tree id: ${dialogueTreeId}.`);

  return DIALOGUE_TREES[treeKey].lines.join(" ");
}

function recordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
