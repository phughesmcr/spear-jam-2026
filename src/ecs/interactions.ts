import type { Entity, World } from "@phughesmcr/miski";
import { dialogueTreeText } from "@/src/dialogue/dialogue.ts";
import { Dialogue, DisplayNameComponent, Door, Interactable, Key, Locked, Npc } from "@/src/ecs/components.ts";
import { displayNameText } from "@/src/game/names.ts";
import type { SpatialIndex } from "@/src/ecs/spatial.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { DialogueState } from "@/src/game/state.ts";
import { scopedLockId } from "@/src/map/map.ts";

export type PlayerInteractionResult =
  | { readonly type: "unchanged"; readonly events: readonly GameEvent[] }
  | { readonly type: "consumeTurn"; readonly events: readonly GameEvent[] }
  | { readonly type: "dialogue"; readonly dialogue: DialogueState; readonly events: readonly GameEvent[] };

const UNCHANGED_INTERACTION: PlayerInteractionResult = Object.freeze({ type: "unchanged", events: [] });

export function collectKeyAt(
  world: World,
  spatial: SpatialIndex,
  heldKeys: Set<string>,
  mapName: string,
  x: number,
  y: number,
): readonly GameEvent[] {
  const key = spatial.keyAt(x, y);
  if (key === undefined) return [];

  const { lockId } = world.components.getEntityData(Key, key);
  heldKeys.add(scopedLockId(mapName, lockId));
  spatial.removeEntity(key);
  return [{
    type: "keyPickedUp",
    entity: key,
  }];
}

export function interactWithEntity(
  world: World,
  spatial: SpatialIndex,
  target: Entity | undefined,
  heldKeys: Set<string>,
  mapName: string,
): PlayerInteractionResult {
  if (target === undefined || !world.components.entityHas(Interactable, target)) {
    return UNCHANGED_INTERACTION;
  }

  if (world.components.entityHas(Door, target)) {
    return interactWithDoor(world, spatial, target, heldKeys, mapName);
  }

  if (world.components.entityHas(Npc, target)) {
    return interactWithNpc(world, target);
  }

  return { type: "consumeTurn", events: [] };
}

function interactWithDoor(
  world: World,
  spatial: SpatialIndex,
  door: Entity,
  heldKeys: Set<string>,
  mapName: string,
): PlayerInteractionResult {
  const state = world.components.getEntityData(Door, door);
  if (state.open === 1) return UNCHANGED_INTERACTION;

  if (world.components.entityHas(Locked, door)) {
    const lock = world.components.getEntityData(Locked, door);
    const keyId = scopedLockId(mapName, lock.lockId);
    if (!heldKeys.has(keyId)) {
      return {
        type: "unchanged",
        events: [{
          type: "doorLocked",
          entity: door,
        }],
      };
    }
    // Keys are single-use: unlocking consumes the key.
    heldKeys.delete(keyId);
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

function dialogueTextFor(world: World, entity: Entity): string | undefined {
  if (!world.components.entityHas(Dialogue, entity)) return undefined;

  const { dialogueTreeId } = world.components.getEntityData(Dialogue, entity);
  return dialogueTreeText(dialogueTreeId);
}
