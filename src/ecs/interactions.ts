import type { Entity, World } from "@phughesmcr/miski";
import { dialogueTreeStart } from "@/src/dialogue/dialogue.ts";
import {
  Dialogue,
  DisplayNameComponent,
  Door,
  Interactable,
  Item,
  Locked,
  Npc,
  UplinkTerminal,
} from "@/src/ecs/components.ts";
import { displayNameText } from "@/src/game/names.ts";
import type { SpatialIndex } from "@/src/ecs/spatial.ts";
import type { InteractVerb } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { DialogueState } from "@/src/game/state.ts";
import { itemKindForCode, itemPickupFor } from "@/src/game/items.ts";
import type { ItemPickup } from "@/src/game/items.ts";
import { keyColorForCode } from "@/src/map/map.ts";
import type { KeyColor } from "@/src/map/map.ts";

export type PlayerInteractionResult =
  | { readonly type: "unchanged"; readonly events: readonly GameEvent[] }
  | { readonly type: "consumeTurn"; readonly events: readonly GameEvent[] }
  | { readonly type: "dialogue"; readonly dialogue: DialogueState; readonly events: readonly GameEvent[] }
  | { readonly type: "uplinkTerminal"; readonly terminal: Entity; readonly events: readonly GameEvent[] };

const UNCHANGED_INTERACTION: PlayerInteractionResult = Object.freeze({ type: "unchanged", events: [] });

type InteractionKind = "door" | "npc" | "terminal" | "generic";

const DEFAULT_VERB_BY_KIND: Readonly<Record<InteractionKind, InteractVerb>> = {
  door: "open",
  npc: "talk",
  terminal: "use",
  generic: "use",
};

const VERB_PERMISSIONS: Readonly<Record<InteractVerb, readonly InteractionKind[]>> = {
  open: ["door"],
  talk: ["npc"],
  use: ["terminal"],
};

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
  verb?: InteractVerb,
): PlayerInteractionResult {
  if (target === undefined || !world.components.entityHas(Interactable, target)) {
    return verb === undefined ? UNCHANGED_INTERACTION : failedVerb(verb);
  }

  const kind = interactionKindFor(world, target);
  const resolvedVerb = verb ?? DEFAULT_VERB_BY_KIND[kind];
  if (!verbAllowedForKind(resolvedVerb, kind)) return failedVerb(resolvedVerb);

  return performInteraction(world, spatial, target, heldKeys, hasUplinkCode, resolvedVerb, verb !== undefined);
}

function interactionKindFor(world: World, target: Entity): InteractionKind {
  if (world.components.entityHas(Door, target)) return "door";
  if (world.components.entityHas(Npc, target)) return "npc";
  if (world.components.entityHas(UplinkTerminal, target)) return "terminal";
  return "generic";
}

function verbAllowedForKind(verb: InteractVerb, kind: InteractionKind): boolean {
  return VERB_PERMISSIONS[verb].includes(kind);
}

function performInteraction(
  world: World,
  spatial: SpatialIndex,
  target: Entity,
  heldKeys: ReadonlySet<KeyColor>,
  hasUplinkCode: boolean,
  verb: InteractVerb,
  explicitVerb: boolean,
): PlayerInteractionResult {
  switch (verb) {
    case "open":
      return interactWithDoor(world, spatial, target, heldKeys, explicitVerb);
    case "talk":
      return interactWithNpc(world, target);
    case "use":
      return interactWithUplinkTerminal(target, hasUplinkCode);
  }
}

function interactWithDoor(
  world: World,
  spatial: SpatialIndex,
  door: Entity,
  heldKeys: ReadonlySet<KeyColor>,
  reportAlreadyOpen: boolean,
): PlayerInteractionResult {
  const state = world.components.getEntityData(Door, door);
  if (state.open === 1) {
    return reportAlreadyOpen ?
      {
        type: "unchanged",
        events: [{
          type: "doorAlreadyOpen",
          entity: door,
        }],
      } :
      UNCHANGED_INTERACTION;
  }

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
  return {
    type: "dialogue",
    events: [],
    dialogue: npcDialogueState(world, npc, displayNameLabel),
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

function failedVerb(verb: InteractVerb): PlayerInteractionResult {
  return {
    type: "unchanged",
    events: [{
      type: "verbFailed",
      verb,
    }],
  };
}

function npcDialogueState(world: World, npc: Entity, title: string): DialogueState {
  const start = world.components.entityHas(Dialogue, npc) ?
    dialogueTreeStart(world.components.getEntityData(Dialogue, npc).dialogueTreeId) :
    undefined;
  if (start === undefined) {
    return {
      title,
      message: `${title} stayed silent.`,
      choices: [{ label: "BYE!" }],
    };
  }

  return {
    title,
    treeKey: start.treeKey,
    message: start.node.text,
    choices: start.node.choices,
  };
}
