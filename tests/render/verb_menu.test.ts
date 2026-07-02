import { assertEquals } from "@std/assert";
import { VERBS } from "@/src/game/verbs.ts";
import { verbMenuHotspotIndexAt, verbMenuSpriteRect } from "@/src/render/verb_menu.ts";

Deno.test("verbMenuSpriteRect presents the sprite full width on portrait canvases", () => {
  assertEquals(verbMenuSpriteRect({ width: 720, height: 1280 }), {
    x: 0,
    y: 280,
    size: 720,
  });
});

Deno.test("verbMenuHotspotIndexAt maps body parts to verbs", () => {
  const canvasSize = { width: 720, height: 1280 };
  const rect = verbMenuSpriteRect(canvasSize);

  const verbAt = (x: number, y: number): string | undefined => {
    const index = verbMenuHotspotIndexAt(canvasSize, {
      x: rect.x + x * rect.size,
      y: rect.y + y * rect.size,
    });
    return index === undefined ? undefined : VERBS[index]?.label;
  };

  assertEquals(verbAt(0.86, 0.39), "ATTACK");
  assertEquals(verbAt(0.17, 0.44), "USE");
  assertEquals(verbAt(0.53, 0.57), "OPEN");
  assertEquals(verbAt(0.5, 0.27), "EXAMINE");
  assertEquals(verbAt(0.5, 0.37), "TALK");
  assertEquals(verbAt(0.5, -0.1), undefined);
});
