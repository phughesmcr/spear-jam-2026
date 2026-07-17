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
import {
  createImageAsset,
  type ImageAsset,
  type ImageAssetResult,
  preloadImageAsset,
} from "@/src/engine/canvas/mod.ts";
import {
  type ContentCrop,
  createImageTextureBaker,
  type ImageCropPolicy,
  type ImageTextureBaker,
  type RaycastAtlas,
  type SourceFrame,
} from "@/src/engine/raycast/mod.ts";
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
  readonly targets: readonly BakeTarget[];
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
  readonly fallbackAtlas: RaycastAtlas;
  readonly baker: ImageTextureBaker;
  readonly sourcesByUrl: Map<string, ManagedSource>;
  readonly targetsByLayerSlot: Map<string, BakeTarget>;
  readonly fixedSources: ReadonlySet<ManagedSource>;
  readonly fixedTargets: ReadonlySet<BakeTarget>;
  readonly packSources: ReadonlyMap<TexturePack, ManagedSource>;
  readonly spritesById: ReadonlyMap<SpriteIdType, SpriteEntry>;
  readonly activeTargets: Set<BakeTarget>;
  readonly residentTargets: Set<BakeTarget>;
  activeRevision: number;
  nextRevision: number;
};

type TargetSelection = {
  readonly revision: number;
  readonly targets: ReadonlySet<BakeTarget>;
  readonly previousActiveRevision: number;
  readonly previousActiveTargets: ReadonlySet<BakeTarget>;
  readonly previousResidentTargets: ReadonlySet<BakeTarget>;
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
  const view = {
    atlas: state.atlas,
    materials: createMaterials(state),
  };
  return {
    view,
    loader: {
      loadRequired(
        document: Document,
        map: GameMap,
        spriteIds: ReadonlySet<SpriteIdType>,
        onChange?: () => void,
      ): Promise<readonly ImageAssetResult[]> {
        const sources = new Set(state.fixedSources);
        const targets = new Set(state.fixedTargets);
        const mapSelection = registerMapTargets(state, map);
        for (const source of mapSelection.sources) sources.add(source);
        for (const target of mapSelection.targets) targets.add(target);
        for (const spriteId of spriteIds) {
          const sprite = state.spritesById.get(spriteId);
          for (const source of sprite?.sources ?? []) sources.add(source);
          for (const target of sprite?.targets ?? []) targets.add(target);
        }
        const selection = beginSelection(state, targets);
        return loadSelection(state, selection, document, sources, onChange);
      },
    },
  };
}

function createPipelineState(catalog: FirstPersonAssetCatalog): PipelineState {
  const fallbackAtlas = createFallbackAtlas(catalog);
  const mutable = {
    atlas: cloneAtlas(fallbackAtlas),
    baker: createImageTextureBaker(),
    sourcesByUrl: new Map<string, ManagedSource>(),
    targetsByLayerSlot: new Map<string, BakeTarget>(),
  };

  const fixedSources = new Set<ManagedSource>();
  const fixedTargets = new Set<BakeTarget>();
  for (const recipe of catalog.fixedImages) {
    const source = managedSource(mutable.sourcesByUrl, recipe.src);
    fixedSources.add(source);
    for (const target of recipe.targets) {
      fixedTargets.add(registerTarget(mutable, source, target, { kind: "none" }));
    }
  }

  const packSources = new Map<TexturePack, ManagedSource>();
  for (const definition of Object.values(catalog.texturePacks)) {
    packSources.set(definition.pack, managedSource(mutable.sourcesByUrl, definition.src));
  }

  const spritesById = new Map<SpriteIdType, SpriteEntry>();
  for (const definition of catalog.sprites) {
    spritesById.set(definition.spriteId, registerSprite(mutable, definition));
  }

  return {
    ...mutable,
    fallbackAtlas,
    fixedSources,
    fixedTargets,
    packSources,
    spritesById,
    activeTargets: new Set(),
    residentTargets: new Set(),
    activeRevision: 0,
    nextRevision: 0,
  };
}

function cloneAtlas(atlas: RaycastAtlas): RaycastAtlas {
  return {
    ...atlas,
    walls: [...atlas.walls],
    planes: [...atlas.planes],
    sprites: [...atlas.sprites],
    spriteLightmaps: [...atlas.spriteLightmaps],
  };
}

function beginSelection(state: PipelineState, targets: ReadonlySet<BakeTarget>): TargetSelection {
  const selection = {
    revision: ++state.nextRevision,
    targets,
    previousActiveRevision: state.activeRevision,
    previousActiveTargets: new Set(state.activeTargets),
    previousResidentTargets: new Set(state.residentTargets),
  };
  state.activeRevision = selection.revision;
  state.activeTargets.clear();
  for (const target of targets) state.activeTargets.add(target);
  return selection;
}

async function loadSelection(
  state: PipelineState,
  selection: TargetSelection,
  document: Document,
  sources: Iterable<ManagedSource>,
  onChange: (() => void) | undefined,
): Promise<readonly ImageAssetResult[]> {
  try {
    const results = await loadSources(state, document, sources, selection.targets, onChange);
    if (state.activeRevision === selection.revision) pruneResidentTargets(state, selection.targets);
    return results;
  } catch (error) {
    if (state.activeRevision === selection.revision) rollbackSelection(state, selection);
    throw error;
  }
}

function pruneResidentTargets(state: PipelineState, targets: ReadonlySet<BakeTarget>): void {
  for (const target of state.residentTargets) {
    if (targets.has(target)) continue;
    restoreFallback(state, target);
    target.status = "pending";
    state.residentTargets.delete(target);
  }
}

