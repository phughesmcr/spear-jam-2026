import { ItemKind, type ItemKind as ItemKindType } from "@/src/game/content/items.ts";
import { type EnemyArchetypeKey } from "@/src/game/content/enemies.ts";
import { type DecorationKind, KeyColor, type KeyColor as KeyColorType } from "@/src/game/content/map_entities.ts";
import { DisplayName } from "@/src/game/content/names.ts";
import { SpriteId, type SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import type { TopDownSpriteAppearance } from "@/src/game/content/sprites.ts";

type FixedItemKind = Exclude<ItemKindType, typeof ItemKind.Key | typeof ItemKind.Weapon>;
type PickupWeaponSlot = 2 | 3;

export const SHIPPED_PRESENTATION_SOURCE = {
  appearances: {
    [SpriteId.Player]: { shape: "player", color: "#f0c84b" },
    [SpriteId.Npc]: { shape: "actor", color: "#59d39b" },
    [SpriteId.John]: { shape: "actor", color: "#59d39b" },
    [SpriteId.DigitalDog]: { shape: "actor", color: "#ef4444", symbol: "D" },
    [SpriteId.GigabitGunslinger]: { shape: "actor", color: "#38bdf8", symbol: "G" },
    [SpriteId.NetworkNeophyte]: { shape: "actor", color: "#34d399", symbol: "N" },
    [SpriteId.SystemSentinel]: { shape: "actor", color: "#f59e0b", symbol: "S" },
    [SpriteId.AgenticAcolyte]: { shape: "actor", color: "#a78bfa", symbol: "A" },
    [SpriteId.UplinkTerminal]: { shape: "terminal", color: "#22c55e" },
    [SpriteId.HealthPatch]: { shape: "badge", color: "#ef4444", symbol: "+" },
    [SpriteId.RedKey]: { shape: "key", color: "#df4f45" },
    [SpriteId.BlueKey]: { shape: "key", color: "#4f8df7" },
    [SpriteId.YellowKey]: { shape: "key", color: "#f4d35e" },
    [SpriteId.Weapon2]: { shape: "weapon", color: "#c084fc", symbol: "2" },
    [SpriteId.Weapon3]: { shape: "weapon", color: "#c084fc", symbol: "3" },
    [SpriteId.UplinkCode]: { shape: "uplinkCode", color: "#7dd3fc" },
    [SpriteId.Corpse]: { shape: "corpse", color: "#4b5563" },
    [SpriteId.PistolAmmo]: { shape: "badge", color: "#38bdf8", symbol: "P" },
    [SpriteId.CannonAmmo]: { shape: "badge", color: "#f97316", symbol: "C" },
    [SpriteId.DecorServerPile]: { shape: "none", color: "#000000" },
    [SpriteId.DecorCyborg]: { shape: "none", color: "#000000" },
    [SpriteId.DecorCeilingHook]: { shape: "none", color: "#000000" },
    [SpriteId.DecorCeilingLight]: { shape: "none", color: "#000000" },
    [SpriteId.DecorCeilingWires]: { shape: "none", color: "#000000" },
    [SpriteId.Spear]: { shape: "weapon", color: "#22d3ee", symbol: "S" },
    [SpriteId.MainframeCore]: { shape: "none", color: "#000000" },
    [SpriteId.SpearTurret]: { shape: "none", color: "#000000" },
    [SpriteId.SpearTurretLoaded]: { shape: "none", color: "#000000" },
    [SpriteId.DecorTree1]: { shape: "none", color: "#000000" },
    [SpriteId.DecorTree2]: { shape: "none", color: "#000000" },
    [SpriteId.DecorTree3]: { shape: "none", color: "#000000" },
  } satisfies Readonly<Record<SpriteIdType, TopDownSpriteAppearance>>,
  displayNameSprites: {
    [DisplayName.John]: SpriteId.John,
    [DisplayName.DigitalDog]: SpriteId.Npc,
    [DisplayName.GigabitGunslinger]: SpriteId.Npc,
    [DisplayName.NetworkNeophyte]: SpriteId.Npc,
    [DisplayName.SystemSentinel]: SpriteId.Npc,
    [DisplayName.AgenticAcolyte]: SpriteId.Npc,
  } satisfies Readonly<Record<DisplayName, SpriteIdType>>,
  enemySprites: {
    meleeDog: SpriteId.DigitalDog,
    gunslinger: SpriteId.GigabitGunslinger,
    networkNeophyte: SpriteId.NetworkNeophyte,
    systemSentinel: SpriteId.SystemSentinel,
    agenticAcolyte: SpriteId.AgenticAcolyte,
  } satisfies Readonly<Record<EnemyArchetypeKey, SpriteIdType>>,
  itemSprites: {
    [ItemKind.HealthPatch]: SpriteId.HealthPatch,
    [ItemKind.PistolAmmo]: SpriteId.PistolAmmo,
    [ItemKind.CannonAmmo]: SpriteId.CannonAmmo,
    [ItemKind.UplinkCode]: SpriteId.UplinkCode,
    [ItemKind.Spear]: SpriteId.Spear,
  } satisfies Readonly<Record<FixedItemKind, SpriteIdType>>,
  keySprites: {
    [KeyColor.Red]: SpriteId.RedKey,
    [KeyColor.Blue]: SpriteId.BlueKey,
    [KeyColor.Yellow]: SpriteId.YellowKey,
  } satisfies Readonly<Record<KeyColorType, SpriteIdType>>,
  weaponSprites: {
    2: SpriteId.Weapon2,
    3: SpriteId.Weapon3,
  } satisfies Readonly<Record<PickupWeaponSlot, SpriteIdType>>,
  decorationSprites: {
    serverPile: SpriteId.DecorServerPile,
    cyborg: SpriteId.DecorCyborg,
    ceilingHook: SpriteId.DecorCeilingHook,
    ceilingLight: SpriteId.DecorCeilingLight,
    ceilingWires: SpriteId.DecorCeilingWires,
    mainframeCore: SpriteId.MainframeCore,
    tree1: SpriteId.DecorTree1,
    tree2: SpriteId.DecorTree2,
    tree3: SpriteId.DecorTree3,
  } satisfies Readonly<Record<DecorationKind, SpriteIdType>>,
} as const;
