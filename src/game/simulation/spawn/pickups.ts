import { ITEM_KIND_BY_CONTENT_KEY, ItemKind } from "@/src/game/content/items.ts";
import type {
  ItemDef,
  KeyDef,
  SpearPickupDef,
  UplinkCodeDef,
  WeaponPickupDef,
} from "@/src/game/content/map_entities.ts";
import { spriteIdForItem } from "@/src/game/content/sprites.ts";
import { DrawableKind } from "@/src/game/model/render_snapshot.ts";
import { DrawableLayer } from "@/src/game/simulation/components.ts";
import type { GameRuntime } from "@/src/game/simulation/runtime.ts";
import { keyColorCode } from "@/src/game/world/map.ts";
import type { Entity } from "turn-based-engine/ecs";

type PositionedSpawn = { readonly x: number; readonly y: number };

export function createKey(runtime: GameRuntime, prefab: Omit<KeyDef, "prefab">): Entity {
  return createPickup(runtime, prefab, ItemKind.Key, keyColorCode(prefab.color));
}

export function createUplinkCode(runtime: GameRuntime, prefab: Omit<UplinkCodeDef, "prefab">): Entity {
  return createPickup(runtime, prefab, ItemKind.UplinkCode, 0);
}

export function createSpearPickup(runtime: GameRuntime, prefab: Omit<SpearPickupDef, "prefab">): Entity {
  return createPickup(runtime, prefab, ItemKind.Spear, 0);
}

export function createWeaponPickup(runtime: GameRuntime, prefab: Omit<WeaponPickupDef, "prefab">): Entity {
  return createPickup(runtime, prefab, ItemKind.Weapon, prefab.slot);
}

export function createItem(runtime: GameRuntime, prefab: Omit<ItemDef, "prefab">): Entity {
  return createPickup(runtime, prefab, ITEM_KIND_BY_CONTENT_KEY[prefab.item], prefab.amount);
}

function createPickup(runtime: GameRuntime, prefab: PositionedSpawn, item: ItemKind, value: number): Entity {
  return runtime.crawler.spawnCrawler({
    x: prefab.x,
    y: prefab.y,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Item },
      Sprite: { id: spriteIdForItem(item, value) },
      Item: { kind: item, value },
    },
  });
}
