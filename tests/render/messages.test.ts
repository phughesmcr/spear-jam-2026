import { assertEquals } from "@std/assert";
import { messageLogY, visibleMessageLogLines } from "@/src/render/messages.ts";

Deno.test("messageLogY anchors near the bottom without a reserved band", () => {
  assertEquals(messageLogY(1152, 110), 1030);
});

Deno.test("messageLogY centers the log inside the reserved band when it fits", () => {
  assertEquals(messageLogY(1152, 74, 1073), 1075);
});

Deno.test("visibleMessageLogLines keeps the newest four lines", () => {
  assertEquals(visibleMessageLogLines(["one", "two", "three", "four", "five"]), [
    "two",
    "three",
    "four",
    "five",
  ]);
});
