import { ItemKind, itemKindForCode } from "@/src/content/items.ts";
import { SpriteId } from "@/src/content/sprite_ids.ts";
import { dialogueTreeForCode, DialogueTreeId, dialogueTreeStart } from "@/src/dialogue/dialogue.ts";
import { type GameComponentMap, hasComponent, readComponent, requireComponent } from "@/src/ecs/components.ts";
import type { GameRuntime } from "@/src/ecs/runtime.ts";
import type { InteractVerb } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { displayNameForCode, displayNameText } from "@/src/game/names.ts";
import { type AmmoKind, type CommandSlot, commandSlotForCode, type DialogueState } from "@/src/game/state.ts";
import { type KeyColor, keyColorForCode } from "@/src/map/map.ts";
import type { CrawlerMutation } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";

export type ItemPickup =
  | { readonly type: "key"; readonly entity: Entity; readonly color: KeyColor }
  | { readonly type: "uplinkCode"; readonly entity: Entity }
  | { readonly type: "spear"; readonly entity: Entity }
  | { readonly type: "weapon"; readonly entity: Entity; readonly slot: CommandSlot }
  | { readonly type: "health"; readonly entity: Entity; readonly amount: number }
  | { readonly type: "ammo"; readonly entity: Entity; readonly ammo: AmmoKind; readonly amount: number };

export type PlayerInteractionResult =
  | { readonly type: "unchanged"; readonly events: readonly GameEvent[] }
  | { readonly type: "consumeTurn"; readonly events: readonly GameEvent[] }
  | { readonly type: "victory"; readonly events: readonly GameEvent[] }
  | {
    readonly type: "dialogue";
    readonly target: Entity;
    readonly dialogue: DialogueState;
    readonly events: readonly GameEvent[];
  }
  | { readonly type: "uplinkTerminal"; readonly terminal: Entity; readonly events: readonly GameEvent[] };

const UNCHANGED_INTERACTION: PlayerInteractionResult = Object.freeze({ type: "unchanged", events: [] });
type InteractionKind = "door" | "npc" | "terminal" | "turret" | "generic";
const DEFAULT_VERB_BY_KIND: Readonly<Record<InteractionKind, InteractVerb>> = {
  door: "open",
  npc: "talk",
  terminal: "use",
  turret: "use",
  generic: "use",
};
const VERB_PERMISSIONS: Readonly<Record<InteractVerb, readonly InteractionKind[]>> = {
  open: ["door"],
  talk: ["npc"],
  use: ["terminal", "turret"],
};

export function collectItemAt(runtime: GameRuntime, x: number, y: number): ItemPickup | undefined {
  const item = runtime.crawler.findEntityAt(x, y, (entity) => hasComponent(runtime.game, entity, "Item"));
  if (item === undefined) return undefined;
  const { kind, value } = requireComponent(runtime.game, item, "Item");
  const pickup = itemPickupFor(item, itemKindForCode(kind), value);
  runtime.crawler.despawnCrawler(item);
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
    case ItemKind.Spear:
      return { type: "spear", entity };
    case ItemKind.Weapon:
      return { type: "weapon", entity, slot: commandSlotForCode(value) };
  }
}

export function spearPickupDialogue(): DialogueState {
  const start = dialogueTreeStart(DialogueTreeId.SpearPower);
  return {
    title: "Spear of Destiny",
    art: "spearReveal",
    treeKey: start.treeKey,
    message: start.node.text,
    ...(start.node.voice === undefined ? {} : { voice: start.node.voice }),
    choices: start.node.choices,
  };
}

export function interactWithEntity(
  runtime: GameRuntime,
  target: Entity | undefined,
  heldKeys: ReadonlySet<KeyColor>,
  hasUplinkCode: boolean,
  hasSpear: boolean,
  verb?: InteractVerb,
): PlayerInteractionResult {
  if (target === undefined || !hasComponent(runtime.game, target, "Interactable")) {
    return verb === undefined ? UNCHANGED_INTERACTION : failedVerb(verb);
  }
  const kind = interactionKindFor(runtime, target);
  const resolvedVerb = verb ?? DEFAULT_VERB_BY_KIND[kind];
  if (!VERB_PERMISSIONS[resolvedVerb].includes(kind)) return failedVerb(resolvedVerb);
  switch (resolvedVerb) {
    case "open":
      return interactWithDoor(runtime, target, heldKeys, verb !== undefined);
    case "talk":
      return interactWithNpc(runtime, target);
    case "use":
      return kind === "turret" ?
        interactWithSpearTurret(runtime, target, hasSpear) :
        interactWithUplinkTerminal(runtime, target, hasUplinkCode, hasSpear);
  }
}

