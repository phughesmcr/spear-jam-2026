import type { World } from "@phughesmcr/miski";
import { directionDelta } from "@/src/map/direction.ts";
import type { GridDelta } from "@/src/map/direction.ts";
import { Player } from "@/src/ecs/player.ts";
import { relativeMoveDirectionOffset, turnDirectionDelta } from "@/src/game/commands.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import { terrainAt } from "@/src/map/map_1.ts";
import type { GameMap } from "@/src/map/map_1.ts";
import { createPlayer } from "@/src/ecs/prefabs.ts";
import { createWorld } from "@/src/ecs/world.ts";

const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = {
  consumedTurn: false,
  changedWorld: false,
};

export class GameSession implements Disposable {
  readonly world: World;
  readonly player: Player;
  readonly map: GameMap;
  private disposed = false;

  constructor(world: World, player: Player, map: GameMap) {
    this.world = world;
    this.player = player;
    this.map = map;
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
      case "attack":
      case "selectItem":
      case "selectWeapon":
        return UNCHANGED_PLAYER_COMMAND;
    }
  }

  private handlePlayerMoveCommand(directionOffset: number): PlayerCommandResult {
    if (!this.tryMovePlayerRelative(directionOffset)) return UNCHANGED_PLAYER_COMMAND;
    return this.consumePlayerTurn();
  }

  private tryMovePlayer(delta: GridDelta): boolean {
    const current = this.player.getPosition();
    const next = { x: current.x + delta.dx, y: current.y + delta.dy };

    if (this.tileBlocks(next.x, next.y)) return false;

    this.player.setPosition(next);
    return true;
  }

  private tryMovePlayerRelative(directionOffset: number): boolean {
    const { dir } = this.player.getFacing();
    return this.tryMovePlayer(directionDelta(dir + directionOffset));
  }

  private turnPlayer(delta: number): void {
    this.player.turnBy(delta);
  }

  private consumePlayerTurn(): PlayerCommandResult {
    this.advanceNonPlayerTurns();
    this.world.refresh();
    return {
      consumedTurn: true,
      changedWorld: true,
    };
  }

  private advanceNonPlayerTurns(): void {
    // Non-player turns will be resolved here once enemies/NPCs exist.
  }

  tileBlocks(x: number, y: number): boolean {
    const terrain = terrainAt(this.map, x, y);
    return terrain ? terrain.blocking === true : true;
  }

  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.world.destroy();
  }
}

export async function createGameSession(map: GameMap): Promise<GameSession> {
  const world = await createWorld();
  const playerPrefab = map.entities.find((entity) => entity.prefab === "player");
  if (!playerPrefab) throw new Error("Map is missing a player spawn.");

  const player = new Player(world, createPlayer(world, playerPrefab));
  world.refresh();

  return new GameSession(world, player, map);
}
