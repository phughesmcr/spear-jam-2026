import type { Entity, World } from "@phughesmcr/miski";
import {
  Health,
  healthFor,
  PlayerEquipment,
  PlayerInventory,
  PlayerProgress,
  PlayerTurnEffects,
} from "@/src/ecs/components.ts";
import type {
  HealthSchema,
  PlayerEquipmentSchema,
  PlayerInventorySchema,
  PlayerProgressSchema,
  PlayerTurnEffectsSchema,
} from "@/src/ecs/components.ts";
import { weaponLabel } from "@/src/ecs/combat.ts";
import type { ItemPickup } from "@/src/ecs/interactions.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { commandSlotForCode } from "@/src/game/state.ts";
import type {
  AmmoKind,
  CommandSlot,
  PlayerAmmoState,
  PlayerHealthState,
  PlayerProgressState,
  PlayerStateInput,
} from "@/src/game/state.ts";
import { normalizeStoryFlags } from "@/src/game/story.ts";
import type { StoryFlag } from "@/src/game/story.ts";
import { normalizeTurnEffects, TurnEffectKind } from "@/src/game/turn_effects.ts";
import type { TurnEffectKind as TurnEffectKindType, TurnEffectState } from "@/src/game/turn_effects.ts";
import { KeyColor, keyColorCode } from "@/src/map/map.ts";
import type { KeyColor as KeyColorType } from "@/src/map/map.ts";

const ENEMY_DEFEAT_CREDITS = 10;
const DEFAULT_PLAYER_WEAPON: CommandSlot = 1;
const MAX_PLAYER_HEALTH = 255;

export const DEFAULT_PLAYER_HEALTH: PlayerHealthState = {
  current: 10,
  max: 10,
};

const DEFAULT_PLAYER_INVENTORY: PlayerInventorySchema = {
  keyMask: 0,
  hasUplinkCode: 0,
  pistolAmmo: 0,
  cannonAmmo: 0,
};

const DEFAULT_PLAYER_EQUIPMENT: PlayerEquipmentSchema = {
  selectedWeapon: DEFAULT_PLAYER_WEAPON,
  unlockedWeaponMask: weaponBit(DEFAULT_PLAYER_WEAPON),
};

const DEFAULT_PLAYER_PROGRESS: PlayerProgressSchema = {
  credits: 0,
  score: 0,
  xp: 0,
  levelCredits: 0,
};

const DEFAULT_PLAYER_TURN_EFFECTS: PlayerTurnEffectsSchema = {
  invisibility: 0,
  overclock: 0,
  toughness: 0,
  healthRegen: 0,
};

const KEY_COLOR_ORDER: readonly KeyColorType[] = [
  KeyColor.Red,
  KeyColor.Blue,
  KeyColor.Yellow,
];

const WEAPON_SLOT_ORDER: readonly CommandSlot[] = [1, 2, 3];

const TURN_EFFECT_FIELDS: readonly {
  readonly kind: TurnEffectKindType;
  readonly field: keyof PlayerTurnEffectsSchema;
}[] = [
  { kind: TurnEffectKind.Invisibility, field: "invisibility" },
  { kind: TurnEffectKind.Overclock, field: "overclock" },
  { kind: TurnEffectKind.Toughness, field: "toughness" },
  { kind: TurnEffectKind.HealthRegen, field: "healthRegen" },
];

/** Boundary snapshot generated from ECS components; ECS remains the owner. */
export type PlayerStateSnapshot = {
  readonly heldKeys: readonly KeyColorType[];
  readonly selectedWeapon: CommandSlot;
  readonly unlockedWeapons: readonly CommandSlot[];
  readonly ammo: PlayerAmmoState;
  readonly health: PlayerHealthState;
  readonly hasUplinkCode: boolean;
  readonly progress: PlayerProgressState;
  readonly turnEffects: readonly TurnEffectState[];
  readonly storyFlags: readonly StoryFlag[];
};

