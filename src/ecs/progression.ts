import type { Entity, World } from "@phughesmcr/miski";
import {
  Health,
  type HealthSchema,
  PlayerEquipment,
  type PlayerEquipmentSchema,
  PlayerInventory,
  type PlayerInventorySchema,
  PlayerProgress,
  type PlayerProgressSchema,
} from "@/src/ecs/components.ts";
import { playerWeaponSpec } from "@/src/ecs/combat.ts";
import type { ItemPickup } from "@/src/ecs/interactions.ts";
import type { GameEvent } from "@/src/game/events.ts";
import {
  type AmmoKind,
  type CommandSlot,
  commandSlotForCode,
  type PlayerHealthState,
  type PlayerStatusSnapshot,
} from "@/src/game/state.ts";
import { normalizeStoryFlags, type StoryFlag } from "@/src/game/story.ts";
import { KeyColor, type KeyColor as KeyColorType, keyColorCode } from "@/src/map/map.ts";

const ENEMY_DEFEAT_CREDITS = 10;
const DEFAULT_PLAYER_WEAPON: CommandSlot = 1;

export const DEFAULT_PLAYER_HEALTH: PlayerHealthState = {
  current: 10,
  max: 10,
};

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

export const DEFAULT_PLAYER_PROGRESS: PlayerProgressSchema = {
  credits: 0,
  score: 0,
  xp: 0,
  levelCredits: 0,
};

const KEY_COLOR_ORDER: readonly KeyColorType[] = [
  KeyColor.Red,
  KeyColor.Blue,
  KeyColor.Yellow,
];

const WEAPON_SLOT_ORDER: readonly CommandSlot[] = [1, 2, 3];

export type PlayerProgressionCheckpoint = {
  readonly health: HealthSchema;
  readonly inventory: PlayerInventorySchema;
  readonly equipment: PlayerEquipmentSchema;
  readonly progress: PlayerProgressSchema;
  readonly storyFlags: readonly StoryFlag[];
};

export function resetPlayerProgression(world: World, playerEntity: Entity): void {
  world.components.setEntityData(Health, playerEntity, DEFAULT_PLAYER_HEALTH);
  world.components.setEntityData(PlayerInventory, playerEntity, DEFAULT_PLAYER_INVENTORY);
  world.components.setEntityData(PlayerEquipment, playerEntity, DEFAULT_PLAYER_EQUIPMENT);
  world.components.setEntityData(PlayerProgress, playerEntity, DEFAULT_PLAYER_PROGRESS);
}

export function capturePlayerProgressionCheckpoint(
  world: World,
  playerEntity: Entity,
  storyFlags: readonly StoryFlag[] = [],
): PlayerProgressionCheckpoint {
  return {
    health: { ...playerHealthFor(world, playerEntity) },
    inventory: { ...playerInventoryFor(world, playerEntity) },
    equipment: { ...playerEquipmentFor(world, playerEntity) },
    progress: { ...playerProgressFor(world, playerEntity) },
    storyFlags: normalizeStoryFlags(storyFlags),
  };
}

export function restorePlayerProgressionCheckpoint(
  world: World,
  playerEntity: Entity,
  checkpoint: PlayerProgressionCheckpoint,
): readonly StoryFlag[] {
  world.components.setEntityData(Health, playerEntity, checkpoint.health);
  world.components.setEntityData(PlayerInventory, playerEntity, checkpoint.inventory);
  world.components.setEntityData(PlayerEquipment, playerEntity, checkpoint.equipment);
  world.components.setEntityData(PlayerProgress, playerEntity, checkpoint.progress);
  return normalizeStoryFlags(checkpoint.storyFlags);
}

