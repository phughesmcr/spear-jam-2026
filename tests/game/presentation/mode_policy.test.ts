import { assertEquals } from "@std/assert";
import { renderLayerPolicy } from "@/src/game/presentation/mode_policy.ts";

Deno.test("renderLayerPolicy skips session and message underlays for opaque modes", () => {
  assertEquals(renderLayerPolicy({ type: "title", intent: "start" }, "firstPerson"), {
    renderSession: false,
    renderMessageLog: false,
    opaqueFirstPerson: false,
  });
  assertEquals(renderLayerPolicy({ type: "settings", returnIntent: "start" }, "firstPerson"), {
    renderSession: false,
    renderMessageLog: false,
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
      renderSession: false,
      renderMessageLog: false,
      opaqueFirstPerson: false,
    },
  );
  assertEquals(renderLayerPolicy({ type: "loading", loaded: 0, total: 0 }, "firstPerson"), {
    renderSession: false,
    renderMessageLog: false,
    opaqueFirstPerson: false,
  });
});

Deno.test("renderLayerPolicy keeps overlay modes on top of the session world", () => {
  assertEquals(renderLayerPolicy({ type: "paused" }, "firstPerson"), {
    renderSession: true,
    renderMessageLog: true,
    opaqueFirstPerson: false,
  });
  assertEquals(renderLayerPolicy({ type: "playing" }, "firstPerson"), {
    renderSession: true,
    renderMessageLog: true,
    opaqueFirstPerson: true,
  });
  assertEquals(renderLayerPolicy({ type: "verbMenu", selectedIndex: 0 }, "topDown"), {
    renderSession: true,
    renderMessageLog: true,
    opaqueFirstPerson: false,
  });
});
