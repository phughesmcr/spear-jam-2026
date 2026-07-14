import type { SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import type { KeyColor } from "@/src/game/content/map_entities.ts";
import {
  BarrierTexture,
  type BarrierTexture as BarrierTextureType,
  type CeilingTexture,
  type FloorTexture,
  type GameMap,
  mapDimensions,
  terrainAt,
  type TexturePack,
  type TexturePackRef,
  type WallTexture,
} from "@/src/game/world/map.ts";
import { isTexturePackRef, parseTexturePackRef, SKY_CEILING_TEXTURE } from "@/src/game/world/terrain_palette.ts";
import { createImageAsset, type ImageAsset, preloadImageAsset } from "@/src/engine/canvas/image_assets.ts";
import {
  type ContentCrop,
  createImageTextureBaker,
  type ImageCropPolicy,
  type ImageTextureBaker,
  type SourceFrame,
} from "@/src/engine/raycast/image_texture_baker.ts";
import type { RaycastAtlas } from "@/src/engine/raycast/scene_data.ts";
import {
  BARRIER_SLOT_BY_TEXTURE,
  createFirstPersonAssetCatalog,
  DOOR_SLOT_BY_COLOR,
  ENEMY_SHEET_COLUMNS,
  ENEMY_SHEET_ROWS,
  type FirstPersonAssetCatalog,
  type FirstPersonSpriteDefinition,
  PLANE_SLOT,
  type TextureBakeTargetRecipe,
  texturePackFrame,
  texturePackSlot,
  WALL_SLOT,
} from "@/src/game/presentation/first_person/assets/catalog.ts";
import { createFallbackAtlas } from "@/src/game/presentation/first_person/assets/fallbacks.ts";

type SpriteAnimation = "idle" | "walk" | "attack";
type SpriteFacing = "front" | "left" | "back" | "right";
type DeathFrame = 0 | 1 | 2 | 3;

type MutableSpriteMaterial = {
  readonly slot: number;
  aspect: number;
  readonly scale: number;
  readonly elevation: number;
  readonly itemBob: boolean;
  readonly ceilingClipDistance: number;
};

type SpriteEntry = {
  readonly definition: FirstPersonSpriteDefinition;
  readonly materials: readonly MutableSpriteMaterial[];
  readonly sources: readonly ManagedSource[];
};

type ManagedSource = {
  readonly asset: ImageAsset;
};

type CropState = {
  status: "pending" | "ready" | "unavailable";
  crop?: ContentCrop;
};

type TargetCrop =
  | { readonly kind: "none" }
  | {
    readonly kind: "measure";
    state: CropState;
    readonly frame?: SourceFrame;
  }
  | {
    readonly kind: "reuse";
    state: CropState;
  };

type BakeTarget = TextureBakeTargetRecipe & {
  status: "pending" | "baked" | "unavailable";
  readonly source: ManagedSource;
  readonly crop: TargetCrop;
  readonly material?: MutableSpriteMaterial;
};

type PipelineState = {
  readonly atlas: RaycastAtlas;
  readonly baker: ImageTextureBaker;
  readonly sourcesByUrl: Map<string, ManagedSource>;
  readonly targets: BakeTarget[];
  readonly targetsByLayerSlot: Map<string, BakeTarget>;
  readonly fixedSources: ReadonlySet<ManagedSource>;
  readonly packSources: ReadonlyMap<TexturePack, ManagedSource>;
  readonly spritesById: ReadonlyMap<SpriteIdType, SpriteEntry>;
};

const ANIMATION_ROW: Readonly<Record<SpriteAnimation, number>> = {
  idle: 0,
  walk: 1,
  attack: 2,
};

const FACING_COLUMN: Readonly<Record<SpriteFacing, number>> = {
  front: 0,
  left: 1,
  back: 2,
  right: 3,
};

const SPRITE_CROP_MARGIN = 0.05;

export function createFirstPersonAssetPipeline() {
  const catalog = createFirstPersonAssetCatalog();
  const state = createPipelineState(catalog);
  return {
    atlas: state.atlas,
    materials: createMaterials(state),
    preloadRequired(
      document: Document,
      map: GameMap,
      spriteIds: ReadonlySet<SpriteIdType>,
      onChange?: () => void,
    ): Promise<void> {
      const sources = new Set(state.fixedSources);
      for (const source of registerMapTargets(state, map)) sources.add(source);
      for (const spriteId of spriteIds) {
        for (const source of state.spritesById.get(spriteId)?.sources ?? []) sources.add(source);
      }
      return loadSources(state, document, sources, onChange);
    },
    warmRemaining(document: Document, onChange?: () => void): Promise<void> {
      return loadSources(state, document, state.sourcesByUrl.values(), onChange);
    },
  };
}

function createPipelineState(catalog: FirstPersonAssetCatalog): PipelineState {
  const mutable = {
    atlas: createFallbackAtlas(catalog),
    baker: createImageTextureBaker(),
    sourcesByUrl: new Map<string, ManagedSource>(),
    targets: [] as BakeTarget[],
    targetsByLayerSlot: new Map<string, BakeTarget>(),
  };

  const fixedSources = new Set<ManagedSource>();
  for (const recipe of catalog.fixedImages) {
    const source = managedSource(mutable.sourcesByUrl, recipe.src);
    fixedSources.add(source);
    for (const target of recipe.targets) registerTarget(mutable, source, target, { kind: "none" });
  }

  const packSources = new Map<TexturePack, ManagedSource>();
  for (const definition of Object.values(catalog.texturePacks)) {
    packSources.set(definition.pack, managedSource(mutable.sourcesByUrl, definition.src));
  }

  const spritesById = new Map<SpriteIdType, SpriteEntry>();
  for (const definition of catalog.sprites) {
    spritesById.set(definition.spriteId, registerSprite(mutable, definition));
  }

  return { ...mutable, fixedSources, packSources, spritesById };
}

function managedSource(sourcesByUrl: Map<string, ManagedSource>, src: string): ManagedSource {
  const existing = sourcesByUrl.get(src);
  if (existing !== undefined) return existing;
  const source = { asset: createImageAsset(src) };
  sourcesByUrl.set(src, source);
  return source;
}

function registerSprite(
  state: Pick<PipelineState, "sourcesByUrl" | "targets" | "targetsByLayerSlot">,
  definition: FirstPersonSpriteDefinition,
): SpriteEntry {
  const slotCount = definition.source?.sheet === "directional" ? ENEMY_SHEET_COLUMNS * ENEMY_SHEET_ROWS : 1;
  const materials = Array.from(
    { length: slotCount },
    (_value, offset): MutableSpriteMaterial => ({
      slot: definition.slot + offset,
      aspect: 1,
      scale: definition.scale,
      elevation: definition.elevation,
      itemBob: definition.itemBob,
      ceilingClipDistance: definition.ceilingClipDistance ?? Number.POSITIVE_INFINITY,
    }),
  );
  const sourceDefinition = definition.source;
  if (sourceDefinition === undefined) return { definition, materials, sources: [] };

  const colorSource = managedSource(state.sourcesByUrl, sourceDefinition.src);
  const sources: ManagedSource[] = [colorSource];
  const cropState: CropState = { status: "pending" };
  const frames = spriteFrames(sourceDefinition.sheet, sourceDefinition.frame);
  for (let offset = 0; offset < frames.length; offset++) {
    registerTarget(
      state,
      colorSource,
      { layer: "sprites", slot: definition.slot + offset, frame: frames[offset] },
      offset === 0 ? { kind: "measure", state: cropState, frame: sourceDefinition.cropFrame ?? frames[offset] } : {
        kind: "reuse",
        state: cropState,
      },
      materials[offset],
    );
  }

  if (sourceDefinition.lightmapSrc !== undefined) {
    const lightmapSource = managedSource(state.sourcesByUrl, sourceDefinition.lightmapSrc);
    sources.push(lightmapSource);
    for (let offset = 0; offset < frames.length; offset++) {
      registerTarget(
        state,
        lightmapSource,
        { layer: "spriteLightmaps", slot: definition.slot + offset, frame: frames[offset] },
        { kind: "reuse", state: cropState },
      );
    }
  }
  return { definition, materials, sources };
}

function spriteFrames(
  sheet: "single" | "directional",
  frame: SourceFrame | undefined,
): readonly (SourceFrame | undefined)[] {
  if (sheet === "single") return [frame];
  const frames: SourceFrame[] = [];
  for (let row = 0; row < ENEMY_SHEET_ROWS; row++) {
    for (let column = 0; column < ENEMY_SHEET_COLUMNS; column++) {
      frames.push([
        column / ENEMY_SHEET_COLUMNS,
        row / ENEMY_SHEET_ROWS,
        1 / ENEMY_SHEET_COLUMNS,
        1 / ENEMY_SHEET_ROWS,
      ]);
    }
  }
  return frames;
}

function registerTarget(
  state: Pick<PipelineState, "targets" | "targetsByLayerSlot">,
  source: ManagedSource,
  recipe: TextureBakeTargetRecipe,
  crop: TargetCrop,
  material?: MutableSpriteMaterial,
): BakeTarget {
  const key = targetKey(recipe.layer, recipe.slot);
  const existing = state.targetsByLayerSlot.get(key);
  if (existing !== undefined) return existing;
  const target: BakeTarget = {
    ...recipe,
    status: "pending",
    source,
    crop,
    ...(material === undefined ? {} : { material }),
  };
  state.targets.push(target);
  state.targetsByLayerSlot.set(key, target);
  return target;
}

function registerMapTargets(state: PipelineState, map: GameMap): ReadonlySet<ManagedSource> {
  const sources = new Set<ManagedSource>();
  const { width, height } = mapDimensions(map);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const terrain = terrainAt(map, x, y);
      if (terrain === undefined) continue;
      if (terrain.kind === "wall") {
        registerPackTarget(state, "walls", terrain.wall_texture, sources);
        continue;
      }
      registerPackTarget(state, "planes", terrain.floor_texture, sources);
      registerPackTarget(state, "planes", terrain.ceiling_texture, sources);
    }
  }
  return sources;
}