export function initializePlayerProgression(
  world: World,
  playerEntity: Entity,
  input: PlayerStateInput = {},
): void {
  upsertPlayerHealth(world, playerEntity, healthForInput(input));
  upsertPlayerInventory(world, playerEntity, inventoryForInput(input));
  upsertPlayerEquipment(world, playerEntity, equipmentForInput(input));
  upsertPlayerProgress(world, playerEntity, progressForInput(input));
  upsertPlayerTurnEffects(world, playerEntity, turnEffectsForInput(input.turnEffects));
}

export function playerStateSnapshotFor(
  world: World,
  playerEntity: Entity,
  storyFlags: readonly StoryFlag[] = [],
): PlayerStateSnapshot {
  const inventory = playerInventoryFor(world, playerEntity);
  const equipment = playerEquipmentFor(world, playerEntity);
  const progress = playerProgressFor(world, playerEntity);
  const turnEffects = turnEffectsForComponent(playerTurnEffectsFor(world, playerEntity));
  const health = healthFor(world, playerEntity) ?? DEFAULT_PLAYER_HEALTH;

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
    turnEffects,
    storyFlags: normalizeStoryFlags(storyFlags),
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
  upsertPlayerEquipment(world, playerEntity, { selectedWeapon: slot });
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
      upsertPlayerInventory(world, playerEntity, { pistolAmmo: inventory.pistolAmmo - 1 });
      return true;
    case "cannon":
      if (inventory.cannonAmmo <= 0) return false;
      upsertPlayerInventory(world, playerEntity, { cannonAmmo: inventory.cannonAmmo - 1 });
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
      upsertPlayerInventory(world, playerEntity, { hasUplinkCode: 1 });
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
        label: weaponLabel(pickup.slot),
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

  upsertPlayerProgress(world, playerEntity, progress);
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
  upsertPlayerProgress(world, playerEntity, progress);
  return [...events, { type: "xpGained", amount, xp: progress.xp }];
}

export function clearTransientPlayerState(world: World, playerEntity: Entity): void {
  upsertPlayerInventory(world, playerEntity, {
    keyMask: 0,
    hasUplinkCode: 0,
  });
}

export function tickPlayerTurnEffects(world: World, playerEntity: Entity): void {
  const effects = playerTurnEffectsFor(world, playerEntity);
  upsertPlayerTurnEffects(world, playerEntity, {
    invisibility: Math.max(0, effects.invisibility - 1),
    overclock: Math.max(0, effects.overclock - 1),
    toughness: Math.max(0, effects.toughness - 1),
    healthRegen: Math.max(0, effects.healthRegen - 1),
  });
}

function addPlayerKey(world: World, playerEntity: Entity, color: KeyColorType): void {
  const inventory = playerInventoryFor(world, playerEntity);
  upsertPlayerInventory(world, playerEntity, {
    keyMask: inventory.keyMask | keyBit(color),
  });
}

function unlockPlayerWeapon(world: World, playerEntity: Entity, slot: CommandSlot): void {
  const equipment = playerEquipmentFor(world, playerEntity);
  upsertPlayerEquipment(world, playerEntity, {
    unlockedWeaponMask: equipment.unlockedWeaponMask | weaponBit(slot),
  });
}

function addPlayerAmmo(world: World, playerEntity: Entity, ammo: AmmoKind, amount: number): void {
  const inventory = playerInventoryFor(world, playerEntity);
  switch (ammo) {
    case "pistol":
      upsertPlayerInventory(world, playerEntity, { pistolAmmo: inventory.pistolAmmo + amount });
      return;
    case "cannon":
      upsertPlayerInventory(world, playerEntity, { cannonAmmo: inventory.cannonAmmo + amount });
      return;
  }
}

