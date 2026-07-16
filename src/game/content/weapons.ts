import type { AttackDef } from "@/src/game/model/attack.ts";
import type { AmmoKind } from "@/src/game/model/state.ts";

export type PlayerWeaponSpec = AttackDef & {
  readonly label: string;
  readonly ammo?: AmmoKind;
  readonly noiseRadius: number;
};
