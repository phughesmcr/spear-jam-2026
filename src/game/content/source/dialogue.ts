import dialogueTrees from "@/src/game/content/dialogue/trees.json" with { type: "json" };
import { DIALOGUE_TREE_IDS, DialogueTreeId } from "@/src/game/content/dialogue/trees.ts";

export const SHIPPED_DIALOGUE_SOURCE: {
  readonly ids: typeof DIALOGUE_TREE_IDS;
  readonly keys: Readonly<Record<DialogueTreeId, string>>;
  readonly trees: unknown;
} = {
  ids: DIALOGUE_TREE_IDS,
  keys: {
    [DialogueTreeId.JohnIntro]: "john_intro",
    [DialogueTreeId.JohnThanks]: "john_thanks",
    [DialogueTreeId.JohnNexus]: "john_nexus",
    [DialogueTreeId.SpearPower]: "spear_power",
    [DialogueTreeId.JohnCore]: "john_core",
  },
  trees: dialogueTrees,
};
