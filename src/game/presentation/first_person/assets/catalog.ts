import { SpriteId, type SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import { KeyColor } from "@/src/game/content/map_entities.ts";
import {
  BarrierTexture,
  type BarrierTexture as BarrierTextureType,
  TexturePack,
  type TexturePack as TexturePackType,
  type TexturePackRef,
} from "@/src/game/world/map.ts";
import {
  parseTexturePackRef,
  TEXTURE_PACK_COLUMNS,
  TEXTURE_PACK_ROWS,
  TEXTURE_PACK_TILE_COUNT,
  TEXTURE_PACKS,
} from "@/src/game/world/terrain_palette.ts";
import type { SourceFrame } from "turn-based-web-engine/raycast";

export type AtlasLayer = "walls" | "planes" | "sprites" | "spriteLightmaps";

export type TextureBakeTargetRecipe = {
  readonly layer: AtlasLayer;
  readonly slot: number;
  readonly tint?: readonly [red: number, green: number, blue: number];
  readonly frame?: SourceFrame;
};

export type FixedImageRecipe = {
  readonly src: string;
  readonly targets: readonly TextureBakeTargetRecipe[];
};

export type TexturePackDefinition = {
  readonly pack: TexturePackType;
  readonly src: string;
  readonly columns: number;
  readonly rows: number;
};

export type SpriteSheetKind = "single" | "directional";

export type SpriteSourceDefinition = {
  readonly src: string;
  readonly lightmapSrc?: string;
  readonly frame?: SourceFrame;
  /** Frame whose opaque content establishes the crop shared by every sheet cell. */
  readonly cropFrame?: SourceFrame;
  readonly sheet: SpriteSheetKind;
};

export type FirstPersonSpriteDefinition = {
  readonly spriteId: SpriteIdType;
  readonly slot: number;
  readonly source?: SpriteSourceDefinition;
  readonly fallbackColor: string;
  readonly scale: number;
  readonly elevation: number;
  readonly itemBob: boolean;
  readonly ceilingClipDistance?: number;
};

export type FirstPersonAssetCatalog = {
  readonly fixedImages: readonly FixedImageRecipe[];
  readonly texturePacks: Readonly<Record<TexturePackType, TexturePackDefinition>>;
  readonly sprites: readonly FirstPersonSpriteDefinition[];
};

export const WALL_SLOT = {
  Wall: 0,
  Door: 1,
  DoorRed: 2,
  DoorBlue: 3,
  DoorYellow: 4,
  Bars: 5,
  Glass: 6,
  Jamb: 7,
  GlassSmashed: 8,
} as const;

export const PLANE_SLOT = {
  Floor: 0,
  Ceiling: 1,
  Sky: 2,
  SkyFar: 3,
} as const;

export const FIRST_PACK_WALL_SLOT = 9;
export const FIRST_PACK_PLANE_SLOT = 4;

export const DOOR_SLOT_BY_COLOR: Readonly<Record<KeyColor, number>> = {
  [KeyColor.Red]: WALL_SLOT.DoorRed,
  [KeyColor.Blue]: WALL_SLOT.DoorBlue,
  [KeyColor.Yellow]: WALL_SLOT.DoorYellow,
};

export const BARRIER_SLOT_BY_TEXTURE: Readonly<Record<BarrierTextureType, number>> = {
  [BarrierTexture.Bars]: WALL_SLOT.Bars,
  [BarrierTexture.Glass]: WALL_SLOT.Glass,
};

/** Directional enemy sheets are 4x4: idle, walk, attack, death by facing/frame. */
export const ENEMY_SHEET_COLUMNS = 4;
export const ENEMY_SHEET_ROWS = 4;
export const ENEMY_SHEET_SLOTS = ENEMY_SHEET_COLUMNS * ENEMY_SHEET_ROWS;

const MAX_UINT8_TEXTURE_SLOT = 254;
const MAX_INT16_TEXTURE_SLOT = 32_767;
const SCALE_ACTOR = 0.8;
const SCALE_CORPSE = 0.8;
const SCALE_ITEM = 0.5;
const SCALE_TERMINAL = 1;
const SCALE_DECOR_LARGE = 1;
const SCALE_DECOR_TALL = 1;
const SCALE_DECOR_CEILING_LIGHT = 0.5;
const SCALE_DECOR_CEILING_LONG = 1;
const SCALE_MAINFRAME_CORE = 5;
const MAINFRAME_CEILING_CLIP_DISTANCE = 8;
const SCALE_SPEAR_TURRET = 1;
const ELEVATION_CEILING_LIGHT = 1 - SCALE_DECOR_CEILING_LIGHT;
const ELEVATION_CEILING_LONG = 1 - SCALE_DECOR_CEILING_LONG;
const ENEMY_CROP: SourceFrame = [0, 0, 1 / ENEMY_SHEET_COLUMNS, 1 / ENEMY_SHEET_ROWS];

const DOOR_TINT_BY_COLOR: Readonly<Record<KeyColor, readonly [number, number, number]>> = {
  [KeyColor.Red]: [1.55, 0.55, 0.5],
  [KeyColor.Blue]: [0.6, 1.05, 1.85],
  [KeyColor.Yellow]: [1.7, 1.5, 0.65],
};

// Asset URLs remain static literals so Vite includes every authored source.
const JOHN = new URL("../../../../../assets/game/sprites/john.png", import.meta.url).href;
const JOHN_LIGHT = new URL("../../../../../assets/game/sprites/john_lightmap.png", import.meta.url).href;
const DIGITAL_DOG = new URL("../../../../../assets/game/sprites/digital_dog.png", import.meta.url).href;
const DIGITAL_DOG_LIGHT = new URL("../../../../../assets/game/sprites/digital_dog_lightmap.png", import.meta.url).href;
const GUNSLINGER = new URL("../../../../../assets/game/sprites/gigabit_gun_slinger.png", import.meta.url).href;
const GUNSLINGER_LIGHT = new URL(
  "../../../../../assets/game/sprites/gigabit_gun_slinger_lightmap.png",
  import.meta.url,
).href;
const NEOPHYTE = new URL("../../../../../assets/game/sprites/network_neophyte.png", import.meta.url).href;
const NEOPHYTE_LIGHT = new URL(
  "../../../../../assets/game/sprites/network_neophyte_lightmap.png",
  import.meta.url,
).href;
const SENTINEL = new URL("../../../../../assets/game/sprites/system_sentinel.png", import.meta.url).href;
const SENTINEL_LIGHT = new URL(
  "../../../../../assets/game/sprites/system_sentinel_lightmap.png",
  import.meta.url,
).href;
const ACOLYTE = new URL("../../../../../assets/game/sprites/agentic_acolyte.png", import.meta.url).href;
const ACOLYTE_LIGHT = new URL("../../../../../assets/game/sprites/agentic_acolyte_lightmap.png", import.meta.url).href;
const TERMINAL = new URL("../../../../../assets/game/sprites/uplink_terminal.png", import.meta.url).href;
const TERMINAL_LIGHT = new URL(
  "../../../../../assets/game/sprites/uplink_terminal_lightmap.png",
  import.meta.url,
).href;
const HEALTH = new URL("../../../../../assets/game/sprites/health.png", import.meta.url).href;
const HEALTH_LIGHT = new URL("../../../../../assets/game/sprites/health_lightmap.png", import.meta.url).href;
const RED_KEY = new URL("../../../../../assets/game/sprites/red_key.png", import.meta.url).href;
const BLUE_KEY = new URL("../../../../../assets/game/sprites/blue_key.png", import.meta.url).href;
const YELLOW_KEY = new URL("../../../../../assets/game/sprites/yellow_key.png", import.meta.url).href;
const KEY_LIGHT = new URL("../../../../../assets/game/sprites/key_lightmap.png", import.meta.url).href;
const WEAPON_2 = new URL("../../../../../assets/game/sprites/weapon_2.png", import.meta.url).href;
const WEAPON_2_LIGHT = new URL("../../../../../assets/game/sprites/weapon_2_lightmap.png", import.meta.url).href;
const WEAPON_3 = new URL("../../../../../assets/game/sprites/weapon_3.png", import.meta.url).href;
const WEAPON_3_LIGHT = new URL("../../../../../assets/game/sprites/weapon_3_lightmap.png", import.meta.url).href;
const UPLINK_CODE = new URL("../../../../../assets/game/sprites/uplink_code.png", import.meta.url).href;
const UPLINK_CODE_LIGHT = new URL(
  "../../../../../assets/game/sprites/uplink_code_lightmap.png",
  import.meta.url,
).href;
const CORPSE = new URL("../../../../../assets/game/sprites/corpse.png", import.meta.url).href;
const PISTOL_AMMO = new URL("../../../../../assets/game/sprites/pistol_ammo.png", import.meta.url).href;
const PISTOL_AMMO_LIGHT = new URL(
  "../../../../../assets/game/sprites/pistol_ammo_lightmap.png",
  import.meta.url,
).href;
const CANNON_AMMO = new URL("../../../../../assets/game/sprites/cannon_ammo.png", import.meta.url).href;
const CANNON_AMMO_LIGHT = new URL(
  "../../../../../assets/game/sprites/cannon_ammo_lightmap.png",
  import.meta.url,
).href;
const DECOR_SERVER_PILE = new URL(
  "../../../../../assets/game/sprites/decor_server_pile.png",
  import.meta.url,
).href;
const DECOR_CYBORG = new URL("../../../../../assets/game/sprites/decor_cyborg.png", import.meta.url).href;
const DECOR_CEILING_HOOK = new URL(
  "../../../../../assets/game/sprites/decor_ceiling_hook.png",
  import.meta.url,
).href;
const DECOR_CEILING_LIGHT = new URL(
  "../../../../../assets/game/sprites/decor_ceiling_light.png",
  import.meta.url,
).href;
const DECOR_CEILING_WIRES = new URL(
  "../../../../../assets/game/sprites/decor_ceiling_wires.png",
  import.meta.url,
).href;
const SPEAR = new URL("../../../../../assets/game/sprites/spear.png", import.meta.url).href;
const MAINFRAME_CORE = new URL("../../../../../assets/game/sprites/mainframe_core.png", import.meta.url).href;
const SPEAR_TURRET = new URL("../../../../../assets/game/sprites/spear_turret.png", import.meta.url).href;
const SPEAR_TURRET_LOADED = new URL(
  "../../../../../assets/game/sprites/spear_turret_loaded.png",
  import.meta.url,
).href;
const TREE_1 = new URL("../../../../../assets/game/sprites/tree_1.png", import.meta.url).href;
const TREE_2 = new URL("../../../../../assets/game/sprites/tree_2.png", import.meta.url).href;
const TREE_3 = new URL("../../../../../assets/game/sprites/tree_3.png", import.meta.url).href;

const FIXED_IMAGES: readonly FixedImageRecipe[] = [
  fixedImage(new URL("../../../../../assets/game/textures/wall.png", import.meta.url).href, [
    target("walls", WALL_SLOT.Wall),
  ]),
  fixedImage(new URL("../../../../../assets/game/textures/door.png", import.meta.url).href, [
    target("walls", WALL_SLOT.Door),
    target("walls", WALL_SLOT.DoorRed, { tint: DOOR_TINT_BY_COLOR[KeyColor.Red] }),
    target("walls", WALL_SLOT.DoorBlue, { tint: DOOR_TINT_BY_COLOR[KeyColor.Blue] }),
    target("walls", WALL_SLOT.DoorYellow, { tint: DOOR_TINT_BY_COLOR[KeyColor.Yellow] }),
  ]),
  fixedImage(new URL("../../../../../assets/game/textures/jamb.png", import.meta.url).href, [
    target("walls", WALL_SLOT.Jamb),
  ]),
  fixedImage(new URL("../../../../../assets/game/textures/floor.png", import.meta.url).href, [
    target("planes", PLANE_SLOT.Floor),
  ]),
  fixedImage(new URL("../../../../../assets/game/textures/ceiling.png", import.meta.url).href, [
    target("planes", PLANE_SLOT.Ceiling),
  ]),
  fixedImage(new URL("../../../../../assets/game/textures/sky.png", import.meta.url).href, [
    target("planes", PLANE_SLOT.Sky, { frame: [0, 0, 0.5, 1] }),
    target("planes", PLANE_SLOT.SkyFar, { frame: [0.5, 0, 0.5, 1] }),
  ]),
  fixedImage(new URL("../../../../../assets/game/textures/bars.png", import.meta.url).href, [
    target("walls", WALL_SLOT.Bars),
  ]),
  fixedImage(new URL("../../../../../assets/game/textures/glass.png", import.meta.url).href, [
    target("walls", WALL_SLOT.Glass),
  ]),
  fixedImage(new URL("../../../../../assets/game/textures/glass_smashed.png", import.meta.url).href, [
    target("walls", WALL_SLOT.GlassSmashed),
  ]),
];

const TEXTURE_PACK_DEFINITIONS: Readonly<Record<TexturePackType, TexturePackDefinition>> = {
  [TexturePack.Pack1]: texturePack(
    TexturePack.Pack1,
    new URL("../../../../../assets/game/textures/pack1.png", import.meta.url).href,
  ),
  [TexturePack.Pack2]: texturePack(
    TexturePack.Pack2,
    new URL("../../../../../assets/game/textures/pack2.png", import.meta.url).href,
  ),
  [TexturePack.Pack3]: texturePack(
    TexturePack.Pack3,
    new URL("../../../../../assets/game/textures/pack3.png", import.meta.url).href,
  ),
};

const FIRST_PERSON_SPRITES: readonly FirstPersonSpriteDefinition[] = [
  sprite(SpriteId.Npc, 87, SCALE_ACTOR, "#59d39b"),
  sprite(SpriteId.John, 88, SCALE_ACTOR, "#59d39b", { source: source(JOHN, { lightmapSrc: JOHN_LIGHT }) }),
  enemy(SpriteId.DigitalDog, 0, "#ef4444", DIGITAL_DOG, DIGITAL_DOG_LIGHT),
  enemy(SpriteId.GigabitGunslinger, 16, "#38bdf8", GUNSLINGER, GUNSLINGER_LIGHT),
  enemy(SpriteId.NetworkNeophyte, 32, "#34d399", NEOPHYTE, NEOPHYTE_LIGHT),
  enemy(SpriteId.SystemSentinel, 48, "#f59e0b", SENTINEL, SENTINEL_LIGHT),
  enemy(SpriteId.AgenticAcolyte, 64, "#a78bfa", ACOLYTE, ACOLYTE_LIGHT),
  sprite(SpriteId.UplinkTerminal, 80, SCALE_TERMINAL, "#22c55e", {
    source: source(TERMINAL, { frame: [0.5, 0, 0.5, 1], lightmapSrc: TERMINAL_LIGHT }),
  }),
  item(SpriteId.HealthPatch, 81, "#59d39b", HEALTH, HEALTH_LIGHT),
  item(SpriteId.RedKey, 82, "#df4f45", RED_KEY, KEY_LIGHT),
  item(SpriteId.BlueKey, 83, "#4f8df7", BLUE_KEY, KEY_LIGHT),
  item(SpriteId.YellowKey, 84, "#f4d35e", YELLOW_KEY, KEY_LIGHT),
  item(SpriteId.Weapon2, 85, "#c084fc", WEAPON_2, WEAPON_2_LIGHT),
  item(SpriteId.Weapon3, 86, "#c084fc", WEAPON_3, WEAPON_3_LIGHT),
  item(SpriteId.UplinkCode, 89, "#7dd3fc", UPLINK_CODE, UPLINK_CODE_LIGHT),
  sprite(SpriteId.Corpse, 90, SCALE_CORPSE, "#4b5563", { source: source(CORPSE) }),
  item(SpriteId.PistolAmmo, 91, "#38bdf8", PISTOL_AMMO, PISTOL_AMMO_LIGHT),
  item(SpriteId.CannonAmmo, 92, "#f97316", CANNON_AMMO, CANNON_AMMO_LIGHT),
  decoration(SpriteId.DecorServerPile, 93, SCALE_DECOR_LARGE, 0, DECOR_SERVER_PILE),
  decoration(SpriteId.DecorCyborg, 94, SCALE_DECOR_TALL, 0, DECOR_CYBORG),
  decoration(SpriteId.DecorCeilingHook, 95, SCALE_DECOR_CEILING_LONG, ELEVATION_CEILING_LONG, DECOR_CEILING_HOOK),
  decoration(
    SpriteId.DecorCeilingLight,
    96,
    SCALE_DECOR_CEILING_LIGHT,
    ELEVATION_CEILING_LIGHT,
    DECOR_CEILING_LIGHT,
  ),
  decoration(
    SpriteId.DecorCeilingWires,
    97,
    SCALE_DECOR_CEILING_LONG,
    ELEVATION_CEILING_LONG,
    DECOR_CEILING_WIRES,
  ),
  item(SpriteId.Spear, 98, "#22d3ee", SPEAR),
  decoration(SpriteId.MainframeCore, 99, SCALE_MAINFRAME_CORE, 0, MAINFRAME_CORE, {
    ceilingClipDistance: MAINFRAME_CEILING_CLIP_DISTANCE,
  }),
  decoration(SpriteId.SpearTurret, 100, SCALE_SPEAR_TURRET, 0, SPEAR_TURRET),
  decoration(SpriteId.SpearTurretLoaded, 101, SCALE_SPEAR_TURRET, 0, SPEAR_TURRET_LOADED),
  decoration(SpriteId.DecorTree1, 102, SCALE_DECOR_TALL, 0, TREE_1),
  decoration(SpriteId.DecorTree2, 103, SCALE_DECOR_TALL, 0, TREE_2),
  decoration(SpriteId.DecorTree3, 104, SCALE_DECOR_TALL, 0, TREE_3),
];

const FIRST_PERSON_EXCLUDED_SPRITE_IDS: ReadonlySet<SpriteIdType> = new Set([
  SpriteId.Player,
]);

const CATALOG: FirstPersonAssetCatalog = {
  fixedImages: FIXED_IMAGES,
  texturePacks: TEXTURE_PACK_DEFINITIONS,
  sprites: FIRST_PERSON_SPRITES,
};

const SPRITE_BY_ID = new Map(FIRST_PERSON_SPRITES.map((definition) => [definition.spriteId, definition]));

validateFirstPersonAssetCatalog(CATALOG);

export function createFirstPersonAssetCatalog(): FirstPersonAssetCatalog {
  return CATALOG;
}

export function firstPersonSpriteDefinition(spriteId: SpriteIdType): FirstPersonSpriteDefinition | undefined {
  return SPRITE_BY_ID.get(spriteId);
}

export function texturePackSlot(layer: "walls" | "planes", texture: TexturePackRef): number {
  const { pack, column, row } = parseTexturePackRef(texture);
  const packIndex = TEXTURE_PACKS.indexOf(pack);
  const base = layer === "walls" ? FIRST_PACK_WALL_SLOT : FIRST_PACK_PLANE_SLOT;
  return base + packIndex * TEXTURE_PACK_TILE_COUNT + row * TEXTURE_PACK_COLUMNS + column;
}

export function texturePackFrame(texture: TexturePackRef): SourceFrame {
  const { column, row } = parseTexturePackRef(texture);
  return [
    column / TEXTURE_PACK_COLUMNS,
    row / TEXTURE_PACK_ROWS,
    1 / TEXTURE_PACK_COLUMNS,
    1 / TEXTURE_PACK_ROWS,
  ];
}

export function validateFirstPersonAssetCatalog(catalog: FirstPersonAssetCatalog): void {
  const claimedSlots = new Set<string>();
  const spriteIds = new Set<SpriteIdType>();

  for (const recipe of catalog.fixedImages) {
    for (const targetRecipe of recipe.targets) {
      claimSlot(claimedSlots, targetRecipe.layer, targetRecipe.slot);
    }
  }

  for (const pack of TEXTURE_PACKS) {
    const definition = catalog.texturePacks[pack];
    if (
      definition.pack !== pack || definition.columns !== TEXTURE_PACK_COLUMNS || definition.rows !== TEXTURE_PACK_ROWS
    ) {
      throw new Error(`Texture pack ${pack} must describe a ${TEXTURE_PACK_COLUMNS}x${TEXTURE_PACK_ROWS} source.`);
    }
    for (let row = 0; row < TEXTURE_PACK_ROWS; row++) {
      for (let column = 0; column < TEXTURE_PACK_COLUMNS; column++) {
        const ref = `${pack}:${column},${row}` as TexturePackRef;
        claimSlot(claimedSlots, "walls", texturePackSlot("walls", ref));
        claimSlot(claimedSlots, "planes", texturePackSlot("planes", ref));
      }
    }
  }

  for (const definition of catalog.sprites) {
    if (spriteIds.has(definition.spriteId)) {
      throw new Error(`Duplicate first-person SpriteId ${definition.spriteId}.`);
    }
    spriteIds.add(definition.spriteId);
    const slotCount = definition.source?.sheet === "directional" ? ENEMY_SHEET_SLOTS : 1;
    for (let offset = 0; offset < slotCount; offset++) {
      claimSlot(claimedSlots, "sprites", definition.slot + offset);
      if (definition.source?.lightmapSrc !== undefined) {
        claimSlot(claimedSlots, "spriteLightmaps", definition.slot + offset);
      }
    }
  }

  for (const spriteId of Object.values(SpriteId)) {
    const defined = spriteIds.has(spriteId);
    const excluded = FIRST_PERSON_EXCLUDED_SPRITE_IDS.has(spriteId);
    if (defined === excluded) {
      throw new Error(
        defined ?
          `First-person SpriteId ${spriteId} is both defined and excluded.` :
          `First-person SpriteId ${spriteId} is neither defined nor explicitly excluded.`,
      );
    }
  }
}

function claimSlot(claimedSlots: Set<string>, layer: AtlasLayer, slot: number): void {
  const max = layer === "walls" || layer === "planes" ? MAX_UINT8_TEXTURE_SLOT : MAX_INT16_TEXTURE_SLOT;
  const storage = layer === "walls" || layer === "planes" ? "Uint8" : "Int16";
  const label = layer === "walls" ?
    "wall" :
    layer === "planes" ?
    "plane" :
    layer === "sprites" ?
    "sprite" :
    "sprite lightmap";
  if (!Number.isSafeInteger(slot) || slot < 0 || slot > max) {
    throw new Error(`${label} slot ${slot} does not fit the ${storage} scene texture index.`);
  }
  const key = `${layer}:${slot}`;
  if (claimedSlots.has(key)) throw new Error(`Duplicate ${label} slot ${slot}.`);
  claimedSlots.add(key);
}

function target(
  layer: "walls" | "planes",
  slot: number,
  options: Pick<TextureBakeTargetRecipe, "frame" | "tint"> = {},
): TextureBakeTargetRecipe {
  return { layer, slot, ...options };
}

function fixedImage(src: string, targets: readonly TextureBakeTargetRecipe[]): FixedImageRecipe {
  return { src, targets };
}

function texturePack(pack: TexturePackType, src: string): TexturePackDefinition {
  return { pack, src, columns: TEXTURE_PACK_COLUMNS, rows: TEXTURE_PACK_ROWS };
}

function source(
  src: string,
  options: Omit<SpriteSourceDefinition, "src" | "sheet"> = {},
): SpriteSourceDefinition {
  return { src, sheet: "single", ...options };
}

function sprite(
  spriteId: SpriteIdType,
  slot: number,
  scale: number,
  fallbackColor: string,
  options: Partial<Pick<FirstPersonSpriteDefinition, "ceilingClipDistance" | "elevation" | "itemBob" | "source">> = {},
): FirstPersonSpriteDefinition {
  return {
    spriteId,
    slot,
    fallbackColor,
    scale,
    elevation: options.elevation ?? 0,
    itemBob: options.itemBob ?? false,
    ...(options.source === undefined ? {} : { source: options.source }),
    ...(options.ceilingClipDistance === undefined ? {} : {
      ceilingClipDistance: options.ceilingClipDistance,
    }),
  };
}

function enemy(
  spriteId: SpriteIdType,
  slot: number,
  fallbackColor: string,
  src: string,
  lightmapSrc: string,
): FirstPersonSpriteDefinition {
  return sprite(spriteId, slot, SCALE_ACTOR, fallbackColor, {
    source: { src, lightmapSrc, cropFrame: ENEMY_CROP, sheet: "directional" },
  });
}

function item(
  spriteId: SpriteIdType,
  slot: number,
  fallbackColor: string,
  src: string,
  lightmapSrc?: string,
): FirstPersonSpriteDefinition {
  return sprite(spriteId, slot, SCALE_ITEM, fallbackColor, {
    source: source(src, { ...(lightmapSrc === undefined ? {} : { lightmapSrc }) }),
    itemBob: true,
  });
}

function decoration(
  spriteId: SpriteIdType,
  slot: number,
  scale: number,
  elevation: number,
  src: string,
  options: Partial<Pick<FirstPersonSpriteDefinition, "ceilingClipDistance">> = {},
): FirstPersonSpriteDefinition {
  return sprite(spriteId, slot, scale, "#000000", {
    elevation,
    source: source(src),
    ...options,
  });
}
