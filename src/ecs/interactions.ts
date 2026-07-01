import type { Entity, World } from "@phughesmcr/miski";
import { dialogueTreeText } from "@/src/dialogue/dialogue.ts";
import {
  Dialogue,
  DisplayNameComponent,
  Door,
  Interactable,
  Key,
  Locked,
  Npc,
  UplinkTerminal,
  WeaponPickup,
} from "@/src/ecs/components.ts";
import { weaponLabel } from "@/src/ecs/combat.ts";
import { displayNameText } from "@/src/game/names.ts";
import type { SpatialIndex } from "@/src/ecs/spatial.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { CommandSlot, DialogueState } from "@/src/game/state.ts";
import { keyColorForCode } from "@/src/map/map.ts";
import type { KeyColor } from "@/src/map/map.ts";

export type PlayerInteractionResult =
  | { readonly type: "unchanged"; readonly events: readonly GameEvent[] }
  | { readonly type: "consumeTurn"; readonly events: readonly GameEvent[] }
  | { readonly type: "dialogue"; readonly dialogue: DialogueState; readonly events: readonly GameEvent[] }
  | { readonly type: "uplinkTerminal"; readonly terminal: Entity; readonly events: readonly GameEvent[] };

const UNCHANGED_INTERACTION: PlayerInteractionResult = Object.freeze({ type: "unchanged", events: [] });

export function collectKeyAt(
  world: World,
  spatial: SpatialIndex,
  heldKeys: Set<KeyColor>,
  x: number,
  y: number,
): readonly GameEvent[] {
  const key = spatial.keyAt(x, y);
  if (key === undefined) return [];

  const { color } = world.components.getEntityData(Key, key);
  heldKeys.add(keyColorForCode(color));
  spatial.removeEntity(key);
  return [{
    type: "keyPickedUp",
    entity: key,
  }];
}

export type UplinkCodePickupResult = {
  readonly collected: boolean;
  readonly events: readonly GameEvent[];
};

export function collectUplinkCodeAt(
  spatial: SpatialIndex,
  x: number,
  y: number,
): UplinkCodePickupResult {
  const code = spatial.uplinkCodeAt(x, y);
  if (code === undefined) return { collected: false, events: [] };

  spatial.removeEntity(code);
  return {
    collected: true,
    events: [{
      type: "uplinkCodePickedUp",
      entity: code,
    }],
  };
}

export type WeaponPickupResult = {
  readonly slot?: CommandSlot;
  readonly events: readonly GameEvent[];
};

export function collectWeaponPickupAt(
  world: World,
  spatial: SpatialIndex,
  x: number,
  y: number,
): WeaponPickupResult {
  const weapon = spatial.weaponPickupAt(x, y);
  if (weapon === undefined) return { events: [] };

  const { slot } = world.components.getEntityData(WeaponPickup, weapon);
  const commandSlot = commandSlotForCode(slot);
  spatial.removeEntity(weapon);
  return {
    slot: commandSlot,
    events: [{
      type: "weaponPickedUp",
      entity: weapon,
      slot: commandSlot,
      label: weaponLabel(commandSlot),
    }],
  };
}

export function interactWithEntity(
  world: World,
  spatial: SpatialIndex,
  target: Entity | undefined,
  heldKeys: Set<KeyColor>,
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

function commandSlotForCode(slot: number): CommandSlot {
  switch (slot) {
    case 1:
    case 2:
    case 3:
      return slot;
    default:
      throw new Error(`Unknown weapon slot: ${slot}`);
  }
}

function interactWithDoor(
  world: World,
  spatial: SpatialIndex,
  door: Entity,
  heldKeys: Set<KeyColor>,
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
