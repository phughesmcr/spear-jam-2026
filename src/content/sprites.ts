import { ItemKind, type ItemKind as ItemKindType } from "@/src/content/items.ts";
import { SpriteId, type SpriteId as SpriteIdType } from "@/src/content/sprite_ids.ts";
import { DisplayName } from "@/src/game/names.ts";
import {
  type DecorationKind as DecorationKindType,
  KeyColor,
  type KeyColor as KeyColorType,
  keyColorForCode,
} from "@/src/map/map.ts";

type TopDownShape = "actor" | "badge" | "corpse" | "key" | "none" | "player" | "terminal" | "uplinkCode" | "weapon";
type SpriteSourceFrame = readonly [number, number, number, number];
type SpriteAsset = {
  readonly src: string;
  readonly frame?: SpriteSourceFrame;
  readonly lightmapSrc?: string;
  readonly cropFrame?: SpriteSourceFrame;
};

export type SpriteAppearance = {
  readonly firstPersonSlot?: number;
  readonly firstPersonScale: number;
  readonly firstPersonElevation: number;
  readonly fallbackColor?: string;
  readonly asset?: SpriteAsset;
  readonly enemySheet: boolean;
  readonly itemBob: boolean;
  readonly topDownShape: TopDownShape;
  readonly topDownColor: string;
  readonly topDownSymbol?: string;
};

const SCALE_ACTOR = 0.75;
const SCALE_CORPSE = 0.6;
const SCALE_ITEM = 0.4;
const SCALE_TERMINAL = 0.9;
const SCALE_DECOR_LARGE = 0.85;
const SCALE_DECOR_TALL = 0.95;
const SCALE_DECOR_CEILING_LIGHT = 0.45;
const SCALE_DECOR_CEILING_LONG = 0.75;
const SCALE_MAINFRAME_CORE = 1;
const SCALE_SPEAR_TURRET = 0.9;
const ELEVATION_CEILING_LIGHT = 1 - SCALE_DECOR_CEILING_LIGHT;
const ELEVATION_CEILING_LONG = 1 - SCALE_DECOR_CEILING_LONG;
const ENEMY_CROP: SpriteSourceFrame = [0, 0, 1 / 4, 1 / 4];

