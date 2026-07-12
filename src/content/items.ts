import { createCodeRegistry } from "@/src/utils/code_registry.ts";

/**
 * Runtime item kind codes stored on the ECS `Item` component.
 * Authoring pickup strings (`healthPatch`, …) map onto a subset of these codes in prefabs.
 */
export const ItemKind = {
  HealthPatch: 1,
  PistolAmmo: 2,
  CannonAmmo: 3,
  Key: 4,
  UplinkCode: 5,
  Weapon: 6,
  Spear: 7,
} as const;
export type ItemKind = (typeof ItemKind)[keyof typeof ItemKind];

export const ITEM_KIND_CODES = [
  ItemKind.HealthPatch,
  ItemKind.PistolAmmo,
  ItemKind.CannonAmmo,
  ItemKind.Key,
  ItemKind.UplinkCode,
  ItemKind.Weapon,
  ItemKind.Spear,
] as const satisfies readonly ItemKind[];

const ITEM_KIND_KEYS_BY_CODE = {
  [ItemKind.HealthPatch]: "healthPatch",
  [ItemKind.PistolAmmo]: "pistolAmmo",
  [ItemKind.CannonAmmo]: "cannonAmmo",
  [ItemKind.Key]: "key",
  [ItemKind.UplinkCode]: "uplinkCode",
  [ItemKind.Weapon]: "weapon",
  [ItemKind.Spear]: "spear",
} as const satisfies Readonly<Record<ItemKind, string>>;

const ITEM_KIND_KEYS = ITEM_KIND_CODES.map((code) => ITEM_KIND_KEYS_BY_CODE[code]);

// Codes match ItemKind values (1-based registry positions).
const ITEM_KIND_REGISTRY = createCodeRegistry("item kind", ITEM_KIND_KEYS);

export function itemKindForCode(kind: number): ItemKind {
  ITEM_KIND_REGISTRY.decode(kind);
  return kind as ItemKind;
}

/** Authoring pickup strings → runtime ECS item codes. */
export const AUTHORING_ITEM_KINDS = {
  healthPatch: ItemKind.HealthPatch,
  pistolAmmo: ItemKind.PistolAmmo,
  cannonAmmo: ItemKind.CannonAmmo,
} as const;
