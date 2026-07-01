import { type Entity, System, type World } from "@phughesmcr/miski";
import { DrawableLayer } from "@/src/ecs/components.ts";
import type { DrawableKind, DrawablePartitions, GridPosPartitions } from "@/src/ecs/components.ts";
import { drawableRenderQuery } from "@/src/ecs/queries.ts";

export type DrawableEntity = {
  readonly entity: Entity;
  readonly kind: DrawableKind;
  readonly x: number;
  readonly y: number;
};

export type DrawableEntityVisitor = (drawable: DrawableEntity) => void;

type DrawableSystem = (visit: DrawableEntityVisitor) => void;
type DrawableComponents = {
  readonly gridPos: { readonly partitions: GridPosPartitions };
  readonly drawable: { readonly partitions: DrawablePartitions };
};

const DRAWABLE_LAYER_ORDER: readonly DrawableLayer[] = [
  DrawableLayer.Item,
  DrawableLayer.Structure,
  DrawableLayer.Npc,
  DrawableLayer.Enemy,
  DrawableLayer.Player,
];

const drawableSystems = new WeakMap<World, DrawableSystem>();

const drawableSystem = new System({
  name: "drawableSystem",
  query: drawableRenderQuery,
  callback: (components, entities, visit: DrawableEntityVisitor): void => {
    const drawableComponents = components as unknown as DrawableComponents;
    const positionX = drawableComponents.gridPos.partitions.x;
    const positionY = drawableComponents.gridPos.partitions.y;
    const kind = drawableComponents.drawable.partitions.kind;
    const layer = drawableComponents.drawable.partitions.layer;
    const indices = entities.indices;
    const count = entities.count;

    for (const currentLayer of DRAWABLE_LAYER_ORDER) {
      for (let i = 0; i < count; i++) {
        const entity = indices[i]!;
        if (layer[entity] !== currentLayer) continue;
        visit({
          entity,
          kind: kind[entity] as DrawableKind,
          x: positionX[entity],
          y: positionY[entity],
        });
      }
    }
  },
});

export function forEachDrawableEntity(world: World, visit: DrawableEntityVisitor): void {
  drawableSystemFor(world)(visit);
}

function drawableSystemFor(world: World): DrawableSystem {
  const existing = drawableSystems.get(world);
  if (existing !== undefined) return existing;
  const created = world.systems.create(drawableSystem);
  drawableSystems.set(world, created);
  return created;
}
