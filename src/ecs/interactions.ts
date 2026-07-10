import { ItemKind, itemKindForCode } from "@/src/content/items.ts";
import { dialogueTreeForCode, dialogueTreeStart } from "@/src/dialogue/dialogue.ts";
import {
  DialogueTreeRef,
  DisplayNameComponent,
  Door,
  Glass,
  Interactable,
  Item,
  Locked,
  Npc,
  UplinkTerminal,
} from "@/src/ecs/components.ts";
import type { SpatialIndex } from "@/src/ecs/spatial.ts";
import type { InteractVerb } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { displayNameForCode, displayNameText } from "@/src/game/names.ts";
import { type AmmoKind, type CommandSlot, commandSlotForCode, type DialogueState } from "@/src/game/state.ts";
import { type KeyColor, keyColorForCode } from "@/src/map/map.ts";
import type { Entity, World } from "@phughesmcr/miski";

type InteractionSpatial = Pick<SpatialIndex, "setDoorOpen">;

export type ItemPickup =
  | { readonly type: "key"; readonly entity: Entity; readonly color: KeyColor }
  | { readonly type: "uplinkCode"; readonly entity: Entity }
  | { readonly type: "weapon"; readonly entity: Entity; readonly slot: CommandSlot }
  | { readonly type: "health"; readonly entity: Entity; readonly amount: number }
  | { readonly type: "ammo"; readonly entity: Entity; readonly ammo: AmmoKind; readonly amount: number };

export type PlayerInteractionResult =
  | { readonly type: "unchanged"; readonly events: readonly GameEvent[] }
  | { readonly type: "consumeTurn"; readonly events: readonly GameEvent[] }
  | {
    readonly type: "dialogue";
    readonly target: Entity;
    readonly dialogue: DialogueState;
    readonly events: readonly GameEvent[];
  }
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
  spatial: Pick<SpatialIndex, "itemAt" | "removeEntity">,
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
    default:
      throw new Error(`Unknown item kind: ${kind}`);
  }
}

export function interactWithEntity(
  world: World,
  spatial: InteractionSpatial,
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

  return performInteraction(
    world,
    spatial,
    target,
    heldKeys,
    hasUplinkCode,
    resolvedVerb,
    verb !== undefined,
  );
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
  spatial: InteractionSpatial,
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
    default: {
      const _exhaustive: never = verb;
      return _exhaustive;
    }
  }
}

function interactWithDoor(
  world: World,
  spatial: InteractionSpatial,
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

  if (world.components.entityHas(Glass, door)) {
    return {
      type: "unchanged",
      events: [{
        type: "doorCannotOpen",
        entity: door,
      }],
    };
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

  // A secret door keeps its `Secret` marker after opening so it stays disguised
  // as a wall (wall texture, no jambs) while it slides, instead of snapping into
  // a regular-looking door. The open state alone drives the reveal animation.
  spatial.setDoorOpen(door, true);
  return {
    type: "consumeTurn",
    events: [{
      type: "doorOpened",
      entity: door,
    }],
  };
}

function interactWithNpc(world: World, npc: Entity): PlayerInteractionResult {
  const displayNameCode = world.components.readEntityData(DisplayNameComponent, npc)?.displayName;
  if (displayNameCode === undefined) throw new Error(`NPC ${npc} is missing a display name.`);

  const displayName = displayNameForCode(displayNameCode);
  const displayNameLabel = displayNameText(displayName);
  return {
    type: "dialogue",
    target: npc,
    events: [],
    dialogue: npcDialogueState(world, npc, displayNameLabel, displayName),
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

function npcDialogueState(
  world: World,
  npc: Entity,
  title: string,
  speaker: NonNullable<DialogueState["speaker"]>,
): DialogueState {
  const dialogueTreeCode = world.components.readEntityData(DialogueTreeRef, npc)?.dialogueTreeId;
  const dialogueTreeId = dialogueTreeCode === undefined ? undefined : dialogueTreeForCode(dialogueTreeCode);
  const start = dialogueTreeId === undefined ? undefined : dialogueTreeStart(dialogueTreeId);
  if (start === undefined) {
    return {
      title,
      speaker,
      message: `${title} stayed silent.`,
      choices: [{ label: "BYE!" }],
    };
  }

  return {
    title,
    speaker,
    treeKey: start.treeKey,
    message: start.node.text,
    ...(start.node.voice === undefined ? {} : { voice: start.node.voice }),
    choices: start.node.choices,
  };
}
