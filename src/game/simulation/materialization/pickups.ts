import { ItemKind } from "@/src/game/content/items.ts";
import type {
  ItemDef,
  KeyDef,
  SpearPickupDef,
  UplinkCodeDef,
  WeaponPickupDef,
} from "@/src/game/content/map_entities.ts";
import { DrawableKind } from "@/src/game/model/render_snapshot.ts";
import { DrawableLayer, type GameComponentMap } from "@/src/game/simulation/components.ts";
import type { GameSessionContent } from "@/src/game/simulation/content.ts";
import { keyColorCode } from "@/src/game/world/map.ts";
import type { CrawlerSpawnSpec } from "turn-based-engine/crawler";

type PositionedDef = { readonly x: number; readonly y: number };

export function keySpec(prefab: KeyDef, content: GameSessionContent): CrawlerSpawnSpec<GameComponentMap> {
  return pickupSpec(prefab, ItemKind.Key, keyColorCode(prefab.color), content);
}

export function uplinkCodeSpec(
  prefab: UplinkCodeDef,
  content: GameSessionContent,
): CrawlerSpawnSpec<GameComponentMap> {
  return pickupSpec(prefab, ItemKind.UplinkCode, 0, content);
}

export function spearPickupSpec(
  prefab: SpearPickupDef,
  content: GameSessionContent,
): CrawlerSpawnSpec<GameComponentMap> {
  return pickupSpec(prefab, ItemKind.Spear, 0, content);
}

export function weaponPickupSpec(
  prefab: WeaponPickupDef,
  content: GameSessionContent,
): CrawlerSpawnSpec<GameComponentMap> {
  return pickupSpec(prefab, ItemKind.Weapon, prefab.slot, content);
}

export function itemSpec(prefab: ItemDef, content: GameSessionContent): CrawlerSpawnSpec<GameComponentMap> {
  return pickupSpec(prefab, content.simulation.itemKindForKey(prefab.item), prefab.amount, content);
}

function pickupSpec(
  prefab: PositionedDef,
  item: ItemKind,
  value: number,
  content: GameSessionContent,
): CrawlerSpawnSpec<GameComponentMap> {
  return {
    x: prefab.x,
    y: prefab.y,
    components: {
      Drawable: { kind: DrawableKind.Sprite, layer: DrawableLayer.Item },
      Sprite: { id: content.presentation.spriteForItem(item, value) },
      Item: { kind: item, value },
    },
  };
}
