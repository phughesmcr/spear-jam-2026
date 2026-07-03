import { assertEquals } from "@std/assert";
import { d20FaceSpriteRect, firstPersonCombatFeedbackPanels } from "@/src/render/combat_feedback.ts";

Deno.test("d20FaceSpriteRect maps rolls onto the d20 atlas grid", () => {
  assertEquals(d20FaceSpriteRect(1), { x: 0, y: 0, width: 409.6, height: 512 });
  assertEquals(d20FaceSpriteRect(20), { x: 1638.4, y: 1536, width: 409.6, height: 512 });
  assertEquals(d20FaceSpriteRect(0), undefined);
  assertEquals(d20FaceSpriteRect(21), undefined);
});

Deno.test("firstPersonCombatFeedbackPanels anchors player left and enemy right", () => {
  const panels = firstPersonCombatFeedbackPanels({ width: 720, height: 1280 }, [
    { text: "HIT 2", tone: "hit", side: "player", roll: 12, total: 16 },
    { text: "HIT 1", tone: "hurt", side: "enemy", roll: 7, total: 9 },
    { text: "CRIT 4", tone: "crit", side: "player", roll: 20, total: 24 },
    { text: "DOWN", tone: "defeat", side: "player" },
  ]);

  assertEquals(panels, [
    {
      side: "player",
      rect: { x: 12, y: 64, width: 132, height: 130 },
      feedback: { text: "DOWN", tone: "defeat", side: "player", roll: 20, total: 24 },
    },
    {
      side: "enemy",
      rect: { x: 576, y: 64, width: 132, height: 130 },
      feedback: { text: "HIT 1", tone: "hurt", side: "enemy", roll: 7, total: 9 },
    },
  ]);
});