export function playerStatusSnapshotFor(
  world: World,
  playerEntity: Entity,
): PlayerStatusSnapshot {
  const inventory = playerInventoryFor(world, playerEntity);
  const equipment = playerEquipmentFor(world, playerEntity);
  const progress = playerProgressFor(world, playerEntity);
  const health = playerHealthFor(world, playerEntity);

  return {
    heldKeys: keyColorsForMask(inventory.keyMask),
    selectedWeapon: commandSlotForCode(equipment.selectedWeapon),
    unlockedWeapons: weaponSlotsForMask(equipment.unlockedWeaponMask),
    ammo: {
      pistol: inventory.pistolAmmo,
      cannon: inventory.cannonAmmo,
    },
    health: { ...health },
    hasUplinkCode: inventory.hasUplinkCode === 1,
    progress: { ...progress },
  };
}

export function heldKeysForPlayer(world: World, playerEntity: Entity): ReadonlySet<KeyColorType> {
  return new Set(keyColorsForMask(playerInventoryFor(world, playerEntity).keyMask));
}

export function playerHasUplinkCode(world: World, playerEntity: Entity): boolean {
  return playerInventoryFor(world, playerEntity).hasUplinkCode === 1;
}

export function selectedPlayerWeapon(world: World, playerEntity: Entity): CommandSlot {
  return commandSlotForCode(playerEquipmentFor(world, playerEntity).selectedWeapon);
}

export function playerHasWeapon(world: World, playerEntity: Entity, slot: CommandSlot): boolean {
  return (playerEquipmentFor(world, playerEntity).unlockedWeaponMask & weaponBit(slot)) !== 0;
}

export function selectPlayerWeapon(world: World, playerEntity: Entity, slot: CommandSlot): void {
  world.components.setEntityData(PlayerEquipment, playerEntity, { selectedWeapon: slot });
}

export function playerAmmoAmount(world: World, playerEntity: Entity, ammo: AmmoKind): number {
  const inventory = playerInventoryFor(world, playerEntity);
  switch (ammo) {
    case "pistol":
      return inventory.pistolAmmo;
    case "cannon":
      return inventory.cannonAmmo;
  }
}

export function spendPlayerAmmo(world: World, playerEntity: Entity, ammo: AmmoKind): boolean {
  const inventory = playerInventoryFor(world, playerEntity);
  switch (ammo) {
    case "pistol":
      if (inventory.pistolAmmo <= 0) return false;
      world.components.setEntityData(PlayerInventory, playerEntity, { pistolAmmo: inventory.pistolAmmo - 1 });
      return true;
    case "cannon":
      if (inventory.cannonAmmo <= 0) return false;
      world.components.setEntityData(PlayerInventory, playerEntity, { cannonAmmo: inventory.cannonAmmo - 1 });
      return true;
  }
}

export function applyItemPickupToPlayer(
  world: World,
  playerEntity: Entity,
  pickup: ItemPickup,
): readonly GameEvent[] {
  switch (pickup.type) {
    case "key":
      addPlayerKey(world, playerEntity, pickup.color);
      return [{
        type: "keyPickedUp",
        entity: pickup.entity,
      }];
    case "uplinkCode":
      world.components.setEntityData(PlayerInventory, playerEntity, { hasUplinkCode: 1 });
      return [{
        type: "uplinkCodePickedUp",
        entity: pickup.entity,
      }];
    case "weapon":
      unlockPlayerWeapon(world, playerEntity, pickup.slot);
      return [{
        type: "weaponPickedUp",
        entity: pickup.entity,
        slot: pickup.slot,
        label: playerWeaponSpec(pickup.slot).label,
      }];
    case "health":
      return applyHealthPatch(world, playerEntity, pickup.entity, pickup.amount);
    case "ammo":
      addPlayerAmmo(world, playerEntity, pickup.ammo, pickup.amount);
      return [{
        type: "ammoPickedUp",
        entity: pickup.entity,
        ammo: pickup.ammo,
        amount: pickup.amount,
      }];
  }
}

