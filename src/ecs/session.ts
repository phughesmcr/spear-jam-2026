import type { Entity, World } from "@phughesmcr/miski";
import { GridPos, Health, Item, ItemKind, UplinkTerminal } from "@/src/ecs/components.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import type { GridDelta } from "@/src/grid/direction.ts";
import { attackWithSelectedWeapon, DEFAULT_SELECTED_WEAPON, weaponAmmoKind, weaponLabel } from "@/src/ecs/combat.ts";
import { enemyTurnSystem } from "@/src/ecs/enemy.ts";
import type { EnemyTurnSystem } from "@/src/ecs/enemy.ts";
import {
  collectKeyAt,
  collectUplinkCodeAt,
  collectWeaponPickupAt,
  interactWithEntity,
} from "@/src/ecs/interactions.ts";
import { createMapEntity } from "@/src/ecs/prefabs.ts";
import { Player } from "@/src/ecs/player.ts";
import { positionedQuery } from "@/src/ecs/queries.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { relativeMoveDirectionOffset, turnDirectionDelta } from "@/src/game/commands.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import type { AmmoKind, CommandSlot, PlayerAmmoState, PlayerState } from "@/src/game/state.ts";
import { VICTORY_GOTO } from "@/src/map/map.ts";
import type { GameMap, KeyColor } from "@/src/map/map.ts";

const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = Object.freeze({
  events: [],
});
const DEFAULT_UNLOCKED_WEAPONS: readonly CommandSlot[] = Object.freeze([DEFAULT_SELECTED_WEAPON]);
const DEFAULT_AMMO: PlayerAmmoState = Object.freeze({ pistol: 0, cannon: 0 });

type MoveResult =
  | { readonly moved: false }
  | { readonly moved: true; readonly events: readonly GameEvent[] };

export async function createGameSession(
  map: GameMap,
  random: RandomSource,
  playerState?: PlayerState,
): Promise<GameSession> {
  const world = await createWorld();

  try {
    let playerEntity: Entity | undefined;

    for (const entityDef of map.entities) {
      if (entityDef.prefab === "exit") continue;

      const entity = createMapEntity(world, entityDef);
      if (entityDef.prefab === "player") {
        playerEntity = entity;
      }
    }

    if (playerEntity === undefined) throw new Error("Map is missing a player spawn.");

    if (playerState?.health !== undefined && world.components.entityHas(Health, playerEntity)) {
      world.components.setEntityData(Health, playerEntity, playerState.health);
    }

    const player = new Player(world, playerEntity);
    world.refresh();

    return new GameSession(world, player, map, random, playerState);
  } catch (error) {
    await world.destroy();
    throw error;
  }
}

export class GameSession implements Disposable {
  readonly world: World;
  readonly player: Player;
  readonly map: GameMap;
  private readonly heldKeys: Set<KeyColor>;
  private readonly random: RandomSource;
  private readonly enemyTurnSystem: EnemyTurnSystem;
  private readonly spatial: SpatialIndex;
  private readonly terminalDestinations: ReadonlyMap<Entity, string>;
  private readonly unlockedWeapons: Set<CommandSlot>;
  private readonly ammo: { pistol: number; cannon: number };
  private selectedWeapon: CommandSlot;
  private hasUplinkCode: boolean;
  private disposed = false;

  constructor(
    world: World,
    player: Player,
    map: GameMap,
    random: RandomSource,
    playerState?: PlayerState,
  ) {
    this.world = world;
    this.player = player;
    this.map = map;
    this.heldKeys = new Set(playerState?.heldKeys ?? []);
    this.random = random;
    this.enemyTurnSystem = world.systems.create(enemyTurnSystem);
    this.spatial = new SpatialIndex(world, map);
    this.terminalDestinations = terminalDestinationsFor(world, map);
    this.unlockedWeapons = unlockedWeaponsFor(playerState);
    this.ammo = ammoFor(playerState);
    this.selectedWeapon = selectedWeaponFor(playerState?.selectedWeapon, this.unlockedWeapons);
    this.hasUplinkCode = playerState?.hasUplinkCode ?? false;
  }

