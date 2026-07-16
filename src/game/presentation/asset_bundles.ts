import { type ImageAsset, type ImageAssetResult, preloadImageAsset } from "@/src/engine/canvas/mod.ts";
import type { CompiledLevel, PresentationContent, SimulationContent } from "@/src/game/content/catalog.ts";
import { ItemKind } from "@/src/game/content/items.ts";
import type { EntityDef } from "@/src/game/content/map_entities.ts";
import { SpriteId, type SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import type { PresentationAssetView, PresentationUiAssets } from "@/src/game/presentation/asset_view.ts";
import type { FirstPersonAssetLoader } from "@/src/game/presentation/first_person/assets/mod.ts";
import { type GameMap, keyColorCode } from "@/src/game/world/map.ts";

const ALWAYS_CRITICAL_SPRITES: readonly SpriteIdType[] = [SpriteId.Corpse];

type BundleSimulationContent = Pick<
  SimulationContent,
  "defaultEnemy" | "enemyForCode" | "enemyForKey" | "itemKindForKey"
>;

export type AssetBundleJob = (
  onChange?: () => void,
) => Promise<readonly ImageAssetResult[]>;

export type AssetBundleRequest =
  | { readonly kind: "shell" }
  | { readonly kind: "level"; readonly level: CompiledLevel }
  | { readonly kind: "deferred"; readonly level: CompiledLevel };

export type AssetBundleDependencies = {
  readonly document: Document;
  readonly view: PresentationAssetView;
  readonly firstPersonLoader: FirstPersonAssetLoader;
  readonly content: PresentationContent;
  readonly simulationContent: BundleSimulationContent;
  readonly announcedReadyAssets: WeakSet<ImageAsset>;
};

export function selectAssetBundleJobs(
  request: AssetBundleRequest,
  dependencies: AssetBundleDependencies,
): readonly AssetBundleJob[] {
  switch (request.kind) {
    case "shell":
      return [imageJob(dependencies, shellImageAssets(dependencies.view.ui))];
    case "level":
      return levelJobs(request.level, dependencies);
    case "deferred":
      return deferredJobs(request.level, dependencies);
  }
}

function levelJobs(
  level: CompiledLevel,
  dependencies: AssetBundleDependencies,
): readonly AssetBundleJob[] {
  const map = level.map;
  const spriteIds = criticalSpriteIds(map, dependencies.simulationContent, dependencies.content);
  return [
    (onChange) =>
      dependencies.firstPersonLoader.loadRequired(
        dependencies.document,
        map,
        spriteIds,
        onChange,
      ),
    imageJob(
      dependencies,
      levelImageAssets(
        dependencies.view.ui,
        mapHasPrefab(map, "npc"),
        mapHasPrefab(map, "spearPickup"),
      ),
    ),
  ];
}

function deferredJobs(
  level: CompiledLevel,
  dependencies: AssetBundleDependencies,
): readonly AssetBundleJob[] {
  const map = level.map;
  return [
    (onChange) => dependencies.firstPersonLoader.loadRemaining(dependencies.document, onChange),
    imageJob(
      dependencies,
      deferredImageAssets(
        dependencies.view.ui,
        mapHasPrefab(map, "npc"),
        mapHasPrefab(map, "spearPickup"),
      ),
    ),
  ];
}

function imageJob(
  dependencies: AssetBundleDependencies,
  assets: readonly ImageAsset[],
): AssetBundleJob {
  return async (onChange) =>
    await Promise.all(assets.map(async (asset) => {
      const result = await preloadImageAsset(dependencies.document, asset);
      if (result.kind === "ready" && !dependencies.announcedReadyAssets.has(asset)) {
        dependencies.announcedReadyAssets.add(asset);
        onChange?.();
      }
      return result;
    }));
}

function shellImageAssets(assets: PresentationUiAssets): readonly ImageAsset[] {
  return [assets.title.background, assets.help.guide];
}

function levelImageAssets(
  assets: PresentationUiAssets,
  includeDialogue: boolean,
  includeSpearReveal: boolean,
): readonly ImageAsset[] {
  const images = [
    ...Object.values(assets.verbMenu.glows),
    assets.verbMenu.sprite,
    ...Object.values(assets.weaponHud).flatMap((phases) => Object.values(phases)),
    ...Object.values(assets.hud),
    ...Object.values(assets.combatFeedback),
  ];
  if (includeDialogue) images.push(...Object.values(assets.dialogue.portraits));
  if (includeSpearReveal) images.push(assets.dialogue.spearReveal);
  return images;
}

function deferredImageAssets(
  assets: PresentationUiAssets,
  includeDialogue: boolean,
  includeSpearReveal: boolean,
): readonly ImageAsset[] {
  const images = [assets.intermission.victoryBackground];
  if (!includeDialogue) images.push(...Object.values(assets.dialogue.portraits));
  if (!includeSpearReveal) images.push(assets.dialogue.spearReveal);
  return images;
}

function mapHasPrefab(map: GameMap, prefab: EntityDef["prefab"]): boolean {
  return map.entities.some((entity) => entity.prefab === prefab);
}

function criticalSpriteIds(
  map: GameMap,
  simulation: BundleSimulationContent,
  presentation: PresentationContent,
): ReadonlySet<SpriteIdType> {
  const ids = new Set<SpriteIdType>(ALWAYS_CRITICAL_SPRITES);
  for (const entity of map.entities) {
    for (const id of spriteIdsForEntity(entity, simulation, presentation)) ids.add(id);
  }
  return ids;
}

function spriteIdsForEntity(
  entity: EntityDef,
  simulation: BundleSimulationContent,
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
