import { assertEquals } from "@std/assert";
import { VERBS } from "@/src/game/verbs.ts";
import { verbMenuSpriteRect, verbMenuTargetAt, verbMenuWeaponButtonRects } from "@/src/render/verb_menu.ts";

Deno.test("verbMenuSpriteRect presents the sprite full width on portrait canvases", () => {
  assertEquals(verbMenuSpriteRect({ width: 720, height: 1280 }), {
    x: 0,
    y: 280,
    size: 720,
  });
});

Deno.test("verbMenuTargetAt maps body parts to verbs", () => {
  const canvasSize = { width: 720, height: 1280 };
  const rect = verbMenuSpriteRect(canvasSize);

  const verbAt = (x: number, y: number): string | undefined => {
    const target = verbMenuTargetAt(canvasSize, {
      x: rect.x + x * rect.size,
      y: rect.y + y * rect.size,
    });
    return target?.kind === "verb" ? VERBS[target.verbIndex]?.label : undefined;
  };

  assertEquals(verbAt(0.86, 0.39), "ATTACK");
  assertEquals(verbAt(0.17, 0.44), "USE");
  assertEquals(verbAt(0.53, 0.57), "OPEN");
  assertEquals(verbAt(0.5, 0.27), "EXAMINE");
  assertEquals(verbAt(0.5, 0.37), "TALK");
  assertEquals(verbAt(0.5, -0.1), undefined);
});

Deno.test("verbMenuTargetAt maps weapon buttons to weapon slots", () => {
  const canvasSize = { width: 720, height: 1280 };
  const rects = verbMenuWeaponButtonRects(canvasSize);

  assertEquals(rects.map((rect) => rect.slot), [1, 2, 3]);
  assertEquals(
    rects.map((rect) =>
      verbMenuTargetAt(canvasSize, {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      })
    ),
    [
      { kind: "weapon", slot: 1 },
      { kind: "weapon", slot: 2 },
      { kind: "weapon", slot: 3 },
    ],
  );
});