// Sprite asset URLs must be static `new URL` literals so Vite can resolve them.
const JOHN = new URL("../../assets/game/sprites/john.png", import.meta.url).href;
const JOHN_LIGHT = new URL("../../assets/game/sprites/john_lightmap.png", import.meta.url).href;
const DIGITAL_DOG = new URL("../../assets/game/sprites/digital_dog.png", import.meta.url).href;
const DIGITAL_DOG_LIGHT = new URL("../../assets/game/sprites/digital_dog_lightmap.png", import.meta.url).href;
const GUNSLINGER = new URL("../../assets/game/sprites/gigabit_gun_slinger.png", import.meta.url).href;
const GUNSLINGER_LIGHT = new URL("../../assets/game/sprites/gigabit_gun_slinger_lightmap.png", import.meta.url).href;
const NEOPHYTE = new URL("../../assets/game/sprites/network_neophyte.png", import.meta.url).href;
const NEOPHYTE_LIGHT = new URL("../../assets/game/sprites/network_neophyte_lightmap.png", import.meta.url).href;
const SENTINEL = new URL("../../assets/game/sprites/system_sentinel.png", import.meta.url).href;
const SENTINEL_LIGHT = new URL("../../assets/game/sprites/system_sentinel_lightmap.png", import.meta.url).href;
const ACOLYTE = new URL("../../assets/game/sprites/agentic_acolyte.png", import.meta.url).href;
const ACOLYTE_LIGHT = new URL("../../assets/game/sprites/agentic_acolyte_lightmap.png", import.meta.url).href;
const TERMINAL = new URL("../../assets/game/sprites/uplink_terminal.png", import.meta.url).href;
const TERMINAL_LIGHT = new URL("../../assets/game/sprites/uplink_terminal_lightmap.png", import.meta.url).href;
const HEALTH = new URL("../../assets/game/sprites/health.png", import.meta.url).href;
const HEALTH_LIGHT = new URL("../../assets/game/sprites/health_lightmap.png", import.meta.url).href;
const RED_KEY = new URL("../../assets/game/sprites/red_key.png", import.meta.url).href;
const BLUE_KEY = new URL("../../assets/game/sprites/blue_key.png", import.meta.url).href;
const YELLOW_KEY = new URL("../../assets/game/sprites/yellow_key.png", import.meta.url).href;
const KEY_LIGHT = new URL("../../assets/game/sprites/key_lightmap.png", import.meta.url).href;
const WEAPON_2 = new URL("../../assets/game/sprites/weapon_2.png", import.meta.url).href;
const WEAPON_2_LIGHT = new URL("../../assets/game/sprites/weapon_2_lightmap.png", import.meta.url).href;
const WEAPON_3 = new URL("../../assets/game/sprites/weapon_3.png", import.meta.url).href;
const WEAPON_3_LIGHT = new URL("../../assets/game/sprites/weapon_3_lightmap.png", import.meta.url).href;
const UPLINK_CODE = new URL("../../assets/game/sprites/uplink_code.png", import.meta.url).href;
const UPLINK_CODE_LIGHT = new URL("../../assets/game/sprites/uplink_code_lightmap.png", import.meta.url).href;
const CORPSE = new URL("../../assets/game/sprites/corpse.png", import.meta.url).href;
const PISTOL_AMMO = new URL("../../assets/game/sprites/pistol_ammo.png", import.meta.url).href;
const PISTOL_AMMO_LIGHT = new URL("../../assets/game/sprites/pistol_ammo_lightmap.png", import.meta.url).href;
const CANNON_AMMO = new URL("../../assets/game/sprites/cannon_ammo.png", import.meta.url).href;
const CANNON_AMMO_LIGHT = new URL("../../assets/game/sprites/cannon_ammo_lightmap.png", import.meta.url).href;
const DECOR_SERVER_PILE = new URL("../../assets/game/sprites/decor_server_pile.png", import.meta.url).href;
const DECOR_CYBORG = new URL("../../assets/game/sprites/decor_cyborg.png", import.meta.url).href;
const DECOR_CEILING_HOOK = new URL("../../assets/game/sprites/decor_ceiling_hook.png", import.meta.url).href;
const DECOR_CEILING_LIGHT = new URL("../../assets/game/sprites/decor_ceiling_light.png", import.meta.url).href;
const DECOR_CEILING_WIRES = new URL("../../assets/game/sprites/decor_ceiling_wires.png", import.meta.url).href;
const SPEAR = new URL("../../assets/game/sprites/spear.png", import.meta.url).href;
const MAINFRAME_CORE = new URL("../../assets/game/sprites/mainframe_core.png", import.meta.url).href;
const SPEAR_TURRET = new URL("../../assets/game/sprites/spear_turret.png", import.meta.url).href;
const SPEAR_TURRET_LOADED = new URL("../../assets/game/sprites/spear_turret_loaded.png", import.meta.url).href;
const TREE_1 = new URL("../../assets/game/sprites/tree_1.png", import.meta.url).href;
const TREE_2 = new URL("../../assets/game/sprites/tree_2.png", import.meta.url).href;
const TREE_3 = new URL("../../assets/game/sprites/tree_3.png", import.meta.url).href;

