import type { SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import type { KeyColor } from "@/src/game/content/map_entities.ts";
import type { BarrierTexture, CeilingTexture, FloorTexture, GameMap, WallTexture } from "@/src/game/world/map.ts";
import type { ImageAssetResult } from "turn-based-web-engine/canvas";
import type { RaycastAtlas } from "turn-based-web-engine/raycast";
import { createFirstPersonAssetPipeline } from "@/src/game/presentation/first_person/assets/pipeline.ts";

export type FirstPersonSpriteAnimation = "idle" | "walk" | "attack";
export type FirstPersonSpriteFacing = "front" | "left" | "back" | "right";
export type FirstPersonDeathFrame = 0 | 1 | 2 | 3;

export type FirstPersonSpriteMaterial = {
  readonly slot: number;
  readonly aspect: number;
  readonly scale: number;
  readonly elevation: number;
  readonly itemBob: boolean;
  readonly ceilingClipDistance: number;
};

export interface FirstPersonMaterials {
  wall(texture: WallTexture): number;
  floor(texture: FloorTexture): number;
  ceiling(texture: CeilingTexture): number;
  barrier(texture: BarrierTexture): number;
  door(locked: boolean, color?: KeyColor): number;
  glassDoor(shattered: boolean): number;
  sprite(spriteId: SpriteIdType): FirstPersonSpriteMaterial | undefined;
  directionalSprite(
    spriteId: SpriteIdType,
    animation: FirstPersonSpriteAnimation,
    facing: FirstPersonSpriteFacing,
  ): FirstPersonSpriteMaterial | undefined;
  deathSprite(spriteId: SpriteIdType, frame: FirstPersonDeathFrame): FirstPersonSpriteMaterial | undefined;
}

export interface FirstPersonAssetView {
  readonly atlas: RaycastAtlas;
  readonly materials: FirstPersonMaterials;
}

export interface FirstPersonAssetLoader {
  loadRequired(
    document: Document,
    map: GameMap,
    spriteIds: ReadonlySet<SpriteIdType>,
    onChange?: () => void,
  ): Promise<readonly ImageAssetResult[]>;
}

export interface FirstPersonAssets {
  readonly view: FirstPersonAssetView;
  readonly loader: FirstPersonAssetLoader;
}

export function createFirstPersonAssets(): FirstPersonAssets {
  return createFirstPersonAssetPipeline();
}
