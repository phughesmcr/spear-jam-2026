import { assertEquals } from "@std/assert";
import { renderLayerPolicy } from "@/src/game/presentation/mode_policy.ts";

Deno.test("renderLayerPolicy skips session underlays for shell modes", () => {
  assertEquals(renderLayerPolicy({ type: "title", intent: "start" }, "firstPerson"), {
    opaqueFirstPerson: false,
  });
  assertEquals(renderLayerPolicy({ type: "settings", returnIntent: "start" }, "firstPerson"), {
    opaqueFirstPerson: false,
  });
  assertEquals(
    renderLayerPolicy({
      type: "intermission",
      pages: ["A"],
      pageIndex: 0,
      prompt: "Continue",
      background: "system",
      completion: { type: "loadMap", mapName: "next" },
      revealStartedAtMs: 0,
      revealed: true,
    }, "firstPerson"),
    {
      opaqueFirstPerson: false,
    },
  );
  assertEquals(renderLayerPolicy({ type: "loading", completed: 0, total: 0 }, "firstPerson"), {
    opaqueFirstPerson: false,
  });
});

Deno.test("renderLayerPolicy keeps overlay modes on top of the session world", () => {
  assertEquals(renderLayerPolicy({ type: "paused" }, "firstPerson"), {
    opaqueFirstPerson: false,
  });
  assertEquals(renderLayerPolicy({ type: "playing" }, "firstPerson"), {
    opaqueFirstPerson: true,
  });
  assertEquals(renderLayerPolicy({ type: "verbMenu", selectedIndex: 0 }, "topDown"), {
    opaqueFirstPerson: false,
  });
});