function applyHealthPatch(
  world: World,
  playerEntity: Entity,
  item: Entity,
  amount: number,
): readonly GameEvent[] {
  const health = healthFor(world, playerEntity);
  const healed = health === undefined ? 0 : Math.min(amount, Math.max(0, health.max - health.current));
  if (health !== undefined && healed > 0) {
    world.components.setEntityData(Health, playerEntity, { current: health.current + healed });
  }
  return [{
    type: "healthPickedUp",
    entity: item,
    amount,
    healed,
  }];
}

function playerInventoryFor(world: World, playerEntity: Entity): PlayerInventorySchema {
  return world.components.readEntityData(PlayerInventory, playerEntity) ?? { ...DEFAULT_PLAYER_INVENTORY };
}

function playerEquipmentFor(world: World, playerEntity: Entity): PlayerEquipmentSchema {
  return world.components.readEntityData(PlayerEquipment, playerEntity) ?? { ...DEFAULT_PLAYER_EQUIPMENT };
}

function playerProgressFor(world: World, playerEntity: Entity): PlayerProgressSchema {
  return world.components.readEntityData(PlayerProgress, playerEntity) ?? { ...DEFAULT_PLAYER_PROGRESS };
}

function playerTurnEffectsFor(world: World, playerEntity: Entity): PlayerTurnEffectsSchema {
  return world.components.readEntityData(PlayerTurnEffects, playerEntity) ?? { ...DEFAULT_PLAYER_TURN_EFFECTS };
}

function healthForInput(input: PlayerStateInput): HealthSchema {
  if (input.health === undefined) return DEFAULT_PLAYER_HEALTH;

  const max = normalizeHealthValue(input.health.max, DEFAULT_PLAYER_HEALTH.max);
  return {
    current: Math.min(normalizeHealthValue(input.health.current, max), max),
    max,
  };
}

function normalizeHealthValue(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(MAX_PLAYER_HEALTH, Math.max(0, Math.trunc(value))) : fallback;
}

function inventoryForInput(input: PlayerStateInput): PlayerInventorySchema {
  return {
    keyMask: keyMaskFor(input.heldKeys ?? []),
    hasUplinkCode: input.hasUplinkCode === true ? 1 : 0,
    pistolAmmo: input.ammo?.pistol ?? DEFAULT_PLAYER_INVENTORY.pistolAmmo,
    cannonAmmo: input.ammo?.cannon ?? DEFAULT_PLAYER_INVENTORY.cannonAmmo,
  };
}

function equipmentForInput(input: PlayerStateInput): PlayerEquipmentSchema {
  const unlockedWeaponMask = weaponMaskFor([
    DEFAULT_PLAYER_WEAPON,
    ...(input.unlockedWeapons ?? []),
  ]);
  const selectedWeapon =
    input.selectedWeapon !== undefined && (unlockedWeaponMask & weaponBit(input.selectedWeapon)) !== 0 ?
      input.selectedWeapon :
      DEFAULT_PLAYER_EQUIPMENT.selectedWeapon;

  return {
    selectedWeapon,
    unlockedWeaponMask,
  };
}

function progressForInput(input: PlayerStateInput): PlayerProgressSchema {
  return {
    credits: input.progress?.credits ?? DEFAULT_PLAYER_PROGRESS.credits,
    score: input.progress?.score ?? DEFAULT_PLAYER_PROGRESS.score,
    xp: input.progress?.xp ?? DEFAULT_PLAYER_PROGRESS.xp,
    levelCredits: input.progress?.levelCredits ?? DEFAULT_PLAYER_PROGRESS.levelCredits,
  };
}

function turnEffectsForInput(effects: readonly TurnEffectState[] = []): PlayerTurnEffectsSchema {
  const state: PlayerTurnEffectsSchema = {
    ...DEFAULT_PLAYER_TURN_EFFECTS,
  };

  for (const effect of normalizeTurnEffects(effects)) {
    state[turnEffectField(effect.kind)] = effect.remainingTurns;
  }
  return state;
}

