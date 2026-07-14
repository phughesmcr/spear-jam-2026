import type { PlayerCommand } from "@/src/game/model/commands.ts";

type VerbDefinition = {
  readonly id: string;
  readonly label: string;
  readonly command: PlayerCommand;
};

export const VERBS = Object.freeze(
  [
    { id: "attack", label: "ATTACK", command: { type: "attack" } },
    { id: "use", label: "USE", command: { type: "interact", verb: "use" } },
    { id: "open", label: "OPEN", command: { type: "interact", verb: "open" } },
    { id: "examine", label: "EXAMINE", command: { type: "examine" } },
    { id: "talk", label: "TALK", command: { type: "interact", verb: "talk" } },
  ] as const satisfies readonly VerbDefinition[],
);

export type Verb = typeof VERBS[number];
export type VerbId = Verb["id"];

export function verbToCommand(index: number): PlayerCommand {
  const verb = VERBS[index];
  if (verb === undefined) {
    throw new RangeError(`Invalid verb index: ${index}`);
  }
  return verb.command;
}
