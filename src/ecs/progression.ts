import {
  type GameEcs,
  type HealthSchema,
  type PlayerEquipmentSchema,
  type PlayerInventorySchema,
  type PlayerProgressSchema,
  readComponent,
  requireComponent,
  writeComponent,
} from "@/src/ecs/components.ts";
import type { ItemPickup } from "@/src/ecs/interactions.ts";
import type { GameEvent } from "@/src/game/events.ts";
import {
  type AmmoKind,
  type CommandSlot,
  commandSlotForCode,
  type PlayerHealthState,
  type PlayerStatusSnapshot,
} from "@/src/game/state.ts";
import {
  maskHasStoryFlag,
  maskWithStoryFlag,
  type StoryFlag,
  storyFlagsFromMask,
  storyFlagsToMask,
} from "@/src/game/story.ts";
import { playerWeaponSpec } from "@/src/game/weapons.ts";
import { KeyColor, type KeyColor as KeyColorType, keyColorCode } from "@/src/map/map.ts";
import type { Entity } from "turn-based-engine/ecs";

const ENEMY_DEFEAT_CREDITS = 10;
const DEFAULT_PLAYER_WEAPON: CommandSlot = 1;
const KEY_COLOR_ORDER: readonly KeyColorType[] = [KeyColor.Red, KeyColor.Blue, KeyColor.Yellow];
const WEAPON_SLOT_ORDER: readonly CommandSlot[] = [1, 2, 3];

export const DEFAULT_PLAYER_HEALTH: PlayerHealthState = { current: 10, max: 10 };
export const DEFAULT_PLAYER_INVENTORY: PlayerInventorySchema = {
  keyMask: 0,
  hasUplinkCode: 0,
  pistolAmmo: 0,
  cannonAmmo: 0,
};
export const DEFAULT_PLAYER_EQUIPMENT: PlayerEquipmentSchema = {
  selectedWeapon: DEFAULT_PLAYER_WEAPON,
  unlockedWeaponMask: weaponBit(DEFAULT_PLAYER_WEAPON),
};
export const CHEAT_PLAYER_AMMO = 99;
export const CHEAT_PLAYER_INVENTORY: PlayerInventorySchema = {
  ...DEFAULT_PLAYER_INVENTORY,
  pistolAmmo: CHEAT_PLAYER_AMMO,
  cannonAmmo: CHEAT_PLAYER_AMMO,
};
export const CHEAT_PLAYER_EQUIPMENT: PlayerEquipmentSchema = {
  selectedWeapon: DEFAULT_PLAYER_WEAPON,
  unlockedWeaponMask: WEAPON_SLOT_ORDER.reduce((mask, slot) => mask | weaponBit(slot), 0),
};
export const DEFAULT_PLAYER_PROGRESS: PlayerProgressSchema = { credits: 0, score: 0, xp: 0, levelCredits: 0 };

export type PlayerProgressionCheckpoint = {
  readonly health: HealthSchema;
  readonly inventory: PlayerInventorySchema;
  readonly equipment: PlayerEquipmentSchema;
  readonly progress: PlayerProgressSchema;
  readonly storyFlags: readonly StoryFlag[];
};

export function resetPlayerProgression(game: GameEcs, player: Entity): void {
  writeComponent(game, player, "Health", DEFAULT_PLAYER_HEALTH);
  writeComponent(game, player, "PlayerInventory", DEFAULT_PLAYER_INVENTORY);
  writeComponent(game, player, "PlayerEquipment", DEFAULT_PLAYER_EQUIPMENT);
  writeComponent(game, player, "PlayerProgress", DEFAULT_PLAYER_PROGRESS);
  writeComponent(game, player, "StoryFlags", { mask: 0 });
}

export function applyCheatPlayerLoadout(game: GameEcs, player: Entity): void {
  writeComponent(game, player, "Health", DEFAULT_PLAYER_HEALTH);
  writeComponent(game, player, "PlayerInventory", CHEAT_PLAYER_INVENTORY);
  writeComponent(game, player, "PlayerEquipment", CHEAT_PLAYER_EQUIPMENT);
}

export function playerStoryFlags(game: GameEcs, player: Entity): readonly StoryFlag[] {
  return storyFlagsFromMask(playerStoryFlagMask(game, player));
}

export function playerHasStoryFlag(game: GameEcs, player: Entity, flag: StoryFlag): boolean {
  return maskHasStoryFlag(playerStoryFlagMask(game, player), flag);
}

