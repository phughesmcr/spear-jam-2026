import type { Entity, World } from "@phughesmcr/miski";
import { dialogueTreeText } from "@/src/dialogue/dialogue.ts";
import {
  Blocking,
  Dialogue,
  DisplayNameComponent,
  Door,
  Interactable,
  Key,
  Locked,
  Npc,
} from "@/src/ecs/components.ts";
import { displayNameText } from "@/src/ecs/names.ts";
import type { SpatialQueries } from "@/src/ecs/spatial.ts";
import type { DialogueState } from "@/src/game/state.ts";

export type PlayerInteractionResult =
  | { readonly type: "unchanged" }
  | { readonly type: "consumeTurn" }
  | { readonly type: "dialogue"; readonly dialogue: DialogueState };

const UNCHANGED_INTERACTION: PlayerInteractionResult = { type: "unchanged" };

export function collectKeyAt(
  world: World,
  spatial: SpatialQueries,
  heldKeys: Set<number>,
  x: number,
  y: number,
): void {
  const key = spatial.keyAt(x, y);
  if (key === undefined) return;

  const { lockId } = world.components.getEntityData(Key, key);
  heldKeys.add(lockId);
  world.entities.destroy(key);
  console.log("Picked up a key.");
}

export function interactWithEntity(
  world: World,
  target: Entity | undefined,
  heldKeys: ReadonlySet<number>,
): PlayerInteractionResult {
  if (target === undefined || !world.components.entityHas(Interactable, target)) {
    return UNCHANGED_INTERACTION;
  }

  if (world.components.entityHas(Door, target)) {
    return interactWithDoor(world, target, heldKeys);
  }

  if (world.components.entityHas(Npc, target)) {
    return interactWithNpc(world, target);
  }

  return { type: "consumeTurn" };
}

function interactWithDoor(world: World, door: Entity, heldKeys: ReadonlySet<number>): PlayerInteractionResult {
  const state = world.components.getEntityData(Door, door);
  if (state.open === 1) return UNCHANGED_INTERACTION;

  if (world.components.entityHas(Locked, door)) {
    const lock = world.components.getEntityData(Locked, door);
    if (!heldKeys.has(lock.lockId)) {
      console.log("The door is locked.");
      return UNCHANGED_INTERACTION;
    }
    world.components.removeFromEntity(Locked, door);
  }

  world.components.setEntityData(Door, door, { open: 1 });
  world.components.removeFromEntity(Blocking, door);
  console.log("Opened the door.");
  return { type: "consumeTurn" };
}

function interactWithNpc(world: World, npc: Entity): PlayerInteractionResult {
  const { displayName } = world.components.getEntityData(DisplayNameComponent, npc);
  const displayNameLabel = displayNameText(displayName);
  const dialogueText = dialogueTextFor(world, npc) ?? `${displayNameLabel} stayed silent.`;
  return {
    type: "dialogue",
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
