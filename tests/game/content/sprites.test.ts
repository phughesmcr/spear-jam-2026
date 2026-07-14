import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { spriteIdForDecoration, topDownSpriteAppearance } from "@/src/game/content/sprites.ts";
import { assertEquals } from "@std/assert";

Deno.test("tree decorations resolve to top-down-hidden sprite identities", () => {
  const trees = [
    ["tree1", SpriteId.DecorTree1],
    ["tree2", SpriteId.DecorTree2],
    ["tree3", SpriteId.DecorTree3],
  ] as const;

  for (const [kind, spriteId] of trees) {
    assertEquals(spriteIdForDecoration(kind), spriteId);
    assertEquals(topDownSpriteAppearance(spriteId), {
      shape: "none",
      color: "#000000",
    });
  }
});

Deno.test("top-down appearances contain no first-person asset concerns", () => {
  assertEquals(topDownSpriteAppearance(SpriteId.DigitalDog), {
    shape: "actor",
    color: "#ef4444",
    symbol: "D",
  });
  assertEquals(topDownSpriteAppearance(SpriteId.Player), {
    shape: "player",
    color: "#f0c84b",
  });
});
