import { ItemKind, type ItemKind as ItemKindType } from "@/src/game/content/items.ts";
import { SpriteId, type SpriteId as SpriteIdType } from "@/src/game/content/sprite_ids.ts";
import { DisplayName } from "@/src/game/content/names.ts";
import {
  type DecorationKind as DecorationKindType,
  KeyColor,
  type KeyColor as KeyColorType,
} from "@/src/game/content/map_entities.ts";
import { keyColorForCode } from "@/src/game/world/map.ts";

type TopDownShape = "actor" | "badge" | "corpse" | "key" | "none" | "player" | "terminal" | "uplinkCode" | "weapon";

export type TopDownSpriteAppearance = {
  readonly shape: TopDownShape;
  readonly color: string;
  readonly symbol?: string;
};

const TOP_DOWN_APPEARANCES: Readonly<Record<SpriteIdType, TopDownSpriteAppearance>> = {
  [SpriteId.Player]: appearance("player", "#f0c84b"),
  [SpriteId.Npc]: appearance("actor", "#59d39b"),
  [SpriteId.John]: appearance("actor", "#59d39b"),
  [SpriteId.DigitalDog]: appearance("actor", "#ef4444", "D"),
  [SpriteId.GigabitGunslinger]: appearance("actor", "#38bdf8", "G"),
  [SpriteId.NetworkNeophyte]: appearance("actor", "#34d399", "N"),
  [SpriteId.SystemSentinel]: appearance("actor", "#f59e0b", "S"),
  [SpriteId.AgenticAcolyte]: appearance("actor", "#a78bfa", "A"),
  [SpriteId.UplinkTerminal]: appearance("terminal", "#22c55e"),
  [SpriteId.HealthPatch]: appearance("badge", "#ef4444", "+"),
  [SpriteId.RedKey]: appearance("key", "#df4f45"),
  [SpriteId.BlueKey]: appearance("key", "#4f8df7"),
  [SpriteId.YellowKey]: appearance("key", "#f4d35e"),
  [SpriteId.Weapon2]: appearance("weapon", "#c084fc", "2"),
  [SpriteId.Weapon3]: appearance("weapon", "#c084fc", "3"),
  [SpriteId.UplinkCode]: appearance("uplinkCode", "#7dd3fc"),
  [SpriteId.Corpse]: appearance("corpse", "#4b5563"),
  [SpriteId.PistolAmmo]: appearance("badge", "#38bdf8", "P"),
  [SpriteId.CannonAmmo]: appearance("badge", "#f97316", "C"),
  [SpriteId.DecorServerPile]: appearance("none", "#000000"),
  [SpriteId.DecorCyborg]: appearance("none", "#000000"),
  [SpriteId.DecorCeilingHook]: appearance("none", "#000000"),
  [SpriteId.DecorCeilingLight]: appearance("none", "#000000"),
  [SpriteId.DecorCeilingWires]: appearance("none", "#000000"),
  [SpriteId.Spear]: appearance("weapon", "#22d3ee", "S"),
  [SpriteId.MainframeCore]: appearance("none", "#000000"),
  [SpriteId.SpearTurret]: appearance("none", "#000000"),
  [SpriteId.SpearTurretLoaded]: appearance("none", "#000000"),
  [SpriteId.DecorTree1]: appearance("none", "#000000"),
  [SpriteId.DecorTree2]: appearance("none", "#000000"),
  [SpriteId.DecorTree3]: appearance("none", "#000000"),
};

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

export function topDownSpriteAppearance(id: SpriteIdType): TopDownSpriteAppearance {
  return TOP_DOWN_APPEARANCES[id];
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

function appearance(shape: TopDownShape, color: string, symbol?: string): TopDownSpriteAppearance {
  return {
    shape,
    color,
    ...(symbol === undefined ? {} : { symbol }),
  };
}
