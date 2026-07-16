import type {
  PlayerEquipmentSchema,
  PlayerInventorySchema,
  PlayerProgressSchema,
} from "@/src/game/simulation/components.ts";
import type { CommandSlot, PlayerHealthState } from "@/src/game/model/state.ts";

export const DEFAULT_PLAYER_WEAPON: CommandSlot = 1;
export const DEFAULT_PLAYER_HEALTH: PlayerHealthState = { current: 10, max: 10 };
export const DEFAULT_PLAYER_INVENTORY: PlayerInventorySchema = {
  keyMask: 0,
  hasUplinkCode: 0,
  hasSpear: 0,
  pistolAmmo: 0,
  cannonAmmo: 0,
};
export const DEFAULT_PLAYER_EQUIPMENT: PlayerEquipmentSchema = {
  selectedWeapon: DEFAULT_PLAYER_WEAPON,
  unlockedWeaponMask: 1 << DEFAULT_PLAYER_WEAPON,
};
export const DEFAULT_PLAYER_PROGRESS: PlayerProgressSchema = { credits: 0, score: 0, xp: 0, levelCredits: 0 };