const SPRITE_APPEARANCES: Readonly<Record<SpriteIdType, SpriteAppearance>> = {
  [SpriteId.Player]: appearance(undefined, SCALE_ACTOR, "player", "#f0c84b"),
  [SpriteId.Npc]: appearance(87, SCALE_ACTOR, "actor", "#59d39b"),
  [SpriteId.John]: appearance(88, SCALE_ACTOR, "actor", "#59d39b", {
    asset: spriteAsset(JOHN, undefined, JOHN_LIGHT),
  }),
  [SpriteId.DigitalDog]: enemyAppearance(0, "#ef4444", "D", DIGITAL_DOG, DIGITAL_DOG_LIGHT),
  [SpriteId.GigabitGunslinger]: enemyAppearance(16, "#38bdf8", "G", GUNSLINGER, GUNSLINGER_LIGHT),
  [SpriteId.NetworkNeophyte]: enemyAppearance(32, "#34d399", "N", NEOPHYTE, NEOPHYTE_LIGHT),
  [SpriteId.SystemSentinel]: enemyAppearance(48, "#f59e0b", "S", SENTINEL, SENTINEL_LIGHT),
  [SpriteId.AgenticAcolyte]: enemyAppearance(64, "#a78bfa", "A", ACOLYTE, ACOLYTE_LIGHT),
  [SpriteId.UplinkTerminal]: appearance(80, SCALE_TERMINAL, "terminal", "#22c55e", {
    asset: spriteAsset(TERMINAL, [0.5, 0, 0.5, 1], TERMINAL_LIGHT),
  }),
  [SpriteId.HealthPatch]: itemAppearance(81, "badge", "#ef4444", HEALTH, HEALTH_LIGHT, "+", "#59d39b"),
  [SpriteId.RedKey]: itemAppearance(82, "key", "#df4f45", RED_KEY, KEY_LIGHT),
  [SpriteId.BlueKey]: itemAppearance(83, "key", "#4f8df7", BLUE_KEY, KEY_LIGHT),
  [SpriteId.YellowKey]: itemAppearance(84, "key", "#f4d35e", YELLOW_KEY, KEY_LIGHT),
  [SpriteId.Weapon2]: itemAppearance(85, "weapon", "#c084fc", WEAPON_2, WEAPON_2_LIGHT, "2"),
  [SpriteId.Weapon3]: itemAppearance(86, "weapon", "#c084fc", WEAPON_3, WEAPON_3_LIGHT, "3"),
  [SpriteId.UplinkCode]: itemAppearance(89, "uplinkCode", "#7dd3fc", UPLINK_CODE, UPLINK_CODE_LIGHT),
  [SpriteId.Corpse]: appearance(90, SCALE_CORPSE, "corpse", "#4b5563", {
    asset: spriteAsset(CORPSE),
  }),
  [SpriteId.PistolAmmo]: itemAppearance(91, "badge", "#38bdf8", PISTOL_AMMO, PISTOL_AMMO_LIGHT, "P"),
  [SpriteId.CannonAmmo]: itemAppearance(92, "badge", "#f97316", CANNON_AMMO, CANNON_AMMO_LIGHT, "C"),
  [SpriteId.DecorServerPile]: decorationAppearance(93, SCALE_DECOR_LARGE, 0, DECOR_SERVER_PILE),
  [SpriteId.DecorCyborg]: decorationAppearance(94, SCALE_DECOR_TALL, 0, DECOR_CYBORG),
  [SpriteId.DecorCeilingHook]: decorationAppearance(
    95,
    SCALE_DECOR_CEILING_LONG,
    ELEVATION_CEILING_LONG,
    DECOR_CEILING_HOOK,
  ),
  [SpriteId.DecorCeilingLight]: decorationAppearance(
    96,
    SCALE_DECOR_CEILING_LIGHT,
    ELEVATION_CEILING_LIGHT,
    DECOR_CEILING_LIGHT,
  ),
  [SpriteId.DecorCeilingWires]: decorationAppearance(
    97,
    SCALE_DECOR_CEILING_LONG,
    ELEVATION_CEILING_LONG,
    DECOR_CEILING_WIRES,
  ),
  [SpriteId.Spear]: itemAppearance(98, "weapon", "#22d3ee", SPEAR, undefined, "S"),
  [SpriteId.MainframeCore]: decorationAppearance(99, SCALE_MAINFRAME_CORE, 0, MAINFRAME_CORE),
  [SpriteId.SpearTurret]: decorationAppearance(100, SCALE_SPEAR_TURRET, 0, SPEAR_TURRET),
  [SpriteId.SpearTurretLoaded]: decorationAppearance(101, SCALE_SPEAR_TURRET, 0, SPEAR_TURRET_LOADED),
  [SpriteId.DecorTree1]: decorationAppearance(102, SCALE_DECOR_TALL, 0, TREE_1),
  [SpriteId.DecorTree2]: decorationAppearance(103, SCALE_DECOR_TALL, 0, TREE_2),
  [SpriteId.DecorTree3]: decorationAppearance(104, SCALE_DECOR_TALL, 0, TREE_3),
};

const SPRITE_APPEARANCE_LIST = Object.values(SPRITE_APPEARANCES);

const ITEM_SPRITE_IDS: Readonly<
  Record<Exclude<ItemKindType, typeof ItemKind.Key | typeof ItemKind.Weapon>, SpriteIdType>
> = {
  [ItemKind.HealthPatch]: SpriteId.HealthPatch,
  [ItemKind.PistolAmmo]: SpriteId.PistolAmmo,
  [ItemKind.CannonAmmo]: SpriteId.CannonAmmo,
  [ItemKind.UplinkCode]: SpriteId.UplinkCode,
  [ItemKind.Spear]: SpriteId.Spear,
};

const KEY_SPRITE_IDS: Readonly<Record<KeyColorType, SpriteIdType>> = {
  [KeyColor.Red]: SpriteId.RedKey,
  [KeyColor.Blue]: SpriteId.BlueKey,
  [KeyColor.Yellow]: SpriteId.YellowKey,
};

