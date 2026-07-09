import type { AttackDef } from "@/src/game/attack.ts";
import { DEFAULT_ATTACK } from "@/src/game/attack.ts";
import type { AmmoKind, CommandSlot } from "@/src/game/state.ts";

export type PlayerWeaponSpec = AttackDef & {
  readonly label: string;
  readonly ammo?: AmmoKind;
  readonly noiseRadius: number;
};

const MELEE_ATTACK_NOISE_RADIUS = 4;
const RANGED_ATTACK_NOISE_RADIUS = 8;

const PLAYER_WEAPON_SPECS: Readonly<Record<CommandSlot, PlayerWeaponSpec>> = {
  1: {
    ...DEFAULT_ATTACK,
    label: "Bit Shifter",
    noiseRadius: MELEE_ATTACK_NOISE_RADIUS,
    maxDamage: 3,
    attackBonus: 4,
  },
  2: {
    ...DEFAULT_ATTACK,
    label: "Pulse Pistol",
    ammo: "pistol",
    noiseRadius: RANGED_ATTACK_NOISE_RADIUS,
    minDamage: 2,
    maxDamage: 4,
    range: 4,
  },
  3: {
    ...DEFAULT_ATTACK,
    label: "Current Cannon",
    ammo: "cannon",
    noiseRadius: RANGED_ATTACK_NOISE_RADIUS,
    minDamage: 3,
    maxDamage: 8,
    range: 6,
    attackBonus: 1,
  },
};

export function playerWeaponSpec(slot: CommandSlot): PlayerWeaponSpec {
  return PLAYER_WEAPON_SPECS[slot];
}