function registerPackTarget(
  state: PipelineState,
  layer: "walls" | "planes",
  texture: WallTexture | FloorTexture | CeilingTexture,
  sources: Set<ManagedSource>,
): void {
  if (!isTexturePackRef(texture)) return;
  const { pack } = parseTexturePackRef(texture);
  const source = state.packSources.get(pack);
  if (source === undefined) throw new Error(`Missing first-person texture pack ${pack}.`);
  sources.add(source);
  registerTarget(
    state,
    source,
    {
      layer,
      slot: texturePackSlot(layer, texture as TexturePackRef),
      frame: texturePackFrame(texture as TexturePackRef),
    },
    { kind: "none" },
  );
}

async function loadSources(
  state: PipelineState,
  document: Document,
  sources: Iterable<ManagedSource>,
  onChange: (() => void) | undefined,
): Promise<void> {
  notifyIfChanged(state, onChange);
  await Promise.all([...new Set(sources)].map(async (source) => {
    await preloadImageAsset(document, source.asset);
    notifyIfChanged(state, onChange);
  }));
  notifyIfChanged(state, onChange);
}

function notifyIfChanged(state: PipelineState, onChange: (() => void) | undefined): void {
  if (compileToFixedPoint(state)) onChange?.();
}

function compileToFixedPoint(state: PipelineState): boolean {
  let changed = false;
  let advanced: boolean;
  do {
    advanced = false;
    for (const target of state.targets) {
      if (target.status !== "pending") continue;
      if (target.source.asset.failed) {
        markUnavailable(target);
        advanced = true;
        continue;
      }
      if (!target.source.asset.loaded) continue;
      const image = target.source.asset.image;
      if (image === undefined) throw new Error(`Loaded image asset has no image: ${target.source.asset.src}`);
      if (target.crop.kind === "reuse") {
        if (target.crop.state.status === "pending") continue;
        if (target.crop.state.status === "unavailable") {
          markUnavailable(target);
          advanced = true;
          continue;
        }
      }
      bakeTarget(state, target, image);
      target.status = "baked";
      advanced = true;
      changed = true;
    }
  } while (advanced);
  return changed;
}

