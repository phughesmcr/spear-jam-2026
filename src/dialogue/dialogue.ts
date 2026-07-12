import dialogueTrees from "@/src/dialogue/dialogues.json" with { type: "json" };
import { VOICE_IDS, type VoiceId } from "@/src/dialogue/voice.ts";

export const DialogueTreeId = {
  JohnIntro: "johnIntro",
  JohnThanks: "johnThanks",
  JohnNexus: "johnNexus",
  SpearPower: "spearPower",
} as const;
export type DialogueTreeId = (typeof DialogueTreeId)[keyof typeof DialogueTreeId];

export type DialogueChoice = {
  readonly label: string;
  /** Node id within the same tree; omitted means the choice ends the dialogue. */
  readonly next?: string;
};

export type DialogueNode = {
  readonly text: string;
  readonly voice?: VoiceId;
  readonly choices: readonly DialogueChoice[];
};

type DialogueTree = {
  readonly start: string;
  readonly nodes: Readonly<Record<string, DialogueNode>>;
};

export type DialogueTreeStart = {
  readonly treeKey: string;
  readonly node: DialogueNode;
};

export const MAX_DIALOGUE_CHOICES = 3;

const DEFAULT_CHOICES: readonly DialogueChoice[] = Object.freeze([{ label: "CONTINUE." }]);
const VOICE_ID_SET = new Set<string>(VOICE_IDS);

const DIALOGUE_TREE_KEYS = {
  [DialogueTreeId.JohnIntro]: "john_intro",
  [DialogueTreeId.JohnThanks]: "john_thanks",
  [DialogueTreeId.JohnNexus]: "john_nexus",
  [DialogueTreeId.SpearPower]: "spear_power",
} as const satisfies Readonly<Record<DialogueTreeId, string>>;

const DIALOGUE_TREE_CODES: Readonly<Record<DialogueTreeId, number>> = {
  [DialogueTreeId.JohnIntro]: 1,
  [DialogueTreeId.JohnThanks]: 2,
  [DialogueTreeId.JohnNexus]: 3,
  [DialogueTreeId.SpearPower]: 4,
};

const DIALOGUE_TREES_BY_CODE = new Map<number, DialogueTreeId>(
  Object.entries(DIALOGUE_TREE_CODES).map(([dialogueTreeId, code]) => [code, dialogueTreeId as DialogueTreeId]),
);

const DIALOGUE_TREES = validateDialogueTrees(dialogueTrees);

export function validateDialogueTrees(
  rawTrees: unknown,
  treeKeys: Readonly<Record<string, string>> = DIALOGUE_TREE_KEYS,
): Readonly<Record<string, DialogueTree>> {
  if (!recordLike(rawTrees)) throw new Error("Dialogue content must be a JSON object.");

  const requiredKeys = new Set(Object.values(treeKeys));
  const trees: Record<string, DialogueTree> = {};
  for (const key of requiredKeys) {
    const rawTree = rawTrees[key];
    if (rawTree === undefined) throw new Error(`Missing dialogue tree "${key}".`);
    trees[key] = validateDialogueTree(key, rawTree);
  }

  for (const key of Object.keys(rawTrees)) {
    if (!requiredKeys.has(key)) throw new Error(`Dialogue tree "${key}" is not mapped to a DialogueTreeId.`);
  }

  return trees;
}

export function dialogueTreeStart(dialogueTreeId: string): DialogueTreeStart {
  const treeKey = DIALOGUE_TREE_KEYS[dialogueTreeId as DialogueTreeId];
  if (treeKey === undefined) throw new Error(`Unknown dialogue tree id: ${dialogueTreeId}.`);

  const tree = DIALOGUE_TREES[treeKey];
  return { treeKey, node: dialogueTreeNode(treeKey, tree.start) };
}

export function dialogueTreeCode(dialogueTreeId: DialogueTreeId): number {
  return DIALOGUE_TREE_CODES[dialogueTreeId];
}

