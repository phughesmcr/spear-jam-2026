import { VoiceId } from "@/src/game/content/dialogue/voices.ts";
import { DisplayName } from "@/src/game/content/names.ts";
import { createGameModel, type GameModel, transition } from "@/src/game/model/transition/mod.ts";
import { assertEquals } from "@std/assert";
import type { Entity } from "turn-based-engine/ecs";

const PLAYER = 1 as Entity;
const DIALOGUE_MODE = {
  type: "dialogue",
  title: "John",
  speaker: DisplayName.John,
  treeKey: "john_intro",
  message: "Stay sharp.",
  choices: [
    { label: "WHAT'S GOING ON?", next: "briefing" },
    { label: "BYE!" },
  ],
} as const;

Deno.test("transition lets dialogue choices advance or close the conversation", () => {
  const model = { ...createGameModel("Level 1"), mode: DIALOGUE_MODE } as const;

  const advanced = transition(model, { type: "gameCommand", command: { type: "wait" } });
  assertEquals(advanced.model.mode, {
    type: "dialogue",
    title: "John",
    speaker: DisplayName.John,
    treeKey: "john_intro",
    message: "The uplink is down. Find the code and get to the terminal.",
    choices: [{ label: "GOT IT." }],
  });
  assertEquals(advanced.effects, [{ type: "render" }]);

  const closed = transition(model, { type: "gameCommand", command: { type: "selectWeapon", slot: 2 } });
  assertEquals(closed.model.mode, { type: "playing" });
  assertEquals(closed.effects, [{ type: "closeDialogue" }, { type: "render" }]);

  const outOfRange = transition(model, { type: "gameCommand", command: { type: "selectWeapon", slot: 3 } });
  assertEquals(outOfRange.model.mode, DIALOGUE_MODE);
  assertEquals(outOfRange.effects, []);
});

Deno.test("transition keeps spear reveal art while advancing its dialogue tree", () => {
  const model = {
    ...createGameModel("Level 1"),
    mode: {
      type: "dialogue",
      title: "Spear of Destiny",
      art: "spearReveal",
      treeKey: "spear_power",
      message: "The spear answers your grip.",
      choices: [{ label: "WHAT DOES IT DO?", next: "power" }],
    },
  } as const;

  const advanced = transition(model, { type: "gameCommand", command: { type: "wait" } });

  if (advanced.model.mode.type !== "dialogue") throw new Error("Expected dialogue to advance.");
  assertEquals(advanced.model.mode.art, "spearReveal");
  assertEquals(advanced.model.mode.treeKey, "spear_power");
});

Deno.test("transition starts, advances, and stops authored dialogue voices", () => {
  const playing = createGameModel("Level 1");
  const opened = transition(playing, {
    type: "playerCommandResult",
    playerEntity: PLAYER,
    result: {
      type: "dialogue",
      events: [],
      dialogue: {
        title: "John",
        speaker: DisplayName.John,
        treeKey: "john_thanks",
        message: "You made it.",
        voice: VoiceId.JohnThanksGreet,
        choices: [{ label: "WHERE TO NEXT?", next: "codes" }],
      },
    },
  });

  assertEquals(opened.effects, [
    { type: "setDialogueVoice", voice: VoiceId.JohnThanksGreet },
    { type: "render" },
  ]);

  const advanced = transition(opened.model, { type: "gameCommand", command: { type: "wait" } });
  assertEquals(
    advanced.model.mode.type === "dialogue" ? advanced.model.mode.voice : undefined,
    VoiceId.JohnThanksCodes,
  );
  assertEquals(advanced.effects, [
    { type: "setDialogueVoice", voice: VoiceId.JohnThanksCodes },
    { type: "render" },
  ]);

  const closed = transition(advanced.model, { type: "gameCommand", command: { type: "selectWeapon", slot: 2 } });
  assertEquals(closed.effects, [
    { type: "setDialogueVoice" },
    { type: "closeDialogue" },
    { type: "render" },
  ]);
});

Deno.test("transition confirms dialogue pointer only when down and up hit the same option", () => {
  let model: GameModel = { ...createGameModel("Level 1"), mode: DIALOGUE_MODE };

  ({ model } = transition(model, { type: "dialoguePointer", phase: "down", optionSlot: 1 }));
  assertEquals(model.mode.type === "dialogue" ? model.mode.pointerDownSlot : undefined, 1);

  let result = transition(model, { type: "dialoguePointer", phase: "up", optionSlot: 2 });
  model = result.model;
  assertEquals(model.mode, DIALOGUE_MODE);
  assertEquals(model.mode.type === "dialogue" ? model.mode.pointerDownSlot : undefined, undefined);
  assertEquals(result.effects, []);

  ({ model } = transition(model, { type: "dialoguePointer", phase: "down", optionSlot: 2 }));
  result = transition(model, { type: "dialoguePointer", phase: "up", optionSlot: 2 });
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "closeDialogue" }, { type: "render" }]);
});
