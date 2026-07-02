import { type Entity, System, type World } from "@phughesmcr/miski";
import {
  commandSlotForCode,
  Door,
  DrawableKind,
  EnemyArchetype,
  enemyArchetypeFor,
  Facing,
  healthFor,
  Item,
  ItemKind,
  itemKindForCode,
  Locked,
  UplinkTerminal,
} from "@/src/ecs/components.ts";
import type { DrawablePartitions, GridPosPartitions } from "@/src/ecs/components.ts";
import { drawableRenderQuery } from "@/src/ecs/queries.ts";
import { keyColorForCode } from "@/src/map/map.ts";
import type { KeyColor } from "@/src/map/map.ts";
import type { CommandSlot } from "@/src/game/state.ts";

export { DrawableKind };

type DrawableBase = {
  readonly x: number;
  readonly y: number;
};

export type ActorDrawableKind =
  | typeof DrawableKind.Player
  | typeof DrawableKind.Npc
  | typeof DrawableKind.Enemy;

export type ActorDrawableEntity = DrawableBase & {
  readonly kind: ActorDrawableKind;
  readonly dir: number;
  readonly enemyArchetype: EnemyArchetype | undefined;
  readonly health?: {
    readonly current: number;
    readonly max: number;
  };
};

export type DoorDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Door;
  readonly open: boolean;
  readonly locked: boolean;
  readonly color?: KeyColor;
};

export type KeyDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Key;
  readonly color: KeyColor;
};

export type UplinkCodeDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.UplinkCode;
};

export type UplinkTerminalDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.UplinkTerminal;
};

export type WeaponPickupDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.WeaponPickup;
  readonly slot: CommandSlot;
};

export type ConsumableItemKind =
  | typeof ItemKind.HealthPatch
  | typeof ItemKind.PistolAmmo
  | typeof ItemKind.CannonAmmo;

export type ItemDrawableEntity = DrawableBase & {
  readonly kind: typeof DrawableKind.Item;
  readonly itemKind: ConsumableItemKind;
  readonly amount: number;
};

export type DrawableEntity =
  | ActorDrawableEntity
  | DoorDrawableEntity
  | KeyDrawableEntity
  | UplinkCodeDrawableEntity
  | UplinkTerminalDrawableEntity
  | WeaponPickupDrawableEntity
  | ItemDrawableEntity;

export type DrawableEntityVisitor = (drawable: DrawableEntity) => void;

type DrawableRenderContext = {
  readonly world: World;
  readonly visit: DrawableEntityVisitor;
};
export type DrawableSystem = (context: DrawableRenderContext) => void;
type DrawableComponents = {
  readonly gridPos: { readonly partitions: GridPosPartitions };
  readonly drawable: { readonly partitions: DrawablePartitions };
};

export const drawableSystem = new System({
  name: "drawableSystem",
  query: drawableRenderQuery,
  callback: (components, entities, context: DrawableRenderContext): void => {
    const drawableComponents = components as unknown as DrawableComponents;
    const positionX = drawableComponents.gridPos.partitions.x;
    const positionY = drawableComponents.gridPos.partitions.y;
    const kind = drawableComponents.drawable.partitions.kind;
    const layer = drawableComponents.drawable.partitions.layer;
    const indices = entities.indices;
    const count = entities.count;

    // Sort back-to-front by layer; ties break on entity id for stable output.
    const ordered: Entity[] = [];
    for (let i = 0; i < count; i++) ordered.push(indices[i]!);
    ordered.sort((a, b) => layer[a]! - layer[b]! || a - b);

    for (const entity of ordered) {
      const drawable = drawableEntityFor(context.world, entity, kind[entity]!, {
        x: positionX[entity]!,
        y: positionY[entity]!,
      });
      if (drawable !== undefined) context.visit(drawable);
    }
  },
});

function drawableEntityFor(
  world: World,
  entity: Entity,
  kind: number,
  position: DrawableBase,
): DrawableEntity | undefined {
  switch (kind) {
    case DrawableKind.Player:
    case DrawableKind.Npc:
    case DrawableKind.Enemy:
      return actorDrawableEntityFor(world, entity, kind, position);
    case DrawableKind.Door:
      return doorDrawableEntityFor(world, entity, position);
    case DrawableKind.Key:
      return keyDrawableEntityFor(world, entity, position);
    case DrawableKind.UplinkCode:
      return uplinkCodeDrawableEntityFor(world, entity, position);
    case DrawableKind.UplinkTerminal:
      return uplinkTerminalDrawableEntityFor(world, entity, position);
    case DrawableKind.WeaponPickup:
      return weaponPickupDrawableEntityFor(world, entity, position);
    case DrawableKind.Item:
      return itemDrawableEntityFor(world, entity, position);
    default:
      return undefined;
  }
}

