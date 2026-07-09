import { firstPersonTouchGesturesEnabled, routePointerInput } from "@/src/game/input_routing.ts";
import { createGameModel, type GameModel, transition } from "@/src/game/transition.ts";
import type { CanvasPointerInput } from "@/src/input/pointer.ts";
import { DEFAULT_GAME_CANVAS_SIZE } from "@/src/render/canvas.ts";
import { dialogueLayout } from "@/src/render/dialogue.ts";
import { settingsBackButtonRect, settingsSliderRects } from "@/src/render/settings.ts";
import { titleSettingsButtonRect, titleStartButtonRect } from "@/src/render/title.ts";
import { verbMenuButtonRects } from "@/src/render/verb_menu.ts";
import { assertEquals } from "@std/assert";

const CANVAS_SIZE = DEFAULT_GAME_CANVAS_SIZE;
const BASE_POINTER = {
  phase: "up",
  x: 0,
  y: 0,
  pointerId: 1,
  pointerType: "mouse",
  button: 0,
} as const satisfies CanvasPointerInput;

Deno.test("routePointerInput maps title settings-button pointer up to settings", () => {
  const model = modelWithMode({ type: "title", intent: "start" });
  const button = titleSettingsButtonRect(CANVAS_SIZE);

  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer(centerOf(button, { phase: "up" }))), {
    type: "command",
    command: { type: "settings" },
  });
});

Deno.test("routePointerInput maps title pointer move to title hover events", () => {
  const model = modelWithMode({ type: "title", intent: "start" });
  const start = titleStartButtonRect(CANVAS_SIZE);
  const settings = titleSettingsButtonRect(CANVAS_SIZE);

  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer(centerOf(start, { phase: "move" }))), {
    type: "transition",
    event: { type: "titlePointer", phase: "move", hoverButton: "start" },
  });
  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer(centerOf(settings, { phase: "move" }))), {
    type: "transition",
    event: { type: "titlePointer", phase: "move", hoverButton: "settings" },
  });
  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer({ phase: "move", x: 0, y: 0 })), {
    type: "transition",
    event: { type: "titlePointer", phase: "move", hoverButton: undefined },
  });
});

Deno.test("routePointerInput maps settings back-button pointer up to wait", () => {
  const model = modelWithMode({ type: "settings", returnIntent: "start" });
  const button = settingsBackButtonRect(CANVAS_SIZE);

  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer(centerOf(button, { phase: "up" }))), {
    type: "command",
    command: { type: "wait" },
  });
  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer({ phase: "up", x: 0, y: 0 })), { type: "none" });
});

Deno.test("routePointerInput maps settings slider drag to settingsPointer events", () => {
  const model = modelWithMode({ type: "settings", returnIntent: "start" });
  const [music, sound] = settingsSliderRects(CANVAS_SIZE);
  if (music === undefined || sound === undefined) throw new Error("expected settings sliders");

  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer(centerOf(music, { phase: "down" }))), {
    type: "transition",
    event: {
      type: "settingsPointer",
      phase: "down",
      slider: "music",
      volume: 0.5,
    },
  });

  const dragging = modelWithMode({ type: "settings", returnIntent: "start", dragging: "music" });
  assertEquals(
    routePointerInput(
      dragging,
      CANVAS_SIZE,
      pointer({ phase: "move", x: music.x + music.width * 0.25, y: music.y + music.height / 2 }),
    ),
    {
      type: "transition",
      event: {
        type: "settingsPointer",
        phase: "move",
        slider: "music",
        volume: 0.25,
      },
    },
  );

  assertEquals(
    routePointerInput(
      dragging,
      CANVAS_SIZE,
      pointer({ phase: "up", x: music.x + music.width * 0.25, y: music.y + music.height / 2 }),
    ),
    {
      type: "transition",
      event: {
        type: "settingsPointer",
        phase: "up",
        slider: "music",
        volume: 0.25,
      },
    },
  );

  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer(centerOf(sound, { phase: "down" }))), {
    type: "transition",
    event: {
      type: "settingsPointer",
      phase: "down",
      slider: "sound",
      volume: 0.5,
    },
  });
});

Deno.test("routePointerInput maps title start-button pointer up to wait", () => {
  const model = modelWithMode({ type: "title", intent: "start" });
  const button = titleStartButtonRect(CANVAS_SIZE);

  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer(centerOf(button, { phase: "up" }))), {
    type: "command",
    command: { type: "wait" },
  });
  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer({ phase: "up", x: 0, y: 0 })), { type: "none" });
  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer(centerOf(button, { phase: "down" }))), {
    type: "none",
  });
});

