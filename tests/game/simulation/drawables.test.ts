import { DrawableLayer } from "@/src/game/simulation/components.ts";
import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { createDrawableReaders } from "@/src/game/simulation/drawables.ts";
import { DrawableKind } from "@/src/game/model/render_snapshot.ts";
import { createSessionProjection } from "@/src/game/presentation/session_projection.ts";
import { createRuntime, type GameRuntime, mutateRuntime } from "@/tests/game/simulation/helpers.ts";
import { flatTestMap } from "@/tests/game/simulation/helpers.ts";
import { assertEquals } from "@std/assert";
import type { Entity } from "turn-based-engine/ecs";

Deno.test("drawable readers preserve order and observe ordering revisions", () => {
  const runtime = createRuntime(flatTestMap());
  const structure = spawnDrawable(runtime, DrawableLayer.Structure, SpriteId.DecorServerPile);
  const item = spawnDrawable(runtime, DrawableLayer.Item, SpriteId.HealthPatch);
  const readers = createDrawableReaders(runtime, createSessionProjection());

  assertEquals(drawableEntities(readers), [item, structure]);

  mutateRuntime(
    runtime,
    (mutation) =>
      mutation.patchComponent(structure, runtime.simulation.ecs.components.Drawable, { layer: DrawableLayer.Item }),
  );
  assertEquals(drawableEntities(readers), [structure, item]);

  mutateRuntime(runtime, (mutation) => mutation.despawnCrawler(structure));
  assertEquals(drawableEntities(readers), [item]);
});

function spawnDrawable(runtime: GameRuntime, layer: DrawableLayer, spriteId: SpriteId): Entity {
  return mutateRuntime(runtime, (mutation) =>
    mutation.spawnCrawler({
      x: 1,
      y: 0,
      components: {
        Drawable: { kind: DrawableKind.Sprite, layer },
        Sprite: { id: spriteId },
      },
    }));
}

function drawableEntities(readers: ReturnType<typeof createDrawableReaders>): readonly Entity[] {
  const entities: Entity[] = [];
  readers.forEachDrawable((drawable) => entities.push(drawable.entity));
  return entities;
}
