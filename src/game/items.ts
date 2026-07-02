import type { Entity } from "@phughesmcr/miski";
import { KeyColor, keyColorForCode } from "@/src/map/map.ts";
import { commandSlotForCode } from "@/src/game/state.ts";
import type { AmmoKind, CommandSlot } from "@/src/game/state.ts";

export const ItemKind = {
  HealthPatch: 1,
  PistolAmmo: 2,
  CannonAmmo: 3,
  Key: 4,
  UplinkCode: 5,
  Weapon: 6,
} as const;
export type ItemKind = (typeof ItemKind)[keyof typeof ItemKind];

export type ItemPickup =
  | { readonly type: "key"; readonly entity: Entity; readonly color: KeyColor }
  | { readonly type: "uplinkCode"; readonly entity: Entity }
  | { readonly type: "weapon"; readonly entity: Entity; readonly slot: CommandSlot }
  | { readonly type: "health"; readonly entity: Entity; readonly amount: number }
  | { readonly type: "ammo"; readonly entity: Entity; readonly ammo: AmmoKind; readonly amount: number };

export type ItemIcon =
  | { readonly type: "badge"; readonly color: string; readonly label: string }
  | { readonly type: "key"; readonly color: KeyColor }
  | { readonly type: "uplinkCode" }
  | { readonly type: "weapon"; readonly slot: CommandSlot };

type ItemDefinition = {
  readonly pickup: (entity: Entity, value: number) => ItemPickup;
  readonly icon: (value: number) => ItemIcon;
};

const HEALTH_PICKUP_COLOR = "#ef4444";
const PISTOL_AMMO_COLOR = "#38bdf8";
const CANNON_AMMO_COLOR = "#f97316";

const HEALTH_ICON = { type: "badge", color: HEALTH_PICKUP_COLOR, label: "+" } as const satisfies ItemIcon;
const PISTOL_AMMO_ICON = { type: "badge", color: PISTOL_AMMO_COLOR, label: "P" } as const satisfies ItemIcon;
const CANNON_AMMO_ICON = { type: "badge", color: CANNON_AMMO_COLOR, label: "C" } as const satisfies ItemIcon;
const KEY_ICONS = {
  [KeyColor.Red]: { type: "key", color: KeyColor.Red },
  [KeyColor.Blue]: { type: "key", color: KeyColor.Blue },
  [KeyColor.Yellow]: { type: "key", color: KeyColor.Yellow },
} as const satisfies Readonly<Record<KeyColor, ItemIcon>>;
const UPLINK_CODE_ICON = { type: "uplinkCode" } as const satisfies ItemIcon;
const WEAPON_ICONS = {
  1: { type: "weapon", slot: 1 },
  2: { type: "weapon", slot: 2 },
  3: { type: "weapon", slot: 3 },
} as const satisfies Readonly<Record<CommandSlot, ItemIcon>>;

const ITEM_DEFINITIONS = {
  [ItemKind.HealthPatch]: { pickup: healthPickup, icon: healthIcon },
  [ItemKind.PistolAmmo]: { pickup: pistolAmmoPickup, icon: pistolAmmoIcon },
  [ItemKind.CannonAmmo]: { pickup: cannonAmmoPickup, icon: cannonAmmoIcon },
  [ItemKind.Key]: { pickup: keyPickup, icon: keyIcon },
  [ItemKind.UplinkCode]: { pickup: uplinkCodePickup, icon: uplinkCodeIcon },
  [ItemKind.Weapon]: { pickup: weaponPickup, icon: weaponIcon },
} as const satisfies Readonly<Record<ItemKind, ItemDefinition>>;

export function itemKindForCode(kind: number): ItemKind {
  const itemKind = kind as ItemKind;
  if (ITEM_DEFINITIONS[itemKind] !== undefined) return itemKind;
  throw new Error(`Unknown item kind: ${kind}`);
}

export function itemPickupFor(entity: Entity, kind: ItemKind, value: number): ItemPickup {
  return ITEM_DEFINITIONS[kind].pickup(entity, value);
}

export function itemIconFor(kind: ItemKind, value: number): ItemIcon {
  return ITEM_DEFINITIONS[kind].icon(value);
}

function healthPickup(entity: Entity, amount: number): ItemPickup {
  return { type: "health", entity, amount };
}

function pistolAmmoPickup(entity: Entity, amount: number): ItemPickup {
  return { type: "ammo", entity, ammo: "pistol", amount };
}

function cannonAmmoPickup(entity: Entity, amount: number): ItemPickup {
  return { type: "ammo", entity, ammo: "cannon", amount };
}

function keyPickup(entity: Entity, colorCode: number): ItemPickup {
  return { type: "key", entity, color: keyColorForCode(colorCode) };
}

function uplinkCodePickup(entity: Entity): ItemPickup {
  return { type: "uplinkCode", entity };
}

function weaponPickup(entity: Entity, slotCode: number): ItemPickup {
  return { type: "weapon", entity, slot: commandSlotForCode(slotCode) };
}

function healthIcon(): ItemIcon {
  return HEALTH_ICON;
}

function pistolAmmoIcon(): ItemIcon {
  return PISTOL_AMMO_ICON;
}

function cannonAmmoIcon(): ItemIcon {
  return CANNON_AMMO_ICON;
}

function keyIcon(colorCode: number): ItemIcon {
  return KEY_ICONS[keyColorForCode(colorCode)];
}

function uplinkCodeIcon(): ItemIcon {
  return UPLINK_CODE_ICON;
}

function weaponIcon(slotCode: number): ItemIcon {
  return WEAPON_ICONS[commandSlotForCode(slotCode)];
}