function bakeTarget(state: PipelineState, target: BakeTarget, image: HTMLImageElement): void {
  const measured = target.crop.kind === "measure" && target.crop.state.status === "pending";
  let result;
  if (measured && !sameFrame(target.frame, target.crop.kind === "measure" ? target.crop.frame : undefined)) {
    const measurement = state.baker.bake(image, {
      frame: target.crop.kind === "measure" ? target.crop.frame : undefined,
      crop: { kind: "measure_opaque_square", margin: SPRITE_CROP_MARGIN },
      transpose: target.layer !== "planes",
      ...(target.tint === undefined ? {} : { tint: target.tint }),
    });
    if (target.crop.kind === "measure") {
      target.crop.state.status = "ready";
      target.crop.state.crop = measurement.crop;
    }
    result = state.baker.bake(image, {
      ...(target.frame === undefined ? {} : { frame: target.frame }),
      crop: cropPolicy(target.crop),
      transpose: target.layer !== "planes",
      ...(target.tint === undefined ? {} : { tint: target.tint }),
    });
  } else {
    result = state.baker.bake(image, {
      ...(target.frame === undefined ? {} : { frame: target.frame }),
      crop: measured ? { kind: "measure_opaque_square", margin: SPRITE_CROP_MARGIN } : cropPolicy(target.crop),
      transpose: target.layer !== "planes",
      ...(target.tint === undefined ? {} : { tint: target.tint }),
    });
    if (target.crop.kind === "measure" && target.crop.state.status === "pending") {
      target.crop.state.status = "ready";
      target.crop.state.crop = result.crop;
    }
  }

  state.atlas[target.layer][target.slot] = result.texture;
  if (target.material !== undefined) target.material.aspect = result.sourceAspect;
}

