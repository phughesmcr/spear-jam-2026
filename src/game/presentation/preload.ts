import type { CompiledLevel, PresentationContent, SimulationContent } from "@/src/game/content/catalog.ts";
import { ItemKind } from "@/src/game/content/items.ts";
import { SpriteId, type SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import type { EntityDef } from "@/src/game/content/map_entities.ts";
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
type PreloadSimulationContent = Pick<
  SimulationContent,
  "defaultEnemy" | "enemyForCode" | "enemyForKey" | "itemKindForKey"
>;

export function criticalSpriteIdsForMap(
  map: GameMap,
  simulation: PreloadSimulationContent,
  presentation: PresentationContent,
): ReadonlySet<SpriteIdType> {
  const ids = new Set<SpriteIdType>(ALWAYS_CRITICAL_SPRITES);
  for (const entity of map.entities) {
    for (const id of spriteIdsForEntity(entity, simulation, presentation)) ids.add(id);
  }
  return ids;
}

export function spriteIdsForEntity(
  entity: EntityDef,
  simulation: PreloadSimulationContent,
  presentation: PresentationContent,
): readonly SpriteIdType[] {
  switch (entity.prefab) {
    case "player":
    case "door":
    case "light":
    case "sound":
      return [];
    case "npc":
      return [presentation.spriteForDisplayName(entity.displayName)];
    case "enemy": {
      const enemy = entity.archetype === undefined ?
        simulation.enemyForCode(simulation.defaultEnemy) :
        simulation.enemyForKey(entity.archetype);
      return [enemy.sprite];
    }
    case "key":
      return [presentation.spriteForItem(ItemKind.Key, keyColorCode(entity.color))];
    case "uplinkCode":
      return [presentation.spriteForItem(ItemKind.UplinkCode, 0)];
    case "uplinkTerminal":
      return [SpriteId.UplinkTerminal];
    case "weaponPickup":
      return [presentation.spriteForItem(ItemKind.Weapon, entity.slot)];
    case "item":
      return [presentation.spriteForItem(simulation.itemKindForKey(entity.item), entity.amount)];
    case "decoration":
      return [presentation.spriteForDecoration(entity.decoration)];
    case "spearPickup":
      return [presentation.spriteForItem(ItemKind.Spear, 0)];
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
  readonly level: CompiledLevel;
  readonly content: PresentationContent;
  readonly simulationContent: PreloadSimulationContent;
  readonly onProgress?: (progress: PreloadProgress) => void;
  readonly onAssetLoad?: () => void;
};

export async function preloadGameAssets(
  document: Document,
  firstPersonRenderer: FirstPersonRenderer,
  options: PreloadGameAssetsOptions,
): Promise<void> {
  const map = options.level.map;
  const spriteIds = criticalSpriteIdsForMap(map, options.simulationContent, options.content);
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
  level: CompiledLevel,
  content: PresentationContent,
  simulationContent: PreloadSimulationContent,
  onError: (error: unknown) => void,
  onAssetLoad?: () => void,
): void {
  scheduleIdle(
    async () => {
      await preloadGameAssets(document, firstPersonRenderer, { level, content, simulationContent, onAssetLoad });
    },
    onError,
  );
}

/** After playing starts, warm deferred first-person sprites and ending art. */
export function warmDeferredAssets(
  document: Document,
  firstPersonRenderer: FirstPersonRenderer,
  level: CompiledLevel,
  onError: (error: unknown) => void,
  onAssetLoad?: () => void,
): void {
  scheduleIdle(
    async () => {
      const map = level.map;
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