export function awardCreditsForDefeats(
  world: World,
  playerEntity: Entity,
  events: readonly GameEvent[],
): readonly GameEvent[] {
  const progress = playerProgressFor(world, playerEntity);
  const rewardEvents: GameEvent[] = [];

  for (const event of events) {
    if (event.type !== "entityDefeated" || event.actor !== playerEntity || event.entity === playerEntity) continue;

    progress.credits += ENEMY_DEFEAT_CREDITS;
    progress.score += ENEMY_DEFEAT_CREDITS;
    progress.levelCredits += ENEMY_DEFEAT_CREDITS;
    rewardEvents.push({
      type: "creditsEarned",
      amount: ENEMY_DEFEAT_CREDITS,
      credits: progress.credits,
      score: progress.score,
    });
  }

  if (rewardEvents.length === 0) return events;

  world.components.setEntityData(PlayerProgress, playerEntity, progress);
  return [...events, ...rewardEvents];
}

export function completePlayerLevel(
  world: World,
  playerEntity: Entity,
  events: readonly GameEvent[],
): readonly GameEvent[] {
  const progress = playerProgressFor(world, playerEntity);
  if (progress.levelCredits <= 0) return events;

  const amount = progress.levelCredits;
  progress.xp += amount;
  progress.levelCredits = 0;
  world.components.setEntityData(PlayerProgress, playerEntity, progress);
  return [...events, { type: "xpGained", amount, xp: progress.xp }];
}

export function clearTransientPlayerState(world: World, playerEntity: Entity): void {
  world.components.setEntityData(PlayerInventory, playerEntity, {
    keyMask: 0,
    hasUplinkCode: 0,
  });
}

function addPlayerKey(world: World, playerEntity: Entity, color: KeyColorType): void {
  const inventory = playerInventoryFor(world, playerEntity);
  world.components.setEntityData(PlayerInventory, playerEntity, {
    keyMask: inventory.keyMask | keyBit(color),
  });
}

function unlockPlayerWeapon(world: World, playerEntity: Entity, slot: CommandSlot): void {
  const equipment = playerEquipmentFor(world, playerEntity);
  world.components.setEntityData(PlayerEquipment, playerEntity, {
    unlockedWeaponMask: equipment.unlockedWeaponMask | weaponBit(slot),
  });
}

function addPlayerAmmo(world: World, playerEntity: Entity, ammo: AmmoKind, amount: number): void {
  const inventory = playerInventoryFor(world, playerEntity);
  switch (ammo) {
    case "pistol":
      world.components.setEntityData(PlayerInventory, playerEntity, { pistolAmmo: inventory.pistolAmmo + amount });
      return;
    case "cannon":
      world.components.setEntityData(PlayerInventory, playerEntity, { cannonAmmo: inventory.cannonAmmo + amount });
      return;
  }
}

function applyHealthPatch(
  world: World,
  playerEntity: Entity,
  item: Entity,
  amount: number,
): readonly GameEvent[] {
  const health = playerHealthFor(world, playerEntity);
  const healed = Math.min(amount, Math.max(0, health.max - health.current));
  if (healed > 0) {
    world.components.setEntityData(Health, playerEntity, { current: health.current + healed });
  }
  return [{
    type: "healthPickedUp",
    entity: item,
    amount,
    healed,
  }];
}

function playerHealthFor(world: World, playerEntity: Entity): HealthSchema {
  return world.components.getEntityData(Health, playerEntity);
}

function playerInventoryFor(world: World, playerEntity: Entity): PlayerInventorySchema {
  return world.components.getEntityData(PlayerInventory, playerEntity);
}

function playerEquipmentFor(world: World, playerEntity: Entity): PlayerEquipmentSchema {
  return world.components.getEntityData(PlayerEquipment, playerEntity);
}

function playerProgressFor(world: World, playerEntity: Entity): PlayerProgressSchema {
  return world.components.getEntityData(PlayerProgress, playerEntity);
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
