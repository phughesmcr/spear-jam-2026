import {
  DEFAULT_ENEMY_ARCHETYPE,
  enemyArchetypeForKey,
  spriteIdForEnemyArchetype,
} from "@/src/game/content/enemies.ts";
import { ITEM_KIND_BY_CONTENT_KEY, ItemKind } from "@/src/game/content/items.ts";
import { SpriteId, type SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import { spriteIdForDecoration, spriteIdForDisplayName, spriteIdForItem } from "@/src/game/content/sprites.ts";
import type { EntityDef } from "@/src/game/content/map_entities.ts";
import { type GameMap, keyColorCode } from "@/src/game/world/map.ts";

/** Sprites that can appear mid-map without being authored on the entity list. */
const ALWAYS_CRITICAL_SPRITES: readonly SpriteIdType[] = [SpriteId.Corpse];

/**
 * Sprite IDs that must be image-preloaded before `playing` for this map.
 * Includes authored entities plus dynamic sprites (corpse, loaded turret).
 */
export function criticalSpriteIdsForMap(map: GameMap): ReadonlySet<SpriteIdType> {
  const ids = new Set<SpriteIdType>(ALWAYS_CRITICAL_SPRITES);
  for (const entity of map.entities) {
    for (const id of spriteIdsForEntity(entity)) ids.add(id);
  }
  return ids;
}

export function spriteIdsForEntity(entity: EntityDef): readonly SpriteIdType[] {
  switch (entity.prefab) {
    case "player":
    case "door":
    case "light":
    case "sound":
      return [];
    case "npc":
      return [spriteIdForDisplayName(entity.displayName)];
    case "enemy": {
      const archetype = entity.archetype === undefined ?
        DEFAULT_ENEMY_ARCHETYPE :
        enemyArchetypeForKey(entity.archetype);
      return [spriteIdForEnemyArchetype(archetype)];
    }
    case "key":
      return [spriteIdForItem(ItemKind.Key, keyColorCode(entity.color))];
    case "uplinkCode":
      return [spriteIdForItem(ItemKind.UplinkCode, 0)];
    case "uplinkTerminal":
      return [SpriteId.UplinkTerminal];
    case "weaponPickup":
      return [spriteIdForItem(ItemKind.Weapon, entity.slot)];
    case "item":
      return [spriteIdForItem(ITEM_KIND_BY_CONTENT_KEY[entity.item], entity.amount)];
    case "decoration":
      return [spriteIdForDecoration(entity.decoration)];
    case "spearPickup":
      return [spriteIdForItem(ItemKind.Spear, 0)];
    case "spearTurret":
      return [SpriteId.SpearTurret, SpriteId.SpearTurretLoaded];
    default: {
      const _exhaustive: never = entity;
      return _exhaustive;
    }
  }
}

/** True when the map needs the dialogue portrait pack (any NPC). */
export function mapNeedsDialogueAssets(map: GameMap): boolean {
  return map.entities.some((entity) => entity.prefab === "npc");
}

export function mapNeedsSpearRevealAsset(map: GameMap): boolean {
  return map.entities.some((entity) => entity.prefab === "spearPickup");
}