const DECORATION_SPRITE_IDS: Readonly<Record<DecorationKindType, SpriteIdType>> = {
  serverPile: SpriteId.DecorServerPile,
  cyborg: SpriteId.DecorCyborg,
  ceilingHook: SpriteId.DecorCeilingHook,
  ceilingLight: SpriteId.DecorCeilingLight,
  ceilingWires: SpriteId.DecorCeilingWires,
  mainframeCore: SpriteId.MainframeCore,
  tree1: SpriteId.DecorTree1,
  tree2: SpriteId.DecorTree2,
  tree3: SpriteId.DecorTree3,
};

export function spriteAppearance(id: SpriteIdType): SpriteAppearance {
  return SPRITE_APPEARANCES[id];
}

export function spriteAppearances(): readonly SpriteAppearance[] {
  return SPRITE_APPEARANCE_LIST;
}

export function spriteIdForDisplayName(displayName: DisplayName): SpriteIdType {
  return displayName === DisplayName.John ? SpriteId.John : SpriteId.Npc;
}

export function spriteIdForItem(item: ItemKindType, value: number): SpriteIdType {
  switch (item) {
    case ItemKind.HealthPatch:
    case ItemKind.PistolAmmo:
    case ItemKind.CannonAmmo:
    case ItemKind.UplinkCode:
    case ItemKind.Spear:
      return ITEM_SPRITE_IDS[item];
    case ItemKind.Key:
      return KEY_SPRITE_IDS[keyColorForCode(value)];
    case ItemKind.Weapon:
      return value === 2 ? SpriteId.Weapon2 : SpriteId.Weapon3;
    default: {
      const _exhaustive: never = item;
      return _exhaustive;
    }
  }
}

export function spriteIdForDecoration(decoration: DecorationKindType): SpriteIdType {
  return DECORATION_SPRITE_IDS[decoration];
}

function spriteAsset(
  src: string,
  frame?: SpriteSourceFrame,
  lightmapSrc?: string,
  cropFrame?: SpriteSourceFrame,
): SpriteAsset {
  return {
    src,
    ...(frame === undefined ? {} : { frame }),
    ...(lightmapSrc === undefined ? {} : { lightmapSrc }),
    ...(cropFrame === undefined ? {} : { cropFrame }),
  };
}

function appearance(
  firstPersonSlot: number | undefined,
  firstPersonScale: number,
  topDownShape: TopDownShape,
  topDownColor: string,
  options: Partial<SpriteAppearance> = {},
): SpriteAppearance {
  return {
    firstPersonSlot,
    firstPersonScale,
    firstPersonElevation: options.firstPersonElevation ?? 0,
    ...(firstPersonSlot === undefined ? {} : { fallbackColor: options.fallbackColor ?? topDownColor }),
    ...(options.asset === undefined ? {} : { asset: options.asset }),
    enemySheet: options.enemySheet ?? false,
    itemBob: options.itemBob ?? false,
    topDownShape,
    topDownColor,
    ...(options.topDownSymbol === undefined ? {} : { topDownSymbol: options.topDownSymbol }),
  };
}

function enemyAppearance(
  firstPersonSlot: number,
  topDownColor: string,
  topDownSymbol: string,
  src: string,
  lightmapSrc: string,
): SpriteAppearance {
  return appearance(firstPersonSlot, SCALE_ACTOR, "actor", topDownColor, {
    enemySheet: true,
    asset: spriteAsset(src, undefined, lightmapSrc, ENEMY_CROP),
    topDownSymbol,
  });
}

function itemAppearance(
  firstPersonSlot: number,
  topDownShape: TopDownShape,
  topDownColor: string,
  src: string,
  lightmapSrc?: string,
  topDownSymbol?: string,
  fallbackColor = topDownColor,
): SpriteAppearance {
  return appearance(firstPersonSlot, SCALE_ITEM, topDownShape, topDownColor, {
    asset: spriteAsset(src, undefined, lightmapSrc),
    fallbackColor,
    itemBob: true,
    ...(topDownSymbol === undefined ? {} : { topDownSymbol }),
  });
}

function decorationAppearance(
  firstPersonSlot: number,
  firstPersonScale: number,
  firstPersonElevation: number,
  src: string,
): SpriteAppearance {
  return appearance(firstPersonSlot, firstPersonScale, "none", "#000000", {
    asset: spriteAsset(src),
    firstPersonElevation,
  });
}
