import { assertEquals } from "@std/assert";
import { setupKeyboard } from "@/src/platform/web/input/keyboard.ts";

Deno.test("setupKeyboard emits accepted first key presses and resets key state", () => {
  const host = new FakeWindow();
  const pressed: string[] = [];
  using _keyboard = setupKeyboard(
    host as unknown as Window,
    (code) => code === "KeyW",
    (input) => pressed.push(input.code),
  );

  assertEquals(host.dispatchEvent(keyEvent("keydown", "Unknown")), true);
  assertEquals(host.dispatchEvent(keyEvent("keydown", "KeyW")), false);
  assertEquals(host.dispatchEvent(keyEvent("keydown", "KeyW")), false);
  assertEquals(pressed, ["KeyW"]);

  host.dispatchEvent(keyEvent("keyup", "KeyW"));
  host.dispatchEvent(keyEvent("keydown", "KeyW"));
  host.dispatchEvent(new Event("blur"));
  host.dispatchEvent(keyEvent("keydown", "KeyW"));

  assertEquals(pressed, ["KeyW", "KeyW", "KeyW"]);
});

class FakeWindow extends EventTarget {
  readonly document = new EventTarget();
}

function keyEvent(type: "keydown" | "keyup", code: string): KeyboardEvent {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "code", { value: code });
  return event as KeyboardEvent;
}
