import type { PlayerCommand } from "@/src/game/commands.ts";

export type Verb = {
  readonly label: string;
  readonly command: PlayerCommand;
};

export const VERBS: readonly Verb[] = Object.freeze([
  { label: "ATTACK", command: { type: "attack" } },
  { label: "USE", command: { type: "interact", verb: "use" } },
  { label: "OPEN", command: { type: "interact", verb: "open" } },
  { label: "EXAMINE", command: { type: "examine" } },
  { label: "TALK", command: { type: "interact", verb: "talk" } },
]);

export function verbToCommand(index: number): PlayerCommand {
  return VERBS[index]?.command ?? VERBS[0]!.command;
}
