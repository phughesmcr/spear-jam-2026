import { createGameModel, transition } from "@/src/game/model/transition/mod.ts";
import { assertEquals } from "@std/assert";

Deno.test("transition previews a newly selected verb before confirming it with cursor input", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 0 });

  ({ model } = transition(model, { type: "verbPointer", phase: "down", target: { kind: "verb", verbIndex: 2 } }));
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 2 });

  let result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "verb", verbIndex: 2 } });
  model = result.model;
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 2 });
  assertEquals(result.effects, [{ type: "render" }]);

  ({ model } = transition(model, { type: "verbPointer", phase: "down", target: { kind: "verb", verbIndex: 2 } }));
  result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "verb", verbIndex: 2 } });
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "runPlayerCommand", command: { type: "interact", verb: "open" } }]);
});

Deno.test("transition confirms a newly selected verb with one tap", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));
  ({ model } = transition(model, {
    type: "verbPointer",
    phase: "down",
    target: { kind: "verb", verbIndex: 2 },
    tap: true,
  }));
  const result = transition(model, {
    type: "verbPointer",
    phase: "up",
    target: { kind: "verb", verbIndex: 2 },
    tap: true,
  });

  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "runPlayerCommand", command: { type: "interact", verb: "open" } }]);
});

Deno.test("transition tracks pointer hover targets in the verb menu", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));

  let result = transition(model, {
    type: "verbPointer",
    phase: "move",
    target: { kind: "control", control: "close" },
  });
  assertEquals(result.model.mode, {
    type: "verbMenu",
    selectedIndex: 0,
    hoverTarget: { kind: "control", control: "close" },
  });
  assertEquals(result.effects, [{ type: "render" }]);

  result = transition(result.model, {
    type: "verbPointer",
    phase: "move",
    target: { kind: "weapon", slot: 3 },
  });
  assertEquals(result.model.mode, {
    type: "verbMenu",
    selectedIndex: 0,
    hoverTarget: { kind: "weapon", slot: 3 },
  });
  assertEquals(result.effects, [{ type: "render" }]);

  result = transition(result.model, {
    type: "verbPointer",
    phase: "move",
    target: { kind: "verb", verbIndex: 3 },
  });
  assertEquals(result.model.mode, {
    type: "verbMenu",
    selectedIndex: 3,
    hoverTarget: { kind: "verb", verbIndex: 3 },
  });
  assertEquals(result.effects, [{ type: "render" }]);

  result = transition(result.model, { type: "verbPointer", phase: "move" });
  assertEquals(result.model.mode, { type: "verbMenu", selectedIndex: 3 });
  assertEquals(result.effects, [{ type: "render" }]);
});

Deno.test("transition makes keyboard verb cycling visually explicit", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));

  const result = transition(model, {
    type: "gameCommand",
    command: { type: "move", direction: "backward" },
  });
  assertEquals(result.model.mode, {
    type: "verbMenu",
    selectedIndex: 1,
    hoverTarget: { kind: "verb", verbIndex: 1 },
  });
  assertEquals(result.effects, [{ type: "render" }]);
});

Deno.test("transition confirms pointer weapon buttons only when down and up hit the same button", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 0 });

  ({ model } = transition(model, { type: "verbPointer", phase: "down", target: { kind: "weapon", slot: 2 } }));
  let result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "weapon", slot: 3 } });
  model = result.model;
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 0 });
  assertEquals(result.effects, []);

  ({ model } = transition(model, { type: "verbPointer", phase: "down", target: { kind: "weapon", slot: 2 } }));
  result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "weapon", slot: 2 } });
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "runPlayerCommand", command: { type: "selectWeapon", slot: 2 } }]);
});

Deno.test("transition confirms pointer control buttons only when down and up hit the same button", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 0 });

  ({ model } = transition(model, { type: "verbPointer", phase: "down", target: { kind: "control", control: "wait" } }));
  let result = transition(model, {
    type: "verbPointer",
    phase: "up",
    target: { kind: "control", control: "toggleView" },
  });
  model = result.model;
  assertEquals(model.mode, { type: "verbMenu", selectedIndex: 0 });
  assertEquals(result.effects, []);

  ({ model } = transition(model, { type: "verbPointer", phase: "down", target: { kind: "control", control: "wait" } }));
  result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "control", control: "wait" } });
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "runPlayerCommand", command: { type: "wait" } }]);
  model = result.model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));
  ({ model } = transition(model, {
    type: "verbPointer",
    phase: "down",
    target: { kind: "control", control: "toggleView" },
  }));
  result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "control", control: "toggleView" } });
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.model.viewMode, "topDown");
  assertEquals(result.effects, [{ type: "resetFirstPerson" }, { type: "render" }]);

  ({ model } = transition(result.model, { type: "gameCommand", command: { type: "action" } }));
  ({ model } = transition(model, {
    type: "verbPointer",
    phase: "down",
    target: { kind: "control", control: "close" },
  }));
  result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "control", control: "close" } });
  assertEquals(result.model.mode, { type: "playing" });
  assertEquals(result.effects, [{ type: "render" }]);
});

Deno.test("transition opens help from the verb menu and closes it back to the verb menu", () => {
  let model = transition(createGameModel("Level 1"), {
    type: "mapLoaded",
    mapName: "Level 1",
  }).model;

  ({ model } = transition(model, { type: "gameCommand", command: { type: "action" } }));
  ({ model } = transition(model, {
    type: "verbPointer",
    phase: "down",
    target: { kind: "control", control: "help" },
  }));
  let result = transition(model, { type: "verbPointer", phase: "up", target: { kind: "control", control: "help" } });
  assertEquals(result.model.mode, {
    type: "help",
    returnTo: { kind: "verbMenu", selectedIndex: 0 },
  });
  assertEquals(result.effects, [{ type: "render" }]);

  result = transition(result.model, { type: "gameCommand", command: { type: "wait" } });
  assertEquals(result.model.mode, { type: "verbMenu", selectedIndex: 0 });
  assertEquals(result.effects, [{ type: "render" }]);
});