function cropPolicy(crop: TargetCrop): ImageCropPolicy {
  if (crop.kind === "none") return { kind: "none" };
  if (crop.state.status !== "ready" || crop.state.crop === undefined) return { kind: "none" };
  return { kind: "reuse", crop: crop.state.crop };
}

function markUnavailable(target: BakeTarget): void {
  target.status = "unavailable";
  if (target.crop.kind === "measure" && target.crop.state.status === "pending") {
    target.crop.state.status = "unavailable";
  }
}

function sameFrame(left: SourceFrame | undefined, right: SourceFrame | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2] && left[3] === right[3];
}

function targetKey(layer: string, slot: number): string {
  return `${layer}:${slot}`;
}

function createMaterials(state: PipelineState) {
  return {
    wall(texture: WallTexture): number {
      return texture === "wall" ? WALL_SLOT.Wall : texturePackSlot("walls", texture);
    },
    floor(texture: FloorTexture): number {
      return texture === "floor" ? PLANE_SLOT.Floor : texturePackSlot("planes", texture);
    },
    ceiling(texture: CeilingTexture): number {
      if (texture === "ceiling") return PLANE_SLOT.Ceiling;
      if (texture === SKY_CEILING_TEXTURE) return PLANE_SLOT.Sky;
      return texturePackSlot("planes", texture);
    },
    barrier(texture: BarrierTextureType): number {
      return BARRIER_SLOT_BY_TEXTURE[texture];
    },
    door(locked: boolean, color?: KeyColor): number {
      return locked && color !== undefined ? DOOR_SLOT_BY_COLOR[color] : WALL_SLOT.Door;
    },
    glassDoor(shattered: boolean): number {
      return shattered ? WALL_SLOT.GlassSmashed : BARRIER_SLOT_BY_TEXTURE[BarrierTexture.Glass];
    },
    sprite(spriteId: SpriteIdType): MutableSpriteMaterial | undefined {
      return state.spritesById.get(spriteId)?.materials[0];
    },
    directionalSprite(
      spriteId: SpriteIdType,
      animation: SpriteAnimation,
      facing: SpriteFacing,
    ): MutableSpriteMaterial | undefined {
      const entry = state.spritesById.get(spriteId);
      if (entry === undefined) return undefined;
      if (entry.definition.source?.sheet !== "directional") return entry.materials[0];
      return entry.materials[ANIMATION_ROW[animation] * ENEMY_SHEET_COLUMNS + FACING_COLUMN[facing]];
    },
    deathSprite(spriteId: SpriteIdType, frame: DeathFrame): MutableSpriteMaterial | undefined {
      const entry = state.spritesById.get(spriteId);
      if (entry === undefined) return undefined;
      if (entry.definition.source?.sheet !== "directional") return entry.materials[0];
      return entry.materials[(ENEMY_SHEET_ROWS - 1) * ENEMY_SHEET_COLUMNS + frame];
    },
  };
}
