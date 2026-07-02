import type { Entity, World } from "@phughesmcr/miski";
import { Door, Health, healthFor } from "@/src/ecs/components.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import type { GridDelta } from "@/src/grid/direction.ts";
import { attackWithSelectedWeapon, weaponAmmoKind, weaponLabel, weaponNoiseRadius } from "@/src/ecs/combat.ts";
import { DrawableKind, drawableSystem } from "@/src/ecs/drawables.ts";
import type { DrawableEntity, DrawableEntityVisitor, DrawableSystem } from "@/src/ecs/drawables.ts";
import { enemyTurnSystem } from "@/src/ecs/enemy.ts";
import type { EnemyTurnSystem } from "@/src/ecs/enemy.ts";
import { collectItemAt, interactWithEntity } from "@/src/ecs/interactions.ts";
import { createMapEntity } from "@/src/ecs/prefabs.ts";
import { Player } from "@/src/ecs/player.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { examineEntity } from "@/src/game/examine.ts";
import { relativeMoveDirectionOffset, turnDirectionDelta } from "@/src/game/commands.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import type { InteractVerb } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { NoiseStimulus } from "@/src/game/perception.ts";
import { PlayerProgression } from "@/src/game/progression.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import { createPlayerState, DEFAULT_PLAYER_STATE } from "@/src/game/state.ts";
import type { CommandSlot, PlayerState, PlayerStateInput } from "@/src/game/state.ts";
import { VisibilityMap } from "@/src/game/visibility.ts";
import type { TileVisibility } from "@/src/game/visibility.ts";
import { mapDimensions, VICTORY_GOTO } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = Object.freeze({
  events: [],
});
const PLAYER_VISIBILITY_RADIUS = 6;
const MOVE_NOISE_RADIUS = 2;
const DOOR_NOISE_RADIUS = 4;

type MoveResult =
  | { readonly moved: false }
  | { readonly moved: true; readonly events: readonly GameEvent[] };