Deno.test("routePointerInput maps intermission pointer up to wait and swallows pointer down", () => {
  const model = modelWithMode({
    type: "intermission",
    pages: ["Entering Level 2."],
    pageIndex: 0,
    prompt: "Space to continue",
    goto: "Level 2",
    revealStartedAtMs: 0,
    revealed: true,
  });

  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer({ phase: "up" })), {
    type: "command",
    command: { type: "wait" },
  });
  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer({ phase: "down" })), { type: "none" });
});

Deno.test("routePointerInput maps outcome and help pointer up to wait", () => {
  assertEquals(routePointerInput(modelWithMode({ type: "victory" }), CANVAS_SIZE, pointer({ phase: "up" })), {
    type: "command",
    command: { type: "wait" },
  });
  assertEquals(routePointerInput(modelWithMode({ type: "defeat" }), CANVAS_SIZE, pointer({ phase: "up" })), {
    type: "command",
    command: { type: "wait" },
  });
  assertEquals(
    routePointerInput(modelWithMode({ type: "help", selectedIndex: 2 }), CANVAS_SIZE, pointer({ phase: "up" })),
    {
      type: "command",
      command: { type: "wait" },
    },
  );
});

Deno.test("routePointerInput maps dialogue pointer input to dialogue transition events", () => {
  const choices = [{ label: "First" }, { label: "Second" }];
  const choiceRect = dialogueLayout(CANVAS_SIZE, choices).choices[0]!.rect;
  const model = modelWithMode({
    type: "dialogue",
    title: "Terminal",
    message: "Choose.",
    choices,
  });

  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer(centerOf(choiceRect, { phase: "down" }))), {
    type: "transition",
    event: {
      type: "dialoguePointer",
      phase: "down",
      optionSlot: 1,
    },
  });
});

Deno.test("routePointerInput maps top-down playing pointer up to toggle view", () => {
  const model = modelWithMode({ type: "playing" }, "topDown");

  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer({ phase: "up" })), {
    type: "command",
    command: { type: "toggleView" },
  });
  assertEquals(routePointerInput(model, CANVAS_SIZE, pointer({ phase: "down" })), { type: "none" });
});

Deno.test("routePointerInput maps verb menu pointer input to verb transition events", () => {
  const button = verbMenuButtonRects(CANVAS_SIZE).find((rect) =>
    rect.target.kind === "control" && rect.target.control === "help"
  );
  if (button === undefined) throw new Error("Expected help button rect.");

  assertEquals(
    routePointerInput(
      modelWithMode({ type: "verbMenu", selectedIndex: 0 }),
      CANVAS_SIZE,
      pointer(centerOf(button, { phase: "move" })),
    ),
    {
      type: "transition",
      event: {
        type: "verbPointer",
        phase: "move",
        target: { kind: "control", control: "help" },
      },
    },
  );
});

Deno.test("routePointerInput keeps fallback verb routing for unhandled modes", () => {
  assertEquals(routePointerInput(modelWithMode({ type: "loading" }), CANVAS_SIZE, pointer({ phase: "cancel" })), {
    type: "transition",
    event: {
      type: "verbPointer",
      phase: "cancel",
      target: undefined,
    },
  });
});

Deno.test("firstPersonTouchGesturesEnabled is true only while playing first-person", () => {
  assertEquals(firstPersonTouchGesturesEnabled(modelWithMode({ type: "playing" }, "firstPerson")), true);
  assertEquals(firstPersonTouchGesturesEnabled(modelWithMode({ type: "playing" }, "topDown")), false);
  assertEquals(
    firstPersonTouchGesturesEnabled(modelWithMode({ type: "verbMenu", selectedIndex: 0 }, "firstPerson")),
    false,
  );
});

function modelWithMode(mode: GameModel["mode"], viewMode: GameModel["viewMode"] = "firstPerson"): GameModel {
  const model = transition(createGameModel("Level 1"), { type: "mapLoaded", mapName: "Level 1" }).model;
  return { ...model, mode, viewMode };
}

function pointer(input: Partial<CanvasPointerInput>): CanvasPointerInput {
  return { ...BASE_POINTER, ...input };
}

function centerOf(
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  input: Partial<CanvasPointerInput>,
): Partial<CanvasPointerInput> {
  return {
    ...input,
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
}
