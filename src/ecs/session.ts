import type { Entity, World } from "@phughesmcr/miski";
import { Health } from "@/src/ecs/components.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import type { GridDelta } from "@/src/grid/direction.ts";
import { attackWithSelectedWeapon, weaponAmmoKind, weaponLabel } from "@/src/ecs/combat.ts";
import { drawableSystem } from "@/src/ecs/drawables.ts";
import type { DrawableEntityVisitor, DrawableSystem } from "@/src/ecs/drawables.ts";
import { enemyTurnSystem } from "@/src/ecs/enemy.ts";
import type { EnemyTurnSystem } from "@/src/ecs/enemy.ts";
import { collectItemAt, interactWithEntity } from "@/src/ecs/interactions.ts";
import type { ItemPickup } from "@/src/ecs/interactions.ts";
import { PlayerInventory } from "@/src/ecs/player_inventory.ts";
import { createMapEntity } from "@/src/ecs/prefabs.ts";
import { Player } from "@/src/ecs/player.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { relativeMoveDirectionOffset, turnDirectionDelta } from "@/src/game/commands.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import { createPlayerState } from "@/src/game/state.ts";
import type { AmmoKind, CommandSlot, PlayerState, PlayerStateInput } from "@/src/game/state.ts";
import { VICTORY_GOTO } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = Object.freeze({
  events: [],
});
const ENEMY_DEFEAT_CREDITS = 10;

type MutablePlayerProgress = {
  credits: number;
  score: number;
  xp: number;
  levelCredits: number;
};

type MoveResult =
  | { readonly moved: false }
  | { readonly moved: true; readonly events: readonly GameEvent[] };

export async function createGameSession(
  map: GameMap,
  random: RandomSource,
  playerState?: PlayerStateInput,
): Promise<GameSession> {
  const world = await createWorld();

  try {
    const state = createPlayerState(playerState);
    let playerEntity: Entity | undefined;
    const terminalDestinations = new Map<Entity, string>();

    for (const entityDef of map.entities) {
      const entity = createMapEntity(world, entityDef);
      if (entityDef.prefab === "player") {
        playerEntity = entity;
      } else if (entityDef.prefab === "uplinkTerminal") {
        terminalDestinations.set(entity, entityDef.goto);
      }
    }

    if (playerEntity === undefined) throw new Error("Map is missing a player spawn.");

    if (playerState?.health !== undefined && world.components.entityHas(Health, playerEntity)) {
      world.components.setEntityData(Health, playerEntity, state.health);
    }

    const player = new Player(world, playerEntity);
    world.refresh();

    return new GameSession(world, player, map, random, terminalDestinations, state);
  } catch (error) {
    await world.destroy();
    throw error;
  }
}

export class GameSession implements Disposable {
  readonly world: World;
  readonly player: Player;
  readonly map: GameMap;
  private readonly random: RandomSource;
  private readonly drawableSystem: DrawableSystem;
  private readonly enemyTurnSystem: EnemyTurnSystem;
  private readonly spatial: SpatialIndex;
  private readonly terminalDestinations: ReadonlyMap<Entity, string>;
  private readonly inventory: PlayerInventory;
  private readonly progress: MutablePlayerProgress;
  private disposed = false;

  constructor(
    world: World,
    player: Player,
    map: GameMap,
    random: RandomSource,
    terminalDestinations: ReadonlyMap<Entity, string>,
    playerState?: PlayerStateInput,
  ) {
    const state = createPlayerState(playerState);
    this.world = world;
    this.player = player;
    this.map = map;
    this.random = random;
    this.drawableSystem = world.systems.create(drawableSystem);
    this.enemyTurnSystem = world.systems.create(enemyTurnSystem);
    this.spatial = new SpatialIndex(world, map);
    this.terminalDestinations = new Map(terminalDestinations);
    this.inventory = new PlayerInventory(state);
    this.progress = { ...state.progress };
  }

  getPlayerState(): PlayerState {
    return createPlayerState({
      ...this.inventory.getState(),
      health: this.getPlayerHealth(),
      progress: this.progress,
    });
  }