export function addPlayerStoryFlag(game: GameEcs, player: Entity, flag: StoryFlag): void {
  writeComponent(game, player, "StoryFlags", { mask: maskWithStoryFlag(playerStoryFlagMask(game, player), flag) });
}

function playerStoryFlagMask(game: GameEcs, player: Entity): number {
  return readComponent(game, player, "StoryFlags")?.mask ?? 0;
}

export function capturePlayerProgressionCheckpoint(game: GameEcs, player: Entity): PlayerProgressionCheckpoint {
  return {
    health: { ...playerHealthFor(game, player) },
    inventory: { ...playerInventoryFor(game, player) },
    equipment: { ...playerEquipmentFor(game, player) },
    progress: { ...playerProgressFor(game, player) },
    storyFlags: playerStoryFlags(game, player),
  };
}

export function restorePlayerProgressionCheckpoint(
  game: GameEcs,
  player: Entity,
  checkpoint: PlayerProgressionCheckpoint,
): void {
  writeComponent(game, player, "Health", checkpoint.health);
  writeComponent(game, player, "PlayerInventory", checkpoint.inventory);
  writeComponent(game, player, "PlayerEquipment", checkpoint.equipment);
  writeComponent(game, player, "PlayerProgress", checkpoint.progress);
  writeComponent(game, player, "StoryFlags", { mask: storyFlagsToMask(checkpoint.storyFlags) });
}

export function playerStatusSnapshotFor(game: GameEcs, player: Entity): PlayerStatusSnapshot {
  const inventory = playerInventoryFor(game, player);
  const equipment = playerEquipmentFor(game, player);
  const progress = playerProgressFor(game, player);
  return {
    heldKeys: keyColorsForMask(inventory.keyMask),
    selectedWeapon: commandSlotForCode(equipment.selectedWeapon),
    unlockedWeapons: weaponSlotsForMask(equipment.unlockedWeaponMask),
    ammo: { pistol: inventory.pistolAmmo, cannon: inventory.cannonAmmo },
    health: { ...playerHealthFor(game, player) },
    hasUplinkCode: inventory.hasUplinkCode === 1,
    progress: { ...progress },
  };
}

export function heldKeysForPlayer(game: GameEcs, player: Entity): ReadonlySet<KeyColorType> {
  return new Set(keyColorsForMask(playerInventoryFor(game, player).keyMask));
}

export function playerHasUplinkCode(game: GameEcs, player: Entity): boolean {
  return playerInventoryFor(game, player).hasUplinkCode === 1;
}

export function selectedPlayerWeapon(game: GameEcs, player: Entity): CommandSlot {
  return commandSlotForCode(playerEquipmentFor(game, player).selectedWeapon);
}

export function playerHasWeapon(game: GameEcs, player: Entity, slot: CommandSlot): boolean {
  return (playerEquipmentFor(game, player).unlockedWeaponMask & weaponBit(slot)) !== 0;
}

export function selectPlayerWeapon(game: GameEcs, player: Entity, slot: CommandSlot): void {
  writeComponent(game, player, "PlayerEquipment", { selectedWeapon: slot });
}

export function playerAmmoAmount(game: GameEcs, player: Entity, ammo: AmmoKind): number {
  const inventory = playerInventoryFor(game, player);
  return ammo === "pistol" ? inventory.pistolAmmo : inventory.cannonAmmo;
}

export function spendPlayerAmmo(game: GameEcs, player: Entity, ammo: AmmoKind): boolean {
  const inventory = playerInventoryFor(game, player);
  const amount = ammo === "pistol" ? inventory.pistolAmmo : inventory.cannonAmmo;
  if (amount <= 0) return false;
  writeComponent(
    game,
    player,
    "PlayerInventory",
    ammo === "pistol" ? { pistolAmmo: amount - 1 } : { cannonAmmo: amount - 1 },
  );
  return true;
}

export function applyItemPickupToPlayer(game: GameEcs, player: Entity, pickup: ItemPickup): readonly GameEvent[] {
  switch (pickup.type) {
    case "key":
      addPlayerKey(game, player, pickup.color);
      return [{ type: "keyPickedUp", entity: pickup.entity }];
    case "uplinkCode":
      writeComponent(game, player, "PlayerInventory", { hasUplinkCode: 1 });
      return [{ type: "uplinkCodePickedUp", entity: pickup.entity }];
    case "weapon":
      unlockPlayerWeapon(game, player, pickup.slot);
      return [{
        type: "weaponPickedUp",
        entity: pickup.entity,
        slot: pickup.slot,
        label: playerWeaponSpec(pickup.slot).label,
      }];
    case "health":
      return applyHealthPatch(game, player, pickup.entity, pickup.amount);
    case "ammo":
      addPlayerAmmo(game, player, pickup.ammo, pickup.amount);
      return [{ type: "ammoPickedUp", entity: pickup.entity, ammo: pickup.ammo, amount: pickup.amount }];
  }
}

