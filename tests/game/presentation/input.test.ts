import { assertEquals } from "@std/assert";
import { commandForKeyPress, commandForTouchGesture } from "@/src/game/presentation/input.ts";

Deno.test("commandForKeyPress owns the complete keyboard command mapping", () => {
  assertEquals(commandForKeyPress("Space"), { type: "wait" });
  assertEquals(commandForKeyPress("KeyW"), { type: "move", direction: "forward" });
  assertEquals(commandForKeyPress("KeyS"), { type: "move", direction: "backward" });
  assertEquals(commandForKeyPress("KeyA"), { type: "move", direction: "left" });
  assertEquals(commandForKeyPress("KeyD"), { type: "move", direction: "right" });
  assertEquals(commandForKeyPress("KeyQ"), { type: "turn", direction: "left" });
  assertEquals(commandForKeyPress("KeyE"), { type: "turn", direction: "right" });
  assertEquals(commandForKeyPress("Comma"), { type: "smartAction" });
  assertEquals(commandForKeyPress("Period"), { type: "action" });
  assertEquals(commandForKeyPress("Tab"), { type: "toggleView" });
  assertEquals(commandForKeyPress("Escape"), { type: "menu" });
  assertEquals(commandForKeyPress("KeyP"), { type: "pause" });
  assertEquals(commandForKeyPress("Digit1"), { type: "selectWeapon", slot: 1 });
  assertEquals(commandForKeyPress("Digit2"), { type: "selectWeapon", slot: 2 });
  assertEquals(commandForKeyPress("Digit3"), { type: "selectWeapon", slot: 3 });
  assertEquals(commandForKeyPress("Unknown"), undefined);
});

Deno.test("commandForTouchGesture maps neutral gestures to game commands", () => {
  const size = { width: 720, height: 1280 };

  assertEquals(commandForTouchGesture({ type: "swipe", direction: "up" }, size), {
    type: "move",
    direction: "forward",
  });
  assertEquals(commandForTouchGesture({ type: "swipe", direction: "down" }, size), {
    type: "move",
    direction: "backward",
  });
  assertEquals(commandForTouchGesture({ type: "swipe", direction: "left" }, size), {
    type: "move",
    direction: "left",
  });
  assertEquals(commandForTouchGesture({ type: "swipe", direction: "right" }, size), {
    type: "move",
    direction: "right",
  });
  assertEquals(commandForTouchGesture({ type: "tap", x: 120, y: 640 }, size), {
    type: "turn",
    direction: "left",
  });
  assertEquals(commandForTouchGesture({ type: "tap", x: 600, y: 640 }, size), {
    type: "turn",
    direction: "right",
  });
  assertEquals(commandForTouchGesture({ type: "tap", x: 360, y: 640 }, size), { type: "action" });
  assertEquals(commandForTouchGesture({ type: "doubleTap", x: 360, y: 640 }, size), { type: "smartAction" });
});