  forEachDrawable(visit: DrawableEntityVisitor): void {
    this.drawableSystem({ world: this.world, visit });
  }

  handlePlayerCommand(command: PlayerCommand): PlayerCommandResult {
    switch (command.type) {
      case "move":
        return this.handlePlayerMoveCommand(relativeMoveDirectionOffset(command.direction));
      case "turn":
        this.turnPlayer(turnDirectionDelta(command.direction));
        return UNCHANGED_PLAYER_COMMAND;
      case "wait":
        return this.consumePlayerTurn();
      case "interact":
        return this.handlePlayerInteractCommand();
      case "attack":
        return this.handlePlayerAttackCommand();
      case "selectWeapon":
        return this.handlePlayerSelectWeaponCommand(command.slot);
      case "selectItem":
        return UNCHANGED_PLAYER_COMMAND;
    }
  }

  private handlePlayerMoveCommand(directionOffset: number): PlayerCommandResult {
    const move = this.tryMovePlayerRelative(directionOffset);
    if (!move.moved) return UNCHANGED_PLAYER_COMMAND;
    return this.consumePlayerTurn(move.events);
  }

  private tryMovePlayer(delta: GridDelta): MoveResult {
    const current = this.player.getPosition();
    const next = { x: current.x + delta.dx, y: current.y + delta.dy };

    if (this.spatial.positionBlocks(next.x, next.y)) return { moved: false };

    this.spatial.moveEntity(this.player.getEntity(), next);
    const pickup = collectItemAt(this.world, this.spatial, next.x, next.y);
    const pickupEvents = pickup === undefined ? [] : this.applyItemPickup(pickup);
    return {
      moved: true,
      events: pickupEvents,
    };
  }

  private tryMovePlayerRelative(directionOffset: number): MoveResult {
    const { dir } = this.player.getFacing();
    return this.tryMovePlayer(directionDelta(dir + directionOffset));
  }

  private turnPlayer(delta: number): void {
    this.player.turnBy(delta);
  }

  private handlePlayerInteractCommand(): PlayerCommandResult {
    const interaction = interactWithEntity(
      this.world,
      this.spatial,
      this.spatial.facedEntity(this.player),
      this.inventory.heldKeys,
      this.inventory.hasUplinkCode,
    );
    switch (interaction.type) {
      case "unchanged":
        return { events: interaction.events };
      case "consumeTurn":
        return this.consumePlayerTurn(interaction.events);
      case "dialogue":
        return {
          events: interaction.events,
          dialogue: interaction.dialogue,
        };
      case "uplinkTerminal":
        return this.activateUplinkTerminal(interaction.terminal, interaction.events);
    }
  }

  private activateUplinkTerminal(terminal: Entity, events: readonly GameEvent[]): PlayerCommandResult {
    const goto = this.terminalDestinations.get(terminal);
    if (goto === undefined) {
      throw new Error(`Uplink terminal ${terminal} is missing a map destination.`);
    }

    const levelCompleteEvents = this.completeLevel(events);
    this.inventory.clearTransient();
    this.world.refresh();
    if (goto === VICTORY_GOTO) {
      return { events: levelCompleteEvents, outcome: "victory" };
    }
    return {
      events: levelCompleteEvents,
      mapChange: { goto },
    };
  }

  private handlePlayerAttackCommand(): PlayerCommandResult {
    const selectedWeapon = this.inventory.selectedWeapon;
    const ammoKind = weaponAmmoKind(selectedWeapon);
    const ammoEvents = this.spendAmmo(ammoKind);
    if (ammoEvents === undefined) return { events: [{ type: "noAmmo", ammo: ammoKind! }] };

    const events = attackWithSelectedWeapon(
      this.world,
      this.player,
      selectedWeapon,
      this.spatial,
      this.random,
    );
    return this.consumePlayerTurn([...ammoEvents, ...this.awardCreditsForDefeats(events)]);
  }

