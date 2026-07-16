import { DrawableLayer } from "@/src/game/simulation/components.ts";
import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { createDrawableReaders } from "@/src/game/simulation/drawables.ts";
import { DrawableKind } from "@/src/game/model/render_snapshot.ts";
import { createRuntime, type GameRuntime } from "@/tests/game/simulation/helpers.ts";
import { flatTestMap } from "@/tests/game/simulation/helpers.ts";
import { assertEquals } from "@std/assert";
import type { Entity } from "turn-based-engine/ecs";

Deno.test("drawable readers preserve order and observe ordering revisions", () => {
  const runtime = createRuntime(flatTestMap());
  const structure = spawnDrawable(runtime, DrawableLayer.Structure, SpriteId.DecorServerPile);
  const item = spawnDrawable(runtime, DrawableLayer.Item, SpriteId.HealthPatch);
  const readers = createDrawableReaders(runtime);

  assertEquals(drawableEntities(readers), [item, structure]);

  runtime.game.storage.Drawable.patch(structure, { layer: DrawableLayer.Item });
  assertEquals(drawableEntities(readers), [structure, item]);

  runtime.crawler.despawnCrawler(structure);
  assertEquals(drawableEntities(readers), [item]);
});

function spawnDrawable(runtime: GameRuntime, layer: DrawableLayer, spriteId: SpriteId): Entity {
  return runtime.crawler.spawnCrawler({
    x: 1,
    y: 0,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer },
      Sprite: { id: spriteId },
    },
  });
}

function drawableEntities(readers: ReturnType<typeof createDrawableReaders>): readonly Entity[] {
  const entities: Entity[] = [];
  readers.forEachDrawable((drawable) => entities.push(drawable.entity));
  return entities;
}
