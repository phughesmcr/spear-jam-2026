import type { World } from "@phughesmcr/miski";
import { directionDelta } from "@/src/grid/direction.ts";
import type { GridDelta } from "@/src/grid/direction.ts";
import { attackWithSelectedWeapon, DEFAULT_SELECTED_WEAPON, weaponLabel } from "@/src/ecs/combat.ts";
import { enemyTurnSystem } from "@/src/ecs/enemy.ts";
import type { EnemyTurnSystem } from "@/src/ecs/enemy.ts";
import { collectKeyAt, interactWithEntity } from "@/src/ecs/interactions.ts";
import { Player } from "@/src/ecs/player.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { relativeMoveDirectionOffset, turnDirectionDelta } from "@/src/game/commands.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { CommandSlot, PlayerState } from "@/src/game/state.ts";
import type { ExitDef, GameMap } from "@/src/map/map.ts";

const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = {
  events: [],
};

type MoveResult =
  | { readonly moved: false }
  | { readonly moved: true; readonly events: readonly GameEvent[]; readonly exit?: ExitDef };
export type RandomSource = () => number;

export class GameSession implements Disposable {
  readonly world: World;
  readonly player: Player;
  readonly map: GameMap;
  private readonly heldKeys: Set<number>;
  private readonly random: RandomSource;
  private readonly enemyTurnSystem: EnemyTurnSystem;
  private readonly spatial: SpatialIndex;
  private selectedWeapon: CommandSlot;
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
    this.selectedWeapon = playerState?.selectedWeapon ?? DEFAULT_SELECTED_WEAPON;
  }

  getPlayerState(): PlayerState {
    return {
      heldKeys: [...this.heldKeys],
      selectedWeapon: this.selectedWeapon,
    };
  }

  handlePlayerCommand(command: PlayerCommand): PlayerCommandResult {
    switch (command.type) {
      case "move":
        return this.handlePlayerMoveCommand(relativeMoveDirectionOffset(command.direction));
      case "turn":
        this.turnPlayer(turnDirectionDelta(command.direction));
        return this.consumePlayerTurn();
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
    if (move.exit) {
      this.world.refresh();
      return {
        events: move.events,
        mapChange: { goto: move.exit.goto },
      };
    }
    return this.consumePlayerTurn(move.events);
  }

  private tryMovePlayer(delta: GridDelta): MoveResult {
    const current = this.player.getPosition();
    const next = { x: current.x + delta.dx, y: current.y + delta.dy };

    if (this.spatial.positionBlocks(next.x, next.y)) return { moved: false };

    this.spatial.moveEntity(this.player.getEntity(), next);
    const events = collectKeyAt(this.world, this.spatial, this.heldKeys, next.x, next.y);
    return {
      moved: true,
      events,
      exit: this.spatial.exitAt(next.x, next.y),
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
    }
  }

  private handlePlayerAttackCommand(): PlayerCommandResult {
    const events = attackWithSelectedWeapon(
      this.world,
      this.player,
      this.selectedWeapon,
      this.spatial,
      this.random,
    );
    return this.consumePlayerTurn(events);
  }

  private handlePlayerSelectWeaponCommand(slot: CommandSlot): PlayerCommandResult {
    this.selectedWeapon = slot;
    const label = weaponLabel(slot);
    return {
      events: [{
        type: "weaponSelected",
        slot,
        label,
        message: `Selected weapon ${slot}: ${label}.`,
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
    return {
      events: [...events, ...enemyEvents],
    };
  }

  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.world.destroy();
  }
}
