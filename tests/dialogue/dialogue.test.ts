import { assertEquals, assertThrows } from "@std/assert";
import { DialogueTreeId, dialogueTreeNode, dialogueTreeStart, validateDialogueTrees } from "@/src/dialogue/dialogue.ts";

Deno.test("dialogueTreeStart returns the authored start node", () => {
  const start = dialogueTreeStart(DialogueTreeId.JohnIntro);

  assertEquals(start?.treeKey, "john_intro");
  assertEquals(start?.node.text, "Stay sharp.");
  assertEquals(start?.node.choices.map((choice) => choice.label), ["WHAT'S GOING ON?", "BYE!"]);
});

Deno.test("dialogueTreeStart returns nothing for the none id", () => {
  assertEquals(dialogueTreeStart(DialogueTreeId.None), undefined);
});

Deno.test("dialogueTreeStart rejects unknown dialogue ids", () => {
  assertThrows(() => dialogueTreeStart(255), Error, "Unknown dialogue tree id: 255");
});

Deno.test("dialogueTreeNode follows choice links within a tree", () => {
  const start = dialogueTreeStart(DialogueTreeId.JohnIntro);
  const next = start?.node.choices[0]?.next;

  assertEquals(next, "briefing");
  assertEquals(
    dialogueTreeNode("john_intro", "briefing").text,
    "The uplink is down. Find the code and get to the terminal.",
  );
});

Deno.test("dialogueTreeNode rejects unknown node ids", () => {
  assertThrows(
    () => dialogueTreeNode("john_intro", "missing"),
    Error,
    'Unknown dialogue node "missing" in tree "john_intro".',
  );
});

Deno.test("validateDialogueTrees rejects missing mapped dialogue content", () => {
  assertThrows(
    () => validateDialogueTrees({}, { [DialogueTreeId.JohnIntro]: "john_intro" }),
    Error,
    'Missing dialogue tree "john_intro".',
  );
});

Deno.test("validateDialogueTrees rejects a start that names no node", () => {
  assertThrows(
    () =>
      validateDialogueTrees(
        { john_intro: { start: "missing", nodes: { greet: { text: "Hi." } } } },
        { [DialogueTreeId.JohnIntro]: "john_intro" },
      ),
    Error,
    'Dialogue tree "john_intro" start must name one of its nodes.',
  );
});

Deno.test("validateDialogueTrees rejects choices linking to unknown nodes", () => {
  assertThrows(
    () =>
      validateDialogueTrees(
        {
          john_intro: {
            start: "greet",
            nodes: { greet: { text: "Hi.", choices: [{ label: "MORE.", next: "missing" }] } },
          },
        },
        { [DialogueTreeId.JohnIntro]: "john_intro" },
      ),
    Error,
    'Dialogue tree "john_intro" node "greet" links to unknown node "missing".',
  );
});

Deno.test("validateDialogueTrees rejects more than three choices", () => {
  const choices = [{ label: "A." }, { label: "B." }, { label: "C." }, { label: "D." }];
  assertThrows(
    () =>
      validateDialogueTrees(
        { john_intro: { start: "greet", nodes: { greet: { text: "Hi.", choices } } } },
        { [DialogueTreeId.JohnIntro]: "john_intro" },
      ),
    Error,
    'Dialogue tree "john_intro" node "greet" must have 1 to 3 choices.',
  );
});

Deno.test("validateDialogueTrees defaults omitted choices to a closing continue", () => {
  const trees = validateDialogueTrees(
    { john_intro: { start: "greet", nodes: { greet: { text: "Hi." } } } },
    { [DialogueTreeId.JohnIntro]: "john_intro" },
  );

  assertEquals(trees["john_intro"]?.nodes["greet"]?.choices, [{ label: "CONTINUE." }]);
});

Deno.test("validateDialogueTrees rejects unmapped dialogue trees", () => {
  assertThrows(
    () =>
      validateDialogueTrees(
        { stray: { start: "greet", nodes: { greet: { text: "Hi." } } } },
        {},
      ),
    Error,
    'Dialogue tree "stray" is not mapped to a DialogueTreeId.',
  );
});
