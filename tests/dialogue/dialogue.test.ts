import { DialogueTreeId, dialogueTreeNode, dialogueTreeStart, validateDialogueTrees } from "@/src/dialogue/dialogue.ts";
import { VoiceId } from "@/src/dialogue/voice.ts";
import { assertEquals, assertThrows } from "@std/assert";

Deno.test("dialogueTreeStart returns the authored start node", () => {
  const start = dialogueTreeStart(DialogueTreeId.JohnIntro);

  assertEquals(start?.treeKey, "john_intro");
  assertEquals(start?.node.text, "Stay sharp.");
  assertEquals(start?.node.choices.map((choice) => choice.label), ["WHAT'S GOING ON?", "BYE!"]);
});

Deno.test("dialogueTreeStart rejects unknown dialogue ids", () => {
  assertThrows(() => dialogueTreeStart("missing"), Error, "Unknown dialogue tree id: missing");
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

Deno.test("johnNexus dialogue covers the Nexus briefing path", () => {
  const start = dialogueTreeStart(DialogueTreeId.JohnNexus);

  assertEquals(start.treeKey, "john_nexus");
  assertEquals(start.node.choices[0]?.next, "nexus");
  assertEquals(
    dialogueTreeNode("john_nexus", "nexus").text,
    "Travel through the Uplink Terminal on this level. It leads to The Nexus — that's where you'll find the Spear of Destiny.",
  );
  assertEquals(
    dialogueTreeNode("john_nexus", "core").text,
    "Then go to The Mainframe Core. Upload the Spear's power and force a system reboot.",
  );
  assertEquals(
    dialogueTreeNode("john_nexus", "warning").text,
    "Be wary of the core's stone sentinel guards. Stay sharp.",
  );
  assertEquals(start.node.voice, VoiceId.JohnNexusGreet);
  assertEquals(dialogueTreeNode("john_nexus", "nexus").voice, VoiceId.JohnNexusNexus);
  assertEquals(dialogueTreeNode("john_nexus", "core").voice, VoiceId.JohnNexusCore);
  assertEquals(dialogueTreeNode("john_nexus", "warning").voice, VoiceId.JohnNexusWarning);
});

Deno.test("johnThanks dialogue maps each authored node to its recording", () => {
  const start = dialogueTreeStart(DialogueTreeId.JohnThanks);

  assertEquals(start.node.voice, VoiceId.JohnThanksGreet);
  assertEquals(dialogueTreeNode("john_thanks", "codes").voice, VoiceId.JohnThanksCodes);
  assertEquals(dialogueTreeNode("john_thanks", "family").voice, VoiceId.JohnThanksFamily);
});

Deno.test("johnCore dialogue explains how to reboot the distant Mainframe", () => {
  const start = dialogueTreeStart(DialogueTreeId.JohnCore);

  assertEquals(start.treeKey, "john_core");
  assertEquals(start.node.text, "This is it. That building in the distance - that's the Mainframe Core.");
  assertEquals(
    dialogueTreeNode("john_core", "turret").text,
    "Load the bolt into the turret, then fire it into the Mainframe's heart.",
  );
  assertEquals(
    dialogueTreeNode("john_core", "reboot").text,
    "The impact will force a system reboot. I hope I'll see you on the other side.",
  );
  assertEquals(start.node.voice, VoiceId.JohnCoreGreet);
  assertEquals(dialogueTreeNode("john_core", "turret").voice, VoiceId.JohnCoreTurret);
  assertEquals(dialogueTreeNode("john_core", "reboot").voice, VoiceId.JohnCoreReboot);
});

Deno.test("spearPower dialogue explains the spear and the Mainframe Core upload", () => {
  const start = dialogueTreeStart(DialogueTreeId.SpearPower);
  assertEquals(
    start.node.text,
    "The Spear of Destiny answers your grip. Circuit-runes flare along the blade — raw system authority, unstable and absolute.",
  );
  assertEquals(
    dialogueTreeNode("spear_power", "power").text,
    "Carry it to the Mainframe Core. Upload its power and force a full system reboot — the only way to break The System's hold.",
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

Deno.test("validateDialogueTrees rejects unknown dialogue voice ids", () => {
  assertThrows(
    () =>
      validateDialogueTrees(
        { john_intro: { start: "greet", nodes: { greet: { text: "Hi.", voice: "missing" } } } },
        { [DialogueTreeId.JohnIntro]: "john_intro" },
      ),
    Error,
    'Dialogue tree "john_intro" node "greet" has unknown voice "missing".',
  );
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