  private handlePlayerSelectWeaponCommand(slot: CommandSlot): PlayerCommandResult {
    const label = weaponLabel(slot);
    if (!this.inventory.hasWeapon(slot)) {
      return {
        events: [{
          type: "weaponUnavailable",
          slot,
          label,
        }],
      };
    }

    this.inventory.selectWeapon(slot);
    return {
      events: [{
        type: "weaponSelected",
        slot,
        label,
      }],
    };
  }

  private consumePlayerTurn(events: readonly GameEvent[] = []): PlayerCommandResult {
    const enemyEvents = this.enemyTurnSystem({
      world: this.world,
      player: this.player,
      spatial: this.spatial,
      random: this.random,
    });
    this.world.refresh();
    const allEvents = [...events, ...enemyEvents];
    return this.isPlayerDefeated() ? { events: allEvents, outcome: "defeat" } : { events: allEvents };
  }

  private isPlayerDefeated(): boolean {
    return (this.getPlayerHealth()?.current ?? 1) <= 0;
  }

  private getPlayerHealth(): { current: number; max: number } | undefined {
    const entity = this.player.getEntity();
    if (!this.world.components.entityHas(Health, entity)) return undefined;
    return this.world.components.getEntityData(Health, entity);
  }

  private applyItemPickup(pickup: ItemPickup): readonly GameEvent[] {
    switch (pickup.type) {
      case "key":
        this.inventory.addKey(pickup.color);
        return [{
          type: "keyPickedUp",
          entity: pickup.entity,
        }];
      case "uplinkCode":
        this.inventory.addUplinkCode();
        return [{
          type: "uplinkCodePickedUp",
          entity: pickup.entity,
        }];
      case "weapon":
        this.inventory.unlockWeapon(pickup.slot);
        return [{
          type: "weaponPickedUp",
          entity: pickup.entity,
          slot: pickup.slot,
          label: weaponLabel(pickup.slot),
        }];
      case "health":
        return this.applyHealthPatch(pickup.entity, pickup.amount);
      case "ammo":
        this.inventory.addAmmo(pickup.ammo, pickup.amount);
        return [{
          type: "ammoPickedUp",
          entity: pickup.entity,
          ammo: pickup.ammo,
          amount: pickup.amount,
        }];
    }
  }

  private applyHealthPatch(item: Entity, amount: number): readonly GameEvent[] {
    const health = this.getPlayerHealth();
    const healed = health === undefined ? 0 : Math.min(amount, health.max - health.current);
    if (health !== undefined && healed > 0) {
      this.world.components.setEntityData(Health, this.player.getEntity(), {
        current: health.current + healed,
        max: health.max,
      });
    }
    return [{
      type: "healthPickedUp",
      entity: item,
      amount,
      healed,
    }];
  }

  private spendAmmo(ammo: AmmoKind | undefined): readonly GameEvent[] | undefined {
    if (!this.inventory.spendAmmo(ammo)) return undefined;
    return ammo === undefined ? [] : [{ type: "ammoSpent", ammo, amount: 1 }];
  }

  private awardCreditsForDefeats(events: readonly GameEvent[]): readonly GameEvent[] {
    const rewardEvents: GameEvent[] = [];
    const playerEntity = this.player.getEntity();
    for (const event of events) {
      if (event.type !== "entityDefeated" || event.actor !== playerEntity || event.entity === playerEntity) continue;

      this.progress.credits += ENEMY_DEFEAT_CREDITS;
      this.progress.score += ENEMY_DEFEAT_CREDITS;
      this.progress.levelCredits += ENEMY_DEFEAT_CREDITS;
      rewardEvents.push({
        type: "creditsEarned",
        amount: ENEMY_DEFEAT_CREDITS,
        credits: this.progress.credits,
        score: this.progress.score,
      });
    }

    return rewardEvents.length === 0 ? events : [...events, ...rewardEvents];
  }

  private completeLevel(events: readonly GameEvent[]): readonly GameEvent[] {
    if (this.progress.levelCredits <= 0) return events;

    const xpGain = this.progress.levelCredits;
    this.progress.xp += xpGain;
    this.progress.levelCredits = 0;
    return [...events, { type: "xpGained", amount: xpGain, xp: this.progress.xp }];
  }

  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.world.destroy();
  }
}
