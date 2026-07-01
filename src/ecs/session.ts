import type { Entity, World } from "@phughesmcr/miski";
import { Combatant, GridPos, Interactable, Npc } from "@/src/ecs/components.ts";
import { directionDelta } from "@/src/map/direction.ts";
import type { GridDelta } from "@/src/map/direction.ts";
import { Player } from "@/src/ecs/player.ts";
import { blockingQuery, nonPlayerTurnTakerQuery, positionedQuery } from "@/src/ecs/queries.ts";
import { relativeMoveDirectionOffset, turnDirectionDelta } from "@/src/game/commands.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import { terrainAt } from "@/src/map/map_1.ts";
import type { GameMap } from "@/src/map/map_1.ts";
import { createMapEntity } from "@/src/ecs/prefabs.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { displayNameText } from "@/src/strings.ts";

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
        return this.handlePlayerInteractCommand();
      case "attack":
        return this.handlePlayerAttackCommand();
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

    if (this.positionBlocks(next.x, next.y)) return false;

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

  private handlePlayerInteractCommand(): PlayerCommandResult {
    const target = this.facedEntity();
    if (target === undefined || !this.world.components.entityHas(Interactable, target)) {
      return UNCHANGED_PLAYER_COMMAND;
    }

    if (this.world.components.entityHas(Npc, target)) {
      const npc = this.world.components.getEntityData(Npc, target);
      console.log(`Interacted with ${displayNameText(npc.displayName)}.`);
    }

    return this.consumePlayerTurn();
  }

  private handlePlayerAttackCommand(): PlayerCommandResult {
    const target = this.facedEntity();
    if (target === undefined || !this.world.components.entityHas(Combatant, target)) {
      return UNCHANGED_PLAYER_COMMAND;
    }

    return this.consumePlayerTurn();
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
    for (const entity of this.world.entities.query(nonPlayerTurnTakerQuery)) {
      this.advanceNonPlayerTurn(entity);
    }
  }

  private advanceNonPlayerTurn(entity: Entity): void {
    if (!this.world.entities.isActive(entity)) return;
    // NPCs intentionally wait until they gain behavior components.
  }

  tileBlocks(x: number, y: number): boolean {
    const terrain = terrainAt(this.map, x, y);
    return terrain ? terrain.blocking === true : true;
  }

  private positionBlocks(x: number, y: number): boolean {
    return this.tileBlocks(x, y) || this.blockingEntityAt(x, y) !== undefined;
  }

  private facedEntity(): Entity | undefined {
    const current = this.player.getPosition();
    const { dir } = this.player.getFacing();
    const delta = directionDelta(dir);
    return this.entityAt(current.x + delta.dx, current.y + delta.dy);
  }

  private entityAt(x: number, y: number): Entity | undefined {
    for (const entity of this.world.entities.query(positionedQuery)) {
      const position = this.world.components.getEntityData(GridPos, entity);
      if (position.x === x && position.y === y) return entity;
    }
    return undefined;
  }

  private blockingEntityAt(x: number, y: number): Entity | undefined {
    for (const entity of this.world.entities.query(blockingQuery)) {
      const position = this.world.components.getEntityData(GridPos, entity);
      if (position.x === x && position.y === y) return entity;
    }
    return undefined;
  }

  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.world.destroy();
  }
}

export async function createGameSession(map: GameMap): Promise<GameSession> {
  const world = await createWorld();
  let playerEntity: Entity | undefined;

  for (const entityDef of map.entities) {
    const entity = createMapEntity(world, entityDef);
    if (entityDef.prefab === "player") {
      playerEntity = entity;
    }
  }

  if (playerEntity === undefined) throw new Error("Map is missing a player spawn.");

  const player = new Player(world, playerEntity);
  world.refresh();

  return new GameSession(world, player, map);
}