export async function createGameSession(
  map: GameMap,
  random: RandomSource,
  playerState: PlayerStateInput = {},
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

    if (world.components.entityHas(Health, playerEntity)) {
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
  private readonly visibility: VisibilityMap;
  private readonly terminalDestinations: ReadonlyMap<Entity, string>;
  private readonly progression: PlayerProgression;
  private disposed = false;

  constructor(
    world: World,
    player: Player,
    map: GameMap,
    random: RandomSource,
    terminalDestinations: ReadonlyMap<Entity, string>,
    playerState: PlayerState,
  ) {
    this.world = world;
    this.player = player;
    this.map = map;
    this.random = random;
    this.drawableSystem = world.systems.create(drawableSystem);
    this.enemyTurnSystem = world.systems.create(enemyTurnSystem);
    this.spatial = new SpatialIndex(world, map);
    this.visibility = new VisibilityMap(mapDimensions(map));
    this.terminalDestinations = new Map(terminalDestinations);
    this.progression = new PlayerProgression(playerState);
    this.refreshVisibility();
  }

  getPlayerState(): PlayerState {
    const health = healthFor(this.world, this.player.getEntity()) ?? DEFAULT_PLAYER_STATE.health;
    return {
      ...this.progression.getState(),
      health: { ...health },
    };
  }

  forEachDrawable(visit: DrawableEntityVisitor): void {
    this.drawableSystem({
      world: this.world,
      visit: (drawable) => {
        if (this.drawableIsVisible(drawable)) visit(drawable);
      },
    });
  }

  getVisibility(): TileVisibility {
    return this.visibility;
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
        return this.handlePlayerInteractCommand(command.verb);
      case "examine":
        return { events: [examineEntity(this.world, this.spatial.facedEntity(this.player))] };
      case "attack":
        return this.handlePlayerAttackCommand();
      case "selectWeapon":
        return this.handlePlayerSelectWeaponCommand(command.slot);
    }
  }

  private handlePlayerMoveCommand(directionOffset: number): PlayerCommandResult {
    const move = this.tryMovePlayerRelative(directionOffset);
    if (!move.moved) return UNCHANGED_PLAYER_COMMAND;
    return this.consumePlayerTurn(move.events, this.playerNoise(MOVE_NOISE_RADIUS));
  }

  private tryMovePlayer(delta: GridDelta): MoveResult {
    const current = this.player.getPosition();
    const next = { x: current.x + delta.dx, y: current.y + delta.dy };

    if (this.spatial.positionBlocks(next.x, next.y)) return { moved: false };

    this.spatial.moveEntity(this.player.getEntity(), next);
    const pickup = collectItemAt(this.world, this.spatial, next.x, next.y);
    const pickupEvents = pickup === undefined ? [] : this.progression.applyItemPickup(pickup, {
      world: this.world,
      playerEntity: this.player.getEntity(),
    });
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
    this.refreshVisibility();
  }

  private handlePlayerInteractCommand(verb?: InteractVerb): PlayerCommandResult {
    const interaction = interactWithEntity(
      this.world,
      this.spatial,
      this.spatial.facedEntity(this.player),
      this.progression.heldKeys,
      this.progression.hasUplinkCode,
      verb,
    );
    switch (interaction.type) {
      case "unchanged":
        return { events: interaction.events };
      case "consumeTurn":
        return this.consumePlayerTurn(interaction.events, this.noiseForEvents(interaction.events));
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

    const levelCompleteEvents = this.progression.completeLevel(events);
    this.progression.clearTransient();
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
    const selectedWeapon = this.progression.selectedWeapon;
    const ammoKind = weaponAmmoKind(selectedWeapon);
    let ammoEvents: readonly GameEvent[] = [];
    if (ammoKind !== undefined) {
      if (!this.progression.spendAmmo(ammoKind)) return { events: [{ type: "noAmmo", ammo: ammoKind }] };
      ammoEvents = [{ type: "ammoSpent", ammo: ammoKind, amount: 1 }];
    }

    const events = attackWithSelectedWeapon(
      this.world,
      this.player,
      selectedWeapon,
      this.spatial,
      this.random,
    );
    return this.consumePlayerTurn(
      [...ammoEvents, ...this.progression.awardCreditsForDefeats(events, this.player.getEntity())],
      this.playerNoise(weaponNoiseRadius(selectedWeapon)),
    );
  }

  private handlePlayerSelectWeaponCommand(slot: CommandSlot): PlayerCommandResult {
    const label = weaponLabel(slot);
    if (!this.progression.hasWeapon(slot)) {
      return {
        events: [{
          type: "weaponUnavailable",
          slot,
          label,
        }],
      };
    }

    this.progression.selectWeapon(slot);
    return {
      events: [{
        type: "weaponSelected",
        slot,
        label,
      }],
    };
  }

  private consumePlayerTurn(events: readonly GameEvent[] = [], noise?: NoiseStimulus): PlayerCommandResult {
    const enemyEvents = this.enemyTurnSystem({
      world: this.world,
      player: this.player,
      spatial: this.spatial,
      random: this.random,
      blocksSight: (x, y) => this.tileBlocksSight(x, y),
      noises: noise === undefined ? [] : [noise],
    });
    this.world.refresh();
    this.refreshVisibility();
    const allEvents = [...events, ...enemyEvents];
    return this.isPlayerDefeated() ? { events: allEvents, outcome: "defeat" } : { events: allEvents };
  }

  private refreshVisibility(): void {
    this.visibility.revealFrom(this.player.getPosition(), {
      radius: PLAYER_VISIBILITY_RADIUS,
      facing: this.player.getFacing().dir,
      blocksSight: (x, y) => this.tileBlocksSight(x, y),
    });
  }

  private tileBlocksSight(x: number, y: number): boolean {
    if (this.spatial.tileBlocks(x, y)) return true;

    const blockingEntity = this.spatial.blockingEntityAt(x, y);
    if (blockingEntity === undefined) return false;
    return this.world.components.entityHas(Door, blockingEntity) &&
      this.world.components.getEntityData(Door, blockingEntity).open === 0;
  }

  private drawableIsVisible(drawable: DrawableEntity): boolean {
    return drawable.kind === DrawableKind.Player || this.visibility.isVisible(drawable.x, drawable.y);
  }

  private noiseForEvents(events: readonly GameEvent[]): NoiseStimulus | undefined {
    if (events.some((event) => event.type === "doorOpened")) return this.playerNoise(DOOR_NOISE_RADIUS);
    return undefined;
  }

  private playerNoise(radius: number): NoiseStimulus | undefined {
    if (radius <= 0) return undefined;

    const position = this.player.getPosition();
    return {
      x: position.x,
      y: position.y,
      radius,
    };
  }

  private isPlayerDefeated(): boolean {
    return (healthFor(this.world, this.player.getEntity())?.current ?? 1) <= 0;
  }

  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.world.destroy();
  }
}
