import { createPlayerState } from "@/src/game/state.ts";
import type { AmmoKind, CommandSlot, PlayerState, PlayerStateInput } from "@/src/game/state.ts";
import type { KeyColor } from "@/src/map/map.ts";

export type PlayerInventoryState = Pick<
  PlayerState,
  "heldKeys" | "selectedWeapon" | "unlockedWeapons" | "ammo" | "hasUplinkCode"
>;

export class PlayerInventory {
  private readonly heldKeySet: Set<KeyColor>;
  private readonly unlockedWeaponSet: Set<CommandSlot>;
  private readonly ammoCounts: { pistol: number; cannon: number };
  private selectedWeaponSlot: CommandSlot;
  private hasUplinkCodeValue: boolean;

  constructor(playerState?: PlayerStateInput) {
    const state = createPlayerState(playerState);
    this.heldKeySet = new Set(state.heldKeys);
    this.unlockedWeaponSet = new Set(state.unlockedWeapons);
    this.ammoCounts = { ...state.ammo };
    this.selectedWeaponSlot = state.selectedWeapon;
    this.hasUplinkCodeValue = state.hasUplinkCode;
  }

  get heldKeys(): ReadonlySet<KeyColor> {
    return this.heldKeySet;
  }

  get hasUplinkCode(): boolean {
    return this.hasUplinkCodeValue;
  }

  get selectedWeapon(): CommandSlot {
    return this.selectedWeaponSlot;
  }

  getState(): PlayerInventoryState {
    return {
      heldKeys: [...this.heldKeySet],
      selectedWeapon: this.selectedWeaponSlot,
      unlockedWeapons: sortedWeaponSlots(this.unlockedWeaponSet),
      ammo: { ...this.ammoCounts },
      hasUplinkCode: this.hasUplinkCodeValue,
    };
  }

  addKey(color: KeyColor): void {
    this.heldKeySet.add(color);
  }

  addUplinkCode(): void {
    this.hasUplinkCodeValue = true;
  }

  unlockWeapon(slot: CommandSlot): void {
    this.unlockedWeaponSet.add(slot);
  }

  addAmmo(ammo: AmmoKind, amount: number): void {
    this.ammoCounts[ammo] += amount;
  }

  hasWeapon(slot: CommandSlot): boolean {
    return this.unlockedWeaponSet.has(slot);
  }

  selectWeapon(slot: CommandSlot): void {
    this.selectedWeaponSlot = slot;
  }

  spendAmmo(ammo: AmmoKind): boolean {
    if (this.ammoCounts[ammo] <= 0) return false;

    this.ammoCounts[ammo] -= 1;
    return true;
  }

  clearTransient(): void {
    this.heldKeySet.clear();
    this.hasUplinkCodeValue = false;
  }
}

function sortedWeaponSlots(slots: ReadonlySet<CommandSlot>): readonly CommandSlot[] {
  return [...slots].sort((a, b) => a - b);
}
