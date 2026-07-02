import type { Entity, World } from "@phughesmcr/miski";
import { dialogueTreeText } from "@/src/dialogue/dialogue.ts";
import {
  commandSlotForCode,
  Dialogue,
  DisplayNameComponent,
  Door,
  Interactable,
  Item,
  ItemKind,
  itemKindForCode,
  Locked,
  Npc,
  UplinkTerminal,
} from "@/src/ecs/components.ts";
import { displayNameText } from "@/src/game/names.ts";
import type { SpatialIndex } from "@/src/ecs/spatial.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { AmmoKind, CommandSlot, DialogueState } from "@/src/game/state.ts";
import { keyColorForCode } from "@/src/map/map.ts";
import type { KeyColor } from "@/src/map/map.ts";

export type PlayerInteractionResult =
  | { readonly type: "unchanged"; readonly events: readonly GameEvent[] }
  | { readonly type: "consumeTurn"; readonly events: readonly GameEvent[] }
  | { readonly type: "dialogue"; readonly dialogue: DialogueState; readonly events: readonly GameEvent[] }
  | { readonly type: "uplinkTerminal"; readonly terminal: Entity; readonly events: readonly GameEvent[] };

const UNCHANGED_INTERACTION: PlayerInteractionResult = Object.freeze({ type: "unchanged", events: [] });

export type ItemPickup =
  | { readonly type: "key"; readonly entity: Entity; readonly color: KeyColor }
  | { readonly type: "uplinkCode"; readonly entity: Entity }
  | { readonly type: "weapon"; readonly entity: Entity; readonly slot: CommandSlot }
  | { readonly type: "health"; readonly entity: Entity; readonly amount: number }
  | { readonly type: "ammo"; readonly entity: Entity; readonly ammo: AmmoKind; readonly amount: number };

export function collectItemAt(
  world: World,
  spatial: SpatialIndex,
  x: number,
  y: number,
): ItemPickup | undefined {
  const item = spatial.itemAt(x, y);
  if (item === undefined) return undefined;

  const { kind, value } = world.components.getEntityData(Item, item);
  const pickup = itemPickupFor(item, itemKindForCode(kind), value);
  spatial.removeEntity(item);
  return pickup;
}

export function interactWithEntity(
  world: World,
  spatial: SpatialIndex,
  target: Entity | undefined,
  heldKeys: ReadonlySet<KeyColor>,
  hasUplinkCode: boolean,
): PlayerInteractionResult {
  if (target === undefined || !world.components.entityHas(Interactable, target)) {
    return UNCHANGED_INTERACTION;
  }

  if (world.components.entityHas(Door, target)) {
    return interactWithDoor(world, spatial, target, heldKeys);
  }

  if (world.components.entityHas(Npc, target)) {
    return interactWithNpc(world, target);
  }

  if (world.components.entityHas(UplinkTerminal, target)) {
    return interactWithUplinkTerminal(target, hasUplinkCode);
  }

  return { type: "consumeTurn", events: [] };
}

function interactWithDoor(
  world: World,
  spatial: SpatialIndex,
  door: Entity,
  heldKeys: ReadonlySet<KeyColor>,
): PlayerInteractionResult {
  const state = world.components.getEntityData(Door, door);
  if (state.open === 1) return UNCHANGED_INTERACTION;

  if (world.components.entityHas(Locked, door)) {
    const lock = world.components.getEntityData(Locked, door);
    const color = keyColorForCode(lock.color);
    if (!heldKeys.has(color)) {
      return {
        type: "unchanged",
        events: [{
          type: "doorLocked",
          entity: door,
        }],
      };
    }
    world.components.removeFromEntity(Locked, door);
  }

  world.components.setEntityData(Door, door, { open: 1 });
  spatial.setBlocking(door, false);
  return {
    type: "consumeTurn",
    events: [{
      type: "doorOpened",
      entity: door,
    }],
  };
}

function interactWithNpc(world: World, npc: Entity): PlayerInteractionResult {
  const { displayName } = world.components.getEntityData(DisplayNameComponent, npc);
  const displayNameLabel = displayNameText(displayName);
  const dialogueText = dialogueTextFor(world, npc) ?? `${displayNameLabel} stayed silent.`;
  return {
    type: "dialogue",
    events: [],
    dialogue: {
      title: displayNameLabel,
      message: `${dialogueText} Space to continue.`,
    },
  };
}

function interactWithUplinkTerminal(terminal: Entity, hasUplinkCode: boolean): PlayerInteractionResult {
  if (!hasUplinkCode) {
    return {
      type: "unchanged",
      events: [{
        type: "uplinkTerminalLocked",
        entity: terminal,
      }],
    };
  }

  return {
    type: "uplinkTerminal",
    terminal,
    events: [{
      type: "uplinkTerminalActivated",
      entity: terminal,
    }],
  };
}

function dialogueTextFor(world: World, entity: Entity): string | undefined {
  if (!world.components.entityHas(Dialogue, entity)) return undefined;

  const { dialogueTreeId } = world.components.getEntityData(Dialogue, entity);
  return dialogueTreeText(dialogueTreeId);
}

function itemPickupFor(entity: Entity, kind: ItemKind, value: number): ItemPickup {
  switch (kind) {
    case ItemKind.HealthPatch:
      return { type: "health", entity, amount: value };
    case ItemKind.PistolAmmo:
      return { type: "ammo", entity, ammo: "pistol", amount: value };
    case ItemKind.CannonAmmo:
      return { type: "ammo", entity, ammo: "cannon", amount: value };
    case ItemKind.Key:
      return { type: "key", entity, color: keyColorForCode(value) };
    case ItemKind.UplinkCode:
      return { type: "uplinkCode", entity };
    case ItemKind.Weapon:
      return { type: "weapon", entity, slot: commandSlotForCode(value) };
  }
}
