import { SpriteId } from "@/src/content/sprite_ids.ts";
import { spriteAppearance, spriteIdForDecoration } from "@/src/content/sprites.ts";
import { assertEquals } from "@std/assert";

Deno.test("tree decorations resolve to their renderable sprite assets", () => {
  const trees = [
    ["tree1", SpriteId.DecorTree1, "/assets/game/sprites/tree_1.png"],
    ["tree2", SpriteId.DecorTree2, "/assets/game/sprites/tree_2.png"],
    ["tree3", SpriteId.DecorTree3, "/assets/game/sprites/tree_3.png"],
  ] as const;

  for (const [kind, spriteId, assetPath] of trees) {
    assertEquals(spriteIdForDecoration(kind), spriteId);
    const appearance = spriteAppearance(spriteId);
    assertEquals(appearance.asset?.src.endsWith(assetPath), true);
    assertEquals(appearance.firstPersonScale, 0.95);
    assertEquals(appearance.firstPersonElevation, 0);
  }
});

Deno.test("mainframe core renders as a room-scale set-piece", () => {
  assertEquals(spriteAppearance(SpriteId.MainframeCore).firstPersonScale, 3.5);
});
