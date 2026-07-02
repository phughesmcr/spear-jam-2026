import type { Entity, World } from "@phughesmcr/miski";
import { Health, healthFor } from "@/src/ecs/components.ts";
import { weaponLabel } from "@/src/ecs/combat.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { ItemPickup } from "@/src/game/items.ts";
import type { AmmoKind, CommandSlot, PlayerProgressState, PlayerState } from "@/src/game/state.ts";
import { TurnEffects } from "@/src/game/turn_effects.ts";
import type { KeyColor } from "@/src/map/map.ts";

const ENEMY_DEFEAT_CREDITS = 10;

export type PlayerProgressionState = Omit<PlayerState, "health">;
type PlayerStatusState = Omit<PlayerState, "health" | "turnEffects">;

export type PlayerProgressionContext = {
  readonly world: World;
  readonly playerEntity: Entity;
};

export class PlayerProgression {
  private readonly status: PlayerStatus;
  private readonly turnEffects: TurnEffects;

  constructor(playerState: PlayerState) {
    this.status = new PlayerStatus(playerState);
    this.turnEffects = new TurnEffects(playerState.turnEffects);
  }

  get heldKeys(): ReadonlySet<KeyColor> {
    return this.status.heldKeys;
  }

  get hasUplinkCode(): boolean {
    return this.status.hasUplinkCode;
  }

  get selectedWeapon(): CommandSlot {
    return this.status.selectedWeapon;
  }

  getState(): PlayerProgressionState {
    return {
      ...this.status.getState(),
      turnEffects: this.turnEffects.getState(),
    };
  }

  spendAmmo(ammo: AmmoKind): boolean {
    return this.status.spendAmmo(ammo);
  }

  hasWeapon(slot: CommandSlot): boolean {
    return this.status.hasWeapon(slot);
  }

  selectWeapon(slot: CommandSlot): void {
    this.status.selectWeapon(slot);
  }

  clearTransient(): void {
    this.status.clearTransient();
  }

  tickTurnEffects(): void {
    this.turnEffects.tick();
  }

  applyItemPickup(pickup: ItemPickup, context: PlayerProgressionContext): readonly GameEvent[] {
    switch (pickup.type) {
      case "key":
        this.status.addKey(pickup.color);
        return [{
          type: "keyPickedUp",
          entity: pickup.entity,
        }];
      case "uplinkCode":
        this.status.addUplinkCode();
        return [{
          type: "uplinkCodePickedUp",
          entity: pickup.entity,
        }];
      case "weapon":
        this.status.unlockWeapon(pickup.slot);
        return [{
          type: "weaponPickedUp",
          entity: pickup.entity,
          slot: pickup.slot,
          label: weaponLabel(pickup.slot),
        }];
      case "health":
        return this.applyHealthPatch(pickup.entity, pickup.amount, context);
      case "ammo":
        this.status.addAmmo(pickup.ammo, pickup.amount);
        return [{
          type: "ammoPickedUp",
          entity: pickup.entity,
          ammo: pickup.ammo,
          amount: pickup.amount,
        }];
    }
  }

  awardCreditsForDefeats(events: readonly GameEvent[], playerEntity: Entity): readonly GameEvent[] {
    const rewardEvents: GameEvent[] = [];
    for (const event of events) {
      if (event.type !== "entityDefeated" || event.actor !== playerEntity || event.entity === playerEntity) continue;

      const progress = this.status.addCredits(ENEMY_DEFEAT_CREDITS);
      rewardEvents.push({
        type: "creditsEarned",
        amount: ENEMY_DEFEAT_CREDITS,
        credits: progress.credits,
        score: progress.score,
      });
    }

    return rewardEvents.length === 0 ? events : [...events, ...rewardEvents];
  }

  completeLevel(events: readonly GameEvent[]): readonly GameEvent[] {
    const xpGain = this.status.convertLevelCreditsToXp();
    if (xpGain === undefined) return events;

    return [...events, { type: "xpGained", amount: xpGain.amount, xp: xpGain.xp }];
  }

  private applyHealthPatch(
    item: Entity,
    amount: number,
    { world, playerEntity }: PlayerProgressionContext,
  ): readonly GameEvent[] {
    const health = healthFor(world, playerEntity);
    const healed = health === undefined ? 0 : Math.min(amount, health.max - health.current);
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
}

class PlayerStatus {
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
