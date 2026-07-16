/**
 * Runtime item kind codes stored on the ECS `Item` component.
 * Map content pickup strings (`healthPatch`, …) map onto a subset of these codes during spawning.
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

export const ITEM_KIND_CODES = Object.freeze(
  [
    ItemKind.HealthPatch,
    ItemKind.PistolAmmo,
    ItemKind.CannonAmmo,
    ItemKind.Key,
    ItemKind.UplinkCode,
    ItemKind.Weapon,
    ItemKind.Spear,
  ] as const satisfies readonly ItemKind[],
);

export const MapItemKind = {
  HealthPatch: "healthPatch",
  PistolAmmo: "pistolAmmo",
  CannonAmmo: "cannonAmmo",
} as const;
export type MapItemKind = (typeof MapItemKind)[keyof typeof MapItemKind];
export const MAP_ITEM_KINDS = [
  MapItemKind.HealthPatch,
  MapItemKind.PistolAmmo,
  MapItemKind.CannonAmmo,
] as const satisfies readonly MapItemKind[];