function interactionKindFor(runtime: GameRuntime, target: Entity): InteractionKind {
  if (hasComponent(runtime.game, target, "Door")) return "door";
  if (hasComponent(runtime.game, target, "Npc")) return "npc";
  if (hasComponent(runtime.game, target, "UplinkTerminal")) return "terminal";
  if (hasComponent(runtime.game, target, "SpearTurret")) return "turret";
  return "generic";
}

function interactWithDoor(
  runtime: GameRuntime,
  door: Entity,
  heldKeys: ReadonlySet<KeyColor>,
  reportAlreadyOpen: boolean,
): PlayerInteractionResult {
  if (requireComponent(runtime.game, door, "Door").open === 1) {
    return reportAlreadyOpen ?
      { type: "unchanged", events: [{ type: "doorAlreadyOpen", entity: door }] } :
      UNCHANGED_INTERACTION;
  }
  if (hasComponent(runtime.game, door, "Glass")) {
    return { type: "unchanged", events: [{ type: "doorCannotOpen", entity: door }] };
  }
  const lock = readComponent(runtime.game, door, "Locked");
  if (lock !== undefined) {
    if (!heldKeys.has(keyColorForCode(lock.color))) {
      return { type: "unchanged", events: [{ type: "doorLocked", entity: door }] };
    }
  }
  runtime.crawler.transaction((mutation) => {
    if (lock !== undefined) mutation.removeComponent(door, runtime.game.components.Locked);
    mutateDoorOpen(runtime, mutation, door);
  });
  return { type: "consumeTurn", events: [{ type: "doorOpened", entity: door }] };
}

export function openDoor(runtime: GameRuntime, door: Entity): void {
  runtime.crawler.transaction((mutation) => mutateDoorOpen(runtime, mutation, door));
}

function mutateDoorOpen(
  runtime: GameRuntime,
  mutation: CrawlerMutation<GameComponentMap>,
  door: Entity,
): void {
  mutation.patchComponent(door, runtime.game.components.Door, { open: 1 });
  mutation.setBlockMask(door, 0);
}

function interactWithNpc(runtime: GameRuntime, npc: Entity): PlayerInteractionResult {
  const displayNameCode = readComponent(runtime.game, npc, "DisplayName")?.displayName;
  if (displayNameCode === undefined) throw new Error(`NPC ${npc} is missing a display name.`);
  const displayName = displayNameForCode(displayNameCode);
  const title = displayNameText(displayName);
  return { type: "dialogue", target: npc, events: [], dialogue: npcDialogueState(runtime, npc, title, displayName) };
}

function interactWithUplinkTerminal(
  runtime: GameRuntime,
  terminal: Entity,
  hasUplinkCode: boolean,
  hasSpear: boolean,
): PlayerInteractionResult {
  if (!hasUplinkCode) {
    return { type: "unchanged", events: [{ type: "uplinkTerminalLocked", entity: terminal }] };
  }
  if (requireComponent(runtime.game, terminal, "UplinkTerminal").requiresSpear === 1 && !hasSpear) {
    return { type: "unchanged", events: [{ type: "uplinkTerminalNeedsSpear", entity: terminal }] };
  }
  return { type: "uplinkTerminal", terminal, events: [{ type: "uplinkTerminalActivated", entity: terminal }] };
}

function interactWithSpearTurret(
  runtime: GameRuntime,
  turret: Entity,
  hasSpear: boolean,
): PlayerInteractionResult {
  if (runtime.game.storage.Sprite.get(turret, "id") === SpriteId.SpearTurretLoaded) return UNCHANGED_INTERACTION;
  if (!hasSpear) {
    return { type: "unchanged", events: [{ type: "spearTurretNeedsSpear", entity: turret }] };
  }
  runtime.crawler.transaction((mutation) => {
    mutation.patchComponent(turret, runtime.game.components.Sprite, { id: SpriteId.SpearTurretLoaded });
  });
  return { type: "victory", events: [{ type: "spearTurretLoaded", entity: turret }] };
}

function failedVerb(verb: InteractVerb): PlayerInteractionResult {
  return { type: "unchanged", events: [{ type: "verbFailed", verb }] };
}

function npcDialogueState(
  runtime: GameRuntime,
  npc: Entity,
  title: string,
  speaker: NonNullable<DialogueState["speaker"]>,
): DialogueState {
  const code = readComponent(runtime.game, npc, "DialogueTreeRef")?.dialogueTreeId;
  const id = code === undefined ? undefined : dialogueTreeForCode(code);
  const start = id === undefined ? undefined : dialogueTreeStart(id);
  if (start === undefined) return { title, speaker, message: `${title} stayed silent.`, choices: [{ label: "BYE!" }] };
  return {
    title,
    speaker,
    treeKey: start.treeKey,
    message: start.node.text,
    ...(start.node.voice === undefined ? {} : { voice: start.node.voice }),
    choices: start.node.choices,
  };
}
