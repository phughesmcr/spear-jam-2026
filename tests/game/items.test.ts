import { assertEquals, assertThrows } from "@std/assert";
import type { Entity } from "@phughesmcr/miski";
import { itemIconFor, ItemKind, itemKindForCode, itemPickupFor } from "@/src/game/items.ts";
import { KeyColor, keyColorCode } from "@/src/map/map.ts";

const ITEM_ENTITY = 7 as Entity;

Deno.test("itemKindForCode validates persisted item kind values", () => {
  assertEquals(itemKindForCode(ItemKind.HealthPatch), ItemKind.HealthPatch);
  assertEquals(itemKindForCode(ItemKind.Key), ItemKind.Key);
  assertThrows(() => itemKindForCode(99), Error, "Unknown item kind");
});

Deno.test("itemPickupFor maps item definitions to pickup effects", () => {
  assertEquals(itemPickupFor(ITEM_ENTITY, ItemKind.HealthPatch, 4), {
    type: "health",
    entity: ITEM_ENTITY,
    amount: 4,
  });
  assertEquals(itemPickupFor(ITEM_ENTITY, ItemKind.PistolAmmo, 5), {
    type: "ammo",
    entity: ITEM_ENTITY,
    ammo: "pistol",
    amount: 5,
  });
  assertEquals(itemPickupFor(ITEM_ENTITY, ItemKind.CannonAmmo, 6), {
    type: "ammo",
    entity: ITEM_ENTITY,
    ammo: "cannon",
    amount: 6,
  });
  assertEquals(itemPickupFor(ITEM_ENTITY, ItemKind.Key, keyColorCode(KeyColor.Blue)), {
    type: "key",
    entity: ITEM_ENTITY,
    color: KeyColor.Blue,
  });
  assertEquals(itemPickupFor(ITEM_ENTITY, ItemKind.UplinkCode, 0), {
    type: "uplinkCode",
    entity: ITEM_ENTITY,
  });
  assertEquals(itemPickupFor(ITEM_ENTITY, ItemKind.Weapon, 2), {
    type: "weapon",
    entity: ITEM_ENTITY,
    slot: 2,
  });
});

Deno.test("itemIconFor maps item definitions to render icons", () => {
  assertEquals(itemIconFor(ItemKind.HealthPatch, 4), {
    type: "badge",
    color: "#ef4444",
    label: "+",
  });
  assertEquals(itemIconFor(ItemKind.PistolAmmo, 5), {
    type: "badge",
    color: "#38bdf8",
    label: "P",
  });
  assertEquals(itemIconFor(ItemKind.CannonAmmo, 6), {
    type: "badge",
    color: "#f97316",
    label: "C",
  });
  assertEquals(itemIconFor(ItemKind.Key, keyColorCode(KeyColor.Yellow)), {
    type: "key",
    color: KeyColor.Yellow,
  });
  assertEquals(itemIconFor(ItemKind.UplinkCode, 0), { type: "uplinkCode" });
  assertEquals(itemIconFor(ItemKind.Weapon, 3), { type: "weapon", slot: 3 });
});