function actorDrawableEntityFor(
  world: World,
  entity: Entity,
  kind: ActorDrawableKind,
  position: DrawableBase,
): ActorDrawableEntity | undefined {
  if (!world.components.entityHas(Facing, entity)) return undefined;

  const { dir } = world.components.getEntityData(Facing, entity);
  const enemyArchetype = kind === DrawableKind.Enemy ? enemyArchetypeFor(world, entity) : undefined;
  const health = kind === DrawableKind.Enemy ? healthFor(world, entity) : undefined;
  return {
    ...position,
    kind,
    dir,
    enemyArchetype,
    ...(health === undefined ? {} : { health }),
  };
}

function doorDrawableEntityFor(
  world: World,
  entity: Entity,
  position: DrawableBase,
): DoorDrawableEntity | undefined {
  if (!world.components.entityHas(Door, entity)) return undefined;

  const door = world.components.getEntityData(Door, entity);
  const locked = world.components.entityHas(Locked, entity);
  return {
    ...position,
    kind: DrawableKind.Door,
    open: door.open === 1,
    locked,
    color: locked ? keyColorForCode(world.components.getEntityData(Locked, entity).color) : undefined,
  };
}

function keyDrawableEntityFor(
  world: World,
  entity: Entity,
  position: DrawableBase,
): KeyDrawableEntity | undefined {
  const item = itemDataFor(world, entity, ItemKind.Key);
  if (item === undefined) return undefined;

  return {
    ...position,
    kind: DrawableKind.Key,
    color: keyColorForCode(item.value),
  };
}

function uplinkCodeDrawableEntityFor(
  world: World,
  entity: Entity,
  position: DrawableBase,
): UplinkCodeDrawableEntity | undefined {
  if (itemDataFor(world, entity, ItemKind.UplinkCode) === undefined) return undefined;
  return {
    ...position,
    kind: DrawableKind.UplinkCode,
  };
}

function uplinkTerminalDrawableEntityFor(
  world: World,
  entity: Entity,
  position: DrawableBase,
): UplinkTerminalDrawableEntity | undefined {
  if (!world.components.entityHas(UplinkTerminal, entity)) return undefined;
  return {
    ...position,
    kind: DrawableKind.UplinkTerminal,
  };
}

function weaponPickupDrawableEntityFor(
  world: World,
  entity: Entity,
  position: DrawableBase,
): WeaponPickupDrawableEntity | undefined {
  const item = itemDataFor(world, entity, ItemKind.Weapon);
  if (item === undefined) return undefined;

  return {
    ...position,
    kind: DrawableKind.WeaponPickup,
    slot: commandSlotForCode(item.value),
  };
}

function itemDrawableEntityFor(
  world: World,
  entity: Entity,
  position: DrawableBase,
): ItemDrawableEntity | undefined {
  if (!world.components.entityHas(Item, entity)) return undefined;

  const item = world.components.getEntityData(Item, entity);
  const itemKind = consumableItemKindFor(itemKindForCode(item.kind));
  if (itemKind === undefined) return undefined;
  return {
    ...position,
    kind: DrawableKind.Item,
    itemKind,
    amount: item.value,
  };
}

function consumableItemKindFor(itemKind: ItemKind): ConsumableItemKind | undefined {
  switch (itemKind) {
    case ItemKind.HealthPatch:
    case ItemKind.PistolAmmo:
    case ItemKind.CannonAmmo:
      return itemKind;
    case ItemKind.Key:
    case ItemKind.UplinkCode:
    case ItemKind.Weapon:
      return undefined;
  }
}

function itemDataFor(
  world: World,
  entity: Entity,
  expectedKind: ItemKind,
): { readonly kind: number; readonly value: number } | undefined {
  if (!world.components.entityHas(Item, entity)) return undefined;

  const item = world.components.getEntityData(Item, entity);
  return itemKindForCode(item.kind) === expectedKind ? item : undefined;
}