function rollbackSelection(state: PipelineState, selection: TargetSelection): void {
  for (const target of state.residentTargets) {
    if (selection.previousResidentTargets.has(target)) continue;
    restoreFallback(state, target);
    target.status = "pending";
    state.residentTargets.delete(target);
  }
  state.activeRevision = selection.previousActiveRevision;
  state.activeTargets.clear();
  for (const target of selection.previousActiveTargets) state.activeTargets.add(target);
}

function restoreFallback(state: PipelineState, target: BakeTarget): void {
  const fallback = state.fallbackAtlas[target.layer][target.slot];
  if (fallback === undefined) {
    Reflect.deleteProperty(state.atlas[target.layer], target.slot);
    return;
  }
  state.atlas[target.layer][target.slot] = fallback;
}

function managedSource(sourcesByUrl: Map<string, ManagedSource>, src: string): ManagedSource {
  const existing = sourcesByUrl.get(src);
  if (existing !== undefined) return existing;
  const source = { asset: createImageAsset(src) };
  sourcesByUrl.set(src, source);
  return source;
}

function registerSprite(
  state: Pick<PipelineState, "sourcesByUrl" | "targetsByLayerSlot">,
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
  if (sourceDefinition === undefined) return { definition, materials, sources: [], targets: [] };

  const colorSource = managedSource(state.sourcesByUrl, sourceDefinition.src);
  const sources: ManagedSource[] = [colorSource];
  const targets: BakeTarget[] = [];
  const cropState: CropState = { status: "pending" };
  const frames = spriteFrames(sourceDefinition.sheet, sourceDefinition.frame);
  for (let offset = 0; offset < frames.length; offset++) {
    targets.push(registerTarget(
      state,
      colorSource,
      { layer: "sprites", slot: definition.slot + offset, frame: frames[offset] },
      offset === 0 ? { kind: "measure", state: cropState, frame: sourceDefinition.cropFrame ?? frames[offset] } : {
        kind: "reuse",
        state: cropState,
      },
      materials[offset],
    ));
  }

  if (sourceDefinition.lightmapSrc !== undefined) {
    const lightmapSource = managedSource(state.sourcesByUrl, sourceDefinition.lightmapSrc);
    sources.push(lightmapSource);
    for (let offset = 0; offset < frames.length; offset++) {
      targets.push(registerTarget(
        state,
        lightmapSource,
        { layer: "spriteLightmaps", slot: definition.slot + offset, frame: frames[offset] },
        { kind: "reuse", state: cropState },
      ));
    }
  }
  return { definition, materials, sources, targets };
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
  state: Pick<PipelineState, "targetsByLayerSlot">,
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
  state.targetsByLayerSlot.set(key, target);
  return target;
}

function registerMapTargets(
  state: PipelineState,
  map: GameMap,
): { readonly sources: ReadonlySet<ManagedSource>; readonly targets: ReadonlySet<BakeTarget> } {
  const sources = new Set<ManagedSource>();
  const targets = new Set<BakeTarget>();
  const { width, height } = mapDimensions(map);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const terrain = terrainAt(map, x, y);
      if (terrain === undefined) continue;
      if (terrain.kind === "wall") {
        registerPackTarget(state, "walls", terrain.wall_texture, sources, targets);
        continue;
      }
      registerPackTarget(state, "planes", terrain.floor_texture, sources, targets);
      registerPackTarget(state, "planes", terrain.ceiling_texture, sources, targets);
    }
  }
  return { sources, targets };
}

function registerPackTarget(
  state: PipelineState,
  layer: "walls" | "planes",
  texture: WallTexture | FloorTexture | CeilingTexture,
  sources: Set<ManagedSource>,
  targets: Set<BakeTarget>,
): void {
  if (!isTexturePackRef(texture)) return;
  const { pack } = parseTexturePackRef(texture);
  const source = state.packSources.get(pack);
  if (source === undefined) throw new Error(`Missing first-person texture pack ${pack}.`);
  sources.add(source);
  targets.add(registerTarget(
    state,
    source,
    {
      layer,
      slot: texturePackSlot(layer, texture as TexturePackRef),
      frame: texturePackFrame(texture as TexturePackRef),
    },
    { kind: "none" },
  ));
}

async function loadSources(
  state: PipelineState,
  document: Document,
  sources: Iterable<ManagedSource>,
  targets: Iterable<BakeTarget>,
  onChange: (() => void) | undefined,
): Promise<readonly ImageAssetResult[]> {
  const selectedTargets = [...new Set(targets)];
  notifyIfChanged(state, selectedTargets, onChange);
  const uniqueSources = [...new Set(sources)];
  const results = await Promise.all(uniqueSources.map(async (source) => {
    const result = await preloadImageAsset(document, source.asset);
    notifyIfChanged(state, selectedTargets, onChange);
    return result;
  }));
  notifyIfChanged(state, selectedTargets, onChange);
  return results;
}

function notifyIfChanged(
  state: PipelineState,
  targets: readonly BakeTarget[],
  onChange: (() => void) | undefined,
): void {
  if (compileToFixedPoint(state, targets)) onChange?.();
}

function compileToFixedPoint(state: PipelineState, targets: readonly BakeTarget[]): boolean {
  let changed = false;
  let advanced: boolean;
  do {
    advanced = false;
    for (const target of targets) {
      if (!state.activeTargets.has(target)) continue;
      if (target.status !== "pending") continue;
      if (target.source.asset.state.type === "unavailable") {
        markUnavailable(target);
        advanced = true;
        continue;
      }
      if (target.source.asset.state.type !== "ready") continue;
      const image = target.source.asset.state.image;
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
  state.residentTargets.add(target);
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
