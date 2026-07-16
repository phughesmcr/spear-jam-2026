import type { VoiceId } from "@/src/game/content/dialogue/voices.ts";

export const DialogueTreeId = {
  JohnIntro: "johnIntro",
  JohnThanks: "johnThanks",
  JohnNexus: "johnNexus",
  JohnCore: "johnCore",
  SpearPower: "spearPower",
} as const;
export type DialogueTreeId = (typeof DialogueTreeId)[keyof typeof DialogueTreeId];

/** Stable code order for ECS dialogue references. Only append new ids. */
export const DIALOGUE_TREE_IDS = [
  DialogueTreeId.JohnIntro,
  DialogueTreeId.JohnThanks,
  DialogueTreeId.JohnNexus,
  DialogueTreeId.SpearPower,
  DialogueTreeId.JohnCore,
] as const satisfies readonly DialogueTreeId[];

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

export type DialogueTree = {
  readonly start: string;
  readonly nodes: Readonly<Record<string, DialogueNode>>;
};

export type DialogueTreeStart = {
  readonly treeKey: string;
  readonly node: DialogueNode;
};

export const MAX_DIALOGUE_CHOICES = 3;
