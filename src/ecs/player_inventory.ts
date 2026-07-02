import { DEFAULT_SELECTED_WEAPON } from "@/src/ecs/combat.ts";
import type { AmmoKind, CommandSlot, PlayerAmmoState, PlayerState } from "@/src/game/state.ts";
import type { KeyColor } from "@/src/map/map.ts";

const DEFAULT_UNLOCKED_WEAPONS: readonly CommandSlot[] = Object.freeze([DEFAULT_SELECTED_WEAPON]);
const DEFAULT_AMMO: PlayerAmmoState = Object.freeze({ pistol: 0, cannon: 0 });

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

  constructor(playerState?: PlayerState) {
    this.heldKeySet = new Set(playerState?.heldKeys ?? []);
    this.unlockedWeaponSet = unlockedWeaponsFor(playerState);
    this.ammoCounts = ammoFor(playerState);
    this.selectedWeaponSlot = selectedWeaponFor(playerState?.selectedWeapon, this.unlockedWeaponSet);
    this.hasUplinkCodeValue = playerState?.hasUplinkCode ?? false;
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

  spendAmmo(ammo: AmmoKind | undefined): boolean {
    if (ammo === undefined) return true;
    if (this.ammoCounts[ammo] <= 0) return false;

    this.ammoCounts[ammo] -= 1;
    return true;
  }

  clearTransient(): void {
    this.heldKeySet.clear();
    this.hasUplinkCodeValue = false;
  }
}

function unlockedWeaponsFor(playerState: PlayerState | undefined): Set<CommandSlot> {
  const slots = new Set<CommandSlot>(DEFAULT_UNLOCKED_WEAPONS);
  for (const slot of playerState?.unlockedWeapons ?? []) {
    slots.add(slot);
  }
  return slots;
}

function ammoFor(playerState: PlayerState | undefined): { pistol: number; cannon: number } {
  return {
    pistol: playerState?.ammo?.pistol ?? DEFAULT_AMMO.pistol,
    cannon: playerState?.ammo?.cannon ?? DEFAULT_AMMO.cannon,
  };
}

function selectedWeaponFor(
  selectedWeapon: CommandSlot | undefined,
  unlockedWeapons: ReadonlySet<CommandSlot>,
): CommandSlot {
  if (selectedWeapon !== undefined && unlockedWeapons.has(selectedWeapon)) return selectedWeapon;
  return DEFAULT_SELECTED_WEAPON;
}

function sortedWeaponSlots(slots: ReadonlySet<CommandSlot>): readonly CommandSlot[] {
  return [...slots].sort((a, b) => a - b);
}