function turnEffectField(kind: TurnEffectKindType): keyof PlayerTurnEffectsSchema {
  for (const effect of TURN_EFFECT_FIELDS) {
    if (effect.kind === kind) return effect.field;
  }
  throw new Error(`Unknown turn effect kind: ${kind}`);
}

function turnEffectsForComponent(effects: PlayerTurnEffectsSchema): readonly TurnEffectState[] {
  const state: TurnEffectState[] = [];
  for (const { kind, field } of TURN_EFFECT_FIELDS) {
    const remainingTurns = effects[field];
    if (remainingTurns > 0) state.push({ kind, remainingTurns });
  }
  return state;
}

function keyMaskFor(keys: readonly KeyColorType[]): number {
  let mask = 0;
  for (const key of keys) mask |= keyBit(key);
  return mask;
}

function keyColorsForMask(mask: number): readonly KeyColorType[] {
  return KEY_COLOR_ORDER.filter((color) => (mask & keyBit(color)) !== 0);
}

function keyBit(color: KeyColorType): number {
  return 1 << keyColorCode(color);
}

function weaponMaskFor(slots: readonly CommandSlot[]): number {
  let mask = 0;
  for (const slot of slots) mask |= weaponBit(slot);
  return mask;
}

function weaponSlotsForMask(mask: number): readonly CommandSlot[] {
  return WEAPON_SLOT_ORDER.filter((slot) => (mask & weaponBit(slot)) !== 0);
}

function weaponBit(slot: CommandSlot): number {
  return 1 << slot;
}

function upsertPlayerHealth(
  world: World,
  playerEntity: Entity,
  data: Partial<HealthSchema>,
): void {
  if (world.components.entityHas(Health, playerEntity)) {
    world.components.setEntityData(Health, playerEntity, data);
  } else {
    world.components.addToEntity(Health, playerEntity, {
      ...DEFAULT_PLAYER_HEALTH,
      ...data,
    });
  }
}

function upsertPlayerInventory(
  world: World,
  playerEntity: Entity,
  data: Partial<PlayerInventorySchema>,
): void {
  if (world.components.entityHas(PlayerInventory, playerEntity)) {
    world.components.setEntityData(PlayerInventory, playerEntity, data);
  } else {
    world.components.addToEntity(PlayerInventory, playerEntity, {
      ...DEFAULT_PLAYER_INVENTORY,
      ...data,
    });
  }
}

function upsertPlayerEquipment(
  world: World,
  playerEntity: Entity,
  data: Partial<PlayerEquipmentSchema>,
): void {
  if (world.components.entityHas(PlayerEquipment, playerEntity)) {
    world.components.setEntityData(PlayerEquipment, playerEntity, data);
  } else {
    world.components.addToEntity(PlayerEquipment, playerEntity, {
      ...DEFAULT_PLAYER_EQUIPMENT,
      ...data,
    });
  }
}

function upsertPlayerProgress(
  world: World,
  playerEntity: Entity,
  data: Partial<PlayerProgressSchema>,
): void {
  if (world.components.entityHas(PlayerProgress, playerEntity)) {
    world.components.setEntityData(PlayerProgress, playerEntity, data);
  } else {
    world.components.addToEntity(PlayerProgress, playerEntity, {
      ...DEFAULT_PLAYER_PROGRESS,
      ...data,
    });
  }
}

function upsertPlayerTurnEffects(
  world: World,
  playerEntity: Entity,
  data: Partial<PlayerTurnEffectsSchema>,
): void {
  if (world.components.entityHas(PlayerTurnEffects, playerEntity)) {
    world.components.setEntityData(PlayerTurnEffects, playerEntity, data);
  } else {
    world.components.addToEntity(PlayerTurnEffects, playerEntity, {
      ...DEFAULT_PLAYER_TURN_EFFECTS,
      ...data,
    });
  }
}