export function dialogueTreeForCode(code: number): DialogueTreeId {
  const dialogueTreeId = DIALOGUE_TREES_BY_CODE.get(code);
  if (dialogueTreeId === undefined) throw new Error(`Unknown dialogue tree code: ${code}`);
  return dialogueTreeId;
}

export function dialogueTreeNode(treeKey: string, nodeId: string): DialogueNode {
  const node = DIALOGUE_TREES[treeKey]?.nodes[nodeId];
  if (node === undefined) throw new Error(`Unknown dialogue node "${nodeId}" in tree "${treeKey}".`);
  return node;
}

function validateDialogueTree(key: string, rawTree: unknown): DialogueTree {
  if (!recordLike(rawTree)) throw new Error(`Dialogue tree "${key}" must be a JSON object.`);

  const rawNodes = rawTree.nodes;
  if (!recordLike(rawNodes) || Object.keys(rawNodes).length === 0) {
    throw new Error(`Dialogue tree "${key}" must have at least one node.`);
  }

  const nodes: Record<string, DialogueNode> = {};
  for (const [nodeId, rawNode] of Object.entries(rawNodes)) {
    nodes[nodeId] = validateDialogueNode(key, nodeId, rawNode);
  }

  const start = rawTree.start;
  if (typeof start !== "string" || nodes[start] === undefined) {
    throw new Error(`Dialogue tree "${key}" start must name one of its nodes.`);
  }

  for (const [nodeId, node] of Object.entries(nodes)) {
    for (const choice of node.choices) {
      if (choice.next !== undefined && nodes[choice.next] === undefined) {
        throw new Error(`Dialogue tree "${key}" node "${nodeId}" links to unknown node "${choice.next}".`);
      }
    }
  }

  return { start, nodes };
}

function validateDialogueNode(key: string, nodeId: string, rawNode: unknown): DialogueNode {
  if (!recordLike(rawNode)) throw new Error(`Dialogue tree "${key}" node "${nodeId}" must be a JSON object.`);

  const text = rawNode.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new Error(`Dialogue tree "${key}" node "${nodeId}" must have non-empty text.`);
  }

  const voice = rawNode.voice;
  if (voice !== undefined && (typeof voice !== "string" || !VOICE_ID_SET.has(voice))) {
    throw new Error(`Dialogue tree "${key}" node "${nodeId}" has unknown voice "${String(voice)}".`);
  }

  const rawChoices = rawNode.choices;
  if (rawChoices === undefined) {
    return voice === undefined ?
      { text, choices: DEFAULT_CHOICES } :
      { text, voice: voice as VoiceId, choices: DEFAULT_CHOICES };
  }
  if (!Array.isArray(rawChoices) || rawChoices.length === 0 || rawChoices.length > MAX_DIALOGUE_CHOICES) {
    throw new Error(`Dialogue tree "${key}" node "${nodeId}" must have 1 to ${MAX_DIALOGUE_CHOICES} choices.`);
  }

  const node: DialogueNode = {
    text,
    choices: rawChoices.map((rawChoice, index) => validateDialogueChoice(key, nodeId, index, rawChoice)),
  };
  return voice === undefined ? node : { ...node, voice: voice as VoiceId };
}

function validateDialogueChoice(key: string, nodeId: string, index: number, rawChoice: unknown): DialogueChoice {
  if (!recordLike(rawChoice)) {
    throw new Error(`Dialogue tree "${key}" node "${nodeId}" choice ${index} must be a JSON object.`);
  }

  const label = rawChoice.label;
  if (typeof label !== "string" || label.trim().length === 0) {
    throw new Error(`Dialogue tree "${key}" node "${nodeId}" choice ${index} must have a non-empty label.`);
  }

  const next = rawChoice.next;
  if (next !== undefined && typeof next !== "string") {
    throw new Error(`Dialogue tree "${key}" node "${nodeId}" choice ${index} next must be a node id.`);
  }

  return next === undefined ? { label } : { label, next };
}

function recordLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