export function awardCreditsForDefeats(
  game: GameEcs,
  player: Entity,
  events: readonly GameEvent[],
): readonly GameEvent[] {
  const progress = playerProgressFor(game, player);
  const rewards: GameEvent[] = [];
  for (const event of events) {
    if (event.type !== "entityDefeated" || event.actor !== player || event.entity === player) continue;
    progress.credits += ENEMY_DEFEAT_CREDITS;
    progress.score += ENEMY_DEFEAT_CREDITS;
    progress.levelCredits += ENEMY_DEFEAT_CREDITS;
    rewards.push({
      type: "creditsEarned",
      amount: ENEMY_DEFEAT_CREDITS,
      credits: progress.credits,
      score: progress.score,
    });
  }
  if (rewards.length === 0) return events;
  writeComponent(game, player, "PlayerProgress", progress);
  return [...events, ...rewards];
}

export function completePlayerLevel(game: GameEcs, player: Entity, events: readonly GameEvent[]): readonly GameEvent[] {
  const progress = playerProgressFor(game, player);
  if (progress.levelCredits <= 0) return events;
  const amount = progress.levelCredits;
  progress.xp += amount;
  progress.levelCredits = 0;
  writeComponent(game, player, "PlayerProgress", progress);
  return [...events, { type: "xpGained", amount, xp: progress.xp }];
}

export function clearTransientPlayerState(game: GameEcs, player: Entity): void {
  writeComponent(game, player, "PlayerInventory", { keyMask: 0, hasUplinkCode: 0 });
}

function addPlayerKey(game: GameEcs, player: Entity, color: KeyColorType): void {
  const inventory = playerInventoryFor(game, player);
  writeComponent(game, player, "PlayerInventory", { keyMask: inventory.keyMask | keyBit(color) });
}

function unlockPlayerWeapon(game: GameEcs, player: Entity, slot: CommandSlot): void {
  const equipment = playerEquipmentFor(game, player);
  writeComponent(game, player, "PlayerEquipment", {
    unlockedWeaponMask: equipment.unlockedWeaponMask | weaponBit(slot),
  });
}

function addPlayerAmmo(game: GameEcs, player: Entity, ammo: AmmoKind, amount: number): void {
  const inventory = playerInventoryFor(game, player);
  writeComponent(
    game,
    player,
    "PlayerInventory",
    ammo === "pistol" ? { pistolAmmo: inventory.pistolAmmo + amount } : { cannonAmmo: inventory.cannonAmmo + amount },
  );
}

function applyHealthPatch(game: GameEcs, player: Entity, item: Entity, amount: number): readonly GameEvent[] {
  const health = playerHealthFor(game, player);
  const healed = Math.min(amount, Math.max(0, health.max - health.current));
  if (healed > 0) writeComponent(game, player, "Health", { current: health.current + healed });
  return [{ type: "healthPickedUp", entity: item, amount, healed }];
}

function playerHealthFor(game: GameEcs, player: Entity): HealthSchema {
  return requireComponent(game, player, "Health") as HealthSchema;
}

function playerInventoryFor(game: GameEcs, player: Entity): PlayerInventorySchema {
  return requireComponent(game, player, "PlayerInventory") as PlayerInventorySchema;
}

function playerEquipmentFor(game: GameEcs, player: Entity): PlayerEquipmentSchema {
  return requireComponent(game, player, "PlayerEquipment") as PlayerEquipmentSchema;
}

function playerProgressFor(game: GameEcs, player: Entity): PlayerProgressSchema {
  return requireComponent(game, player, "PlayerProgress") as PlayerProgressSchema;
}

function keyColorsForMask(mask: number): readonly KeyColorType[] {
  return KEY_COLOR_ORDER.filter((color) => (mask & keyBit(color)) !== 0);
}

function keyBit(color: KeyColorType): number {
  return 1 << keyColorCode(color);
}

function weaponSlotsForMask(mask: number): readonly CommandSlot[] {
  return WEAPON_SLOT_ORDER.filter((slot) => (mask & weaponBit(slot)) !== 0);
}

function weaponBit(slot: CommandSlot): number {
  return 1 << slot;
}
