import type { CommandSlot } from "@/src/game/state.ts";
import type { CardinalDirection, GridPoint } from "@/src/grid/direction.ts";
import { createCodeRegistry } from "@/src/utils/code_registry.ts";
import type { Entity } from "turn-based-engine/ecs";

export const SoundId = {
  BlockedMove: "blockedMove",
  DoorOpen: "doorOpen",
  DoorLocked: "doorLocked",
  GlassSmash: "glassSmash",
  PickupItem: "pickupItem",
  PickupKey: "pickupKey",
  PickupWeapon: "pickupWeapon",
  PickupHealth: "pickupHealth",
  PickupAmmo: "pickupAmmo",
  PickupUplinkCode: "pickupUplinkCode",
  WeaponBitShifter: "weaponBitShifter",
  WeaponPulsePistol: "weaponPulsePistol",
  WeaponCurrentCannon: "weaponCurrentCannon",
  WeaponNoAmmo: "weaponNoAmmo",
  PlayerHurt: "playerHurt",
  NpcInteract: "npcInteract",
  TerminalLocked: "terminalLocked",
  TerminalUse: "terminalUse",
  AmbientHum: "ambientHum",
  AmbientLightBuzz: "ambientLightBuzz",
  EnemyInvestigate: "enemyInvestigate",
  DogIdle: "dogIdle",
  DogAlert: "dogAlert",
  DogAttack: "dogAttack",
  DogHurt: "dogHurt",
  DogDefeat: "dogDefeat",
  GunslingerIdle: "gunslingerIdle",
  GunslingerAlert: "gunslingerAlert",
  GunslingerAttack: "gunslingerAttack",
  GunslingerHurt: "gunslingerHurt",
  GunslingerDefeat: "gunslingerDefeat",
  NeophyteIdle: "neophyteIdle",
  NeophyteAlert: "neophyteAlert",
  NeophyteAttack: "neophyteAttack",
  NeophyteHurt: "neophyteHurt",
  NeophyteDefeat: "neophyteDefeat",
  SentinelIdle: "sentinelIdle",
  SentinelAlert: "sentinelAlert",
  SentinelAttack: "sentinelAttack",
  SentinelHurt: "sentinelHurt",
  SentinelDefeat: "sentinelDefeat",
  AcolyteIdle: "acolyteIdle",
  AcolyteAlert: "acolyteAlert",
  AcolyteAttack: "acolyteAttack",
  AcolyteHurt: "acolyteHurt",
  AcolyteDefeat: "acolyteDefeat",
  AmbientWind: "ambientWind",
} as const;
export type SoundId = (typeof SoundId)[keyof typeof SoundId];

export const SOUND_IDS = [
  SoundId.BlockedMove,
  SoundId.DoorOpen,
  SoundId.DoorLocked,
  SoundId.PickupItem,
  SoundId.PickupKey,
  SoundId.PickupWeapon,
  SoundId.PickupHealth,
  SoundId.PickupAmmo,
  SoundId.PickupUplinkCode,
  SoundId.WeaponBitShifter,
  SoundId.WeaponPulsePistol,
  SoundId.WeaponCurrentCannon,
  SoundId.WeaponNoAmmo,
  SoundId.PlayerHurt,
  SoundId.NpcInteract,
  SoundId.TerminalLocked,
  SoundId.TerminalUse,
  SoundId.AmbientHum,
  SoundId.AmbientLightBuzz,
  SoundId.EnemyInvestigate,
  SoundId.DogIdle,
  SoundId.DogAlert,
  SoundId.DogAttack,
  SoundId.DogHurt,
  SoundId.DogDefeat,
  SoundId.GunslingerIdle,
  SoundId.GunslingerAlert,
  SoundId.GunslingerAttack,
  SoundId.GunslingerHurt,
  SoundId.GunslingerDefeat,
  SoundId.NeophyteIdle,
  SoundId.NeophyteAlert,
  SoundId.NeophyteAttack,
  SoundId.NeophyteHurt,
  SoundId.NeophyteDefeat,
  SoundId.SentinelIdle,
  SoundId.SentinelAlert,
  SoundId.SentinelAttack,
  SoundId.SentinelHurt,
  SoundId.SentinelDefeat,
  SoundId.AcolyteIdle,
  SoundId.AcolyteAlert,
  SoundId.AcolyteAttack,
  SoundId.AcolyteHurt,
  SoundId.AcolyteDefeat,
  SoundId.GlassSmash,
  SoundId.AmbientWind,
] as const satisfies readonly SoundId[];

export const AMBIENT_SOUND_IDS = [
  SoundId.AmbientHum,
  SoundId.AmbientLightBuzz,
  SoundId.AmbientWind,
] as const satisfies readonly SoundId[];
export type AmbientSoundId = (typeof AMBIENT_SOUND_IDS)[number];

// Codes are the 1-based position of each id in SOUND_IDS; only ever append to keep them stable.
const SOUND_ID_REGISTRY = createCodeRegistry("sound id", SOUND_IDS);

export type SoundCue = {
  readonly soundId: SoundId;
  readonly position?: GridPoint;
  readonly radius?: number;
  readonly volume?: number;
};

export type SoundEmitterSnapshot = {
  readonly entity: Entity;
  readonly soundId: SoundId;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly volume: number;
};

export type EnemyIdleSoundSource = SoundEmitterSnapshot & {
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
};

export type WebAudioPoint = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export function soundIdCode(soundId: SoundId): number {
  return SOUND_ID_REGISTRY.encode(soundId);
}

export function soundIdForCode(code: number): SoundId {
  return SOUND_ID_REGISTRY.decode(code);
}

export function soundPointForGrid(point: GridPoint): WebAudioPoint {
  return { x: point.x, y: 0, z: point.y };
}

export function listenerForwardForDirection(direction: CardinalDirection): WebAudioPoint {
  switch (direction) {
    case 0:
      return { x: 0, y: 0, z: -1 };
    case 1:
      return { x: 1, y: 0, z: 0 };
    case 2:
      return { x: 0, y: 0, z: 1 };
    case 3:
      return { x: -1, y: 0, z: 0 };
  }
}

export function weaponSoundId(slot: CommandSlot): SoundId {
  switch (slot) {
    case 1:
      return SoundId.WeaponBitShifter;
    case 2:
      return SoundId.WeaponPulsePistol;
    case 3:
      return SoundId.WeaponCurrentCannon;
    default: {
      const _exhaustive: never = slot;
      return _exhaustive;
    }
  }
}
