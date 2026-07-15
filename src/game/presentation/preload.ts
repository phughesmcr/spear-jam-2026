import {
  DEFAULT_ENEMY_ARCHETYPE,
  enemyArchetypeForKey,
  spriteIdForEnemyArchetype,
} from "@/src/game/content/enemies.ts";
import { ITEM_KIND_BY_CONTENT_KEY, ItemKind } from "@/src/game/content/items.ts";
import { SpriteId, type SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import { spriteIdForDecoration, spriteIdForDisplayName, spriteIdForItem } from "@/src/game/content/sprites.ts";
import type { EntityDef } from "@/src/game/content/map_entities.ts";
import { CAMPAIGN } from "@/src/game/world/campaign.ts";
import { type GameMap, keyColorCode } from "@/src/game/world/map.ts";
import type { FirstPersonRenderer } from "@/src/game/presentation/first_person/renderer.ts";
import { preloadCombatFeedbackAssets } from "@/src/game/presentation/ui/combat_feedback.ts";
import { preloadDialogueAssets, preloadSpearRevealAsset } from "@/src/game/presentation/ui/dialogue.ts";
import { preloadHelpAssets } from "@/src/game/presentation/ui/help.ts";
import { preloadHudAssets } from "@/src/game/presentation/ui/hud.ts";
import { preloadIntermissionAssets } from "@/src/game/presentation/ui/intermission.ts";
import { preloadTitleAssets } from "@/src/game/presentation/ui/title.ts";
import { preloadVerbMenuAssets } from "@/src/game/presentation/ui/verb_menu.ts";
import { preloadWeaponHudAssets } from "@/src/game/presentation/ui/weapon_hud.ts";

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

export type PreloadProgress = {
  readonly loaded: number;
  readonly total: number;
};

export type PreloadGameAssetsOptions = {
  readonly mapName: string;
  readonly onProgress?: (progress: PreloadProgress) => void;
  readonly onAssetLoad?: () => void;
};

export async function preloadGameAssets(
  document: Document,
  firstPersonRenderer: FirstPersonRenderer,
  options: PreloadGameAssetsOptions,
): Promise<void> {
  const map = CAMPAIGN.map(options.mapName);
  const spriteIds = criticalSpriteIdsForMap(map);
  const jobs: Array<(onAssetLoad?: () => void) => Promise<void>> = [
    (onAssetLoad) => firstPersonRenderer.preloadMapAssets(document, map, spriteIds, onAssetLoad),
    (onAssetLoad) => preloadVerbMenuAssets(document, onAssetLoad),
    (onAssetLoad) => preloadWeaponHudAssets(document, onAssetLoad),
    (onAssetLoad) => preloadHudAssets(document, onAssetLoad),
    (onAssetLoad) => preloadCombatFeedbackAssets(document, onAssetLoad),
  ];
  if (mapNeedsDialogueAssets(map)) {
    jobs.push((onAssetLoad) => preloadDialogueAssets(document, onAssetLoad));
  }
  if (mapNeedsSpearRevealAsset(map)) {
    jobs.push((onAssetLoad) => preloadSpearRevealAsset(document, onAssetLoad));
  }

  // Approximate progress by job completion; image-level callbacks still drive re-renders.
  let completed = 0;
  const total = jobs.length;
  const report = (): void => {
    options.onProgress?.({ loaded: completed, total });
  };
  report();

  await Promise.all(jobs.map(async (job) => {
    await job(options.onAssetLoad);
    completed += 1;
    report();
  }));
}

/** Non-blocking warm of shell art shared by every boot path. */
export function warmShellAssets(
  document: Document,
  onError: (error: unknown) => void,
  onAssetLoad?: () => void,
): void {
  scheduleIdle(
    async () => {
      await Promise.all([
        preloadTitleAssets(document, onAssetLoad),
        preloadHelpAssets(document, onAssetLoad),
      ]);
    },
    onError,
  );
}

/** Non-blocking warm of map-critical assets. */
export function warmMapAssets(
  document: Document,
  firstPersonRenderer: FirstPersonRenderer,
  mapName: string,
  onError: (error: unknown) => void,
  onAssetLoad?: () => void,
): void {
  scheduleIdle(
    async () => {
      await preloadGameAssets(document, firstPersonRenderer, { mapName, onAssetLoad });
    },
    onError,
  );
}

/** After playing starts, warm deferred first-person sprites and ending art. */
export function warmDeferredAssets(
  document: Document,
  firstPersonRenderer: FirstPersonRenderer,
  mapName: string,
  onError: (error: unknown) => void,
  onAssetLoad?: () => void,
): void {
  scheduleIdle(
    async () => {
      const map = CAMPAIGN.map(mapName);
      const jobs = [
        firstPersonRenderer.warmRemainingAssets(document, onAssetLoad),
        preloadIntermissionAssets(document, onAssetLoad),
      ];
      if (!mapNeedsDialogueAssets(map)) jobs.push(preloadDialogueAssets(document, onAssetLoad));
      if (!mapNeedsSpearRevealAsset(map)) jobs.push(preloadSpearRevealAsset(document, onAssetLoad));
      await Promise.all(jobs);
    },
    onError,
  );
}

function scheduleIdle(work: () => Promise<void>, onError: (error: unknown) => void): void {
  const run = (): void => {
    void work().catch(onError);
  };
  const ric = globalThis.requestIdleCallback as ((cb: () => void) => number) | undefined;
  if (typeof ric === "function") {
    ric(run);
    return;
  }
  globalThis.setTimeout(run, 0);
}
