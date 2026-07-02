import type { AmmoKind, CommandSlot, PlayerProgressState, PlayerState } from "@/src/game/state.ts";
import type { KeyColor } from "@/src/map/map.ts";

export type PlayerStatusState = Omit<PlayerState, "health">;

export class PlayerStatus {
  private readonly heldKeySet: Set<KeyColor>;
  private readonly unlockedWeaponSet: Set<CommandSlot>;
  private readonly ammoCounts: { pistol: number; cannon: number };
  private readonly progress: {
    credits: number;
    score: number;
    xp: number;
    levelCredits: number;
  };
  private selectedWeaponSlot: CommandSlot;
  private hasUplinkCodeValue: boolean;

  constructor(playerState: PlayerState) {
    this.heldKeySet = new Set(playerState.heldKeys);
    this.unlockedWeaponSet = new Set(playerState.unlockedWeapons);
    this.ammoCounts = { ...playerState.ammo };
    this.progress = { ...playerState.progress };
    this.selectedWeaponSlot = playerState.selectedWeapon;
    this.hasUplinkCodeValue = playerState.hasUplinkCode;
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

  getState(): PlayerStatusState {
    return {
      heldKeys: [...this.heldKeySet],
      selectedWeapon: this.selectedWeaponSlot,
      unlockedWeapons: sortedWeaponSlots(this.unlockedWeaponSet),
      ammo: { ...this.ammoCounts },
      hasUplinkCode: this.hasUplinkCodeValue,
      progress: { ...this.progress },
    };
  }

  addCredits(amount: number): Pick<PlayerProgressState, "credits" | "score"> {
    this.progress.credits += amount;
    this.progress.score += amount;
    this.progress.levelCredits += amount;
    return {
      credits: this.progress.credits,
      score: this.progress.score,
    };
  }

  convertLevelCreditsToXp(): { readonly amount: number; readonly xp: number } | undefined {
    if (this.progress.levelCredits <= 0) return undefined;

    const amount = this.progress.levelCredits;
    this.progress.xp += amount;
    this.progress.levelCredits = 0;
    return {
      amount,
      xp: this.progress.xp,
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