  getPlayerState(): PlayerState {
    return {
      heldKeys: [...this.heldKeys],
      selectedWeapon: this.selectedWeapon,
      unlockedWeapons: sortedWeaponSlots(this.unlockedWeapons),
      ammo: { ...this.ammo },
      health: this.getPlayerHealth(),
      hasUplinkCode: this.hasUplinkCode,
    };
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
    const keyEvents = collectKeyAt(this.world, this.spatial, this.heldKeys, next.x, next.y);
    const codePickup = collectUplinkCodeAt(this.spatial, next.x, next.y);
    const weaponPickup = collectWeaponPickupAt(this.world, this.spatial, next.x, next.y);
    const itemEvents = this.collectItemAt(next.x, next.y);
    if (codePickup.collected) this.hasUplinkCode = true;
    if (weaponPickup.slot !== undefined) this.unlockedWeapons.add(weaponPickup.slot);
    return {
      moved: true,
      events: [...keyEvents, ...codePickup.events, ...weaponPickup.events, ...itemEvents],
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
      this.heldKeys,
      this.hasUplinkCode,
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

    this.clearTransientInventory();
    this.world.refresh();
    if (goto === VICTORY_GOTO) {
      return { events, outcome: "victory" };
    }
    return {
      events,
      mapChange: { goto },
    };
  }

  private handlePlayerAttackCommand(): PlayerCommandResult {
    const ammoKind = weaponAmmoKind(this.selectedWeapon);
    const ammoEvents = this.spendAmmo(ammoKind);
    if (ammoEvents.type === "blocked") return { events: ammoEvents.events };

    const events = attackWithSelectedWeapon(
      this.world,
      this.player,
      this.selectedWeapon,
      this.spatial,
      this.random,
    );
    return this.consumePlayerTurn([...ammoEvents.events, ...events]);
  }

  private handlePlayerSelectWeaponCommand(slot: CommandSlot): PlayerCommandResult {
    const label = weaponLabel(slot);
    if (!this.unlockedWeapons.has(slot)) {
      return {
        events: [{
          type: "weaponUnavailable",
          slot,
          label,
        }],
      };
    }

    this.selectedWeapon = slot;
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

  private collectItemAt(x: number, y: number): readonly GameEvent[] {
    const item = this.spatial.itemAt(x, y);
    if (item === undefined) return [];

    const { kind, amount } = this.world.components.getEntityData(Item, item);
    switch (kind) {
      case ItemKind.HealthPatch:
        return this.collectHealthPatch(item, amount);
      case ItemKind.PistolAmmo:
        return this.collectAmmo(item, "pistol", amount);
      case ItemKind.CannonAmmo:
        return this.collectAmmo(item, "cannon", amount);
      default:
        throw new Error(`Unknown item kind: ${kind}`);
    }
  }

  private collectHealthPatch(item: Entity, amount: number): readonly GameEvent[] {
    const health = this.getPlayerHealth();
    const healed = health === undefined ? 0 : Math.min(amount, health.max - health.current);
    if (health !== undefined && healed > 0) {
      this.world.components.setEntityData(Health, this.player.getEntity(), {
        current: health.current + healed,
        max: health.max,
      });
    }
    this.spatial.removeEntity(item);
    return [{
      type: "healthPickedUp",
      entity: item,
      amount,
      healed,
    }];
  }

  private collectAmmo(item: Entity, ammo: AmmoKind, amount: number): readonly GameEvent[] {
    this.ammo[ammo] += amount;
    this.spatial.removeEntity(item);
    return [{
      type: "ammoPickedUp",
      entity: item,
      ammo,
      amount,
    }];
  }

  private spendAmmo(ammo: AmmoKind | undefined):
    | { readonly type: "spent"; readonly events: readonly GameEvent[] }
    | { readonly type: "blocked"; readonly events: readonly GameEvent[] } {
    if (ammo === undefined) return { type: "spent", events: [] };
    if (this.ammo[ammo] <= 0) {
      return {
        type: "blocked",
        events: [{ type: "noAmmo", ammo }],
      };
    }

    this.ammo[ammo] -= 1;
    return {
      type: "spent",
      events: [{ type: "ammoSpent", ammo, amount: 1 }],
    };
  }

  private clearTransientInventory(): void {
    this.heldKeys.clear();
    this.hasUplinkCode = false;
  }

  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.world.destroy();
  }
}

function terminalDestinationsFor(world: World, map: GameMap): ReadonlyMap<Entity, string> {
  const destinationsByPosition = new Map<string, string>();
  for (const entityDef of map.entities) {
    if (entityDef.prefab === "uplinkTerminal") {
      destinationsByPosition.set(positionKey(entityDef.x, entityDef.y), entityDef.goto);
    }
  }

  const destinations = new Map<Entity, string>();
  for (const entity of world.entities.query(positionedQuery)) {
    if (!world.components.entityHas(UplinkTerminal, entity)) continue;
    const { x, y } = world.components.getEntityData(GridPos, entity);
    const goto = destinationsByPosition.get(positionKey(x, y));
    if (goto !== undefined) destinations.set(entity, goto);
  }
  return destinations;
}

function positionKey(x: number, y: number): string {
  return `${x},${y}`;
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
