import type { Entity, Query, World } from "@phughesmcr/miski";
import { Blocking, Door, GridPos, Interactable, Key, Locked, Npc } from "@/src/ecs/components.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import type { GridDelta } from "@/src/grid/direction.ts";
import { attackWithSelectedWeapon, DEFAULT_SELECTED_WEAPON, weaponLabel } from "@/src/ecs/combat.ts";
import { advanceEnemyTurns } from "@/src/ecs/enemy.ts";
import { Player } from "@/src/ecs/player.ts";
import { blockingQuery, keyQuery, positionedQuery } from "@/src/ecs/queries.ts";
import { relativeMoveDirectionOffset, turnDirectionDelta } from "@/src/game/commands.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import type { CommandSlot, PlayerState } from "@/src/game/state.ts";
import { terrainAt } from "@/src/map/map.ts";
import type { ExitDef, GameMap } from "@/src/map/map.ts";
import { createMapEntity } from "@/src/ecs/prefabs.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { displayNameText } from "@/src/ecs/names.ts";

const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = {
  changedWorld: false,
};

type MoveResult =
  | { readonly moved: false }
  | { readonly moved: true; readonly exit?: ExitDef };

export class GameSession implements Disposable {
  readonly world: World;
  readonly player: Player;
  readonly map: GameMap;
  private readonly heldKeys: Set<number>;
  private selectedWeapon: CommandSlot;
  private disposed = false;

  constructor(
    world: World,
    player: Player,
    map: GameMap,
    playerState: PlayerState = { heldKeys: [], selectedWeapon: DEFAULT_SELECTED_WEAPON },
  ) {
    this.world = world;
    this.player = player;
    this.map = map;
    this.heldKeys = new Set(playerState.heldKeys);
    this.selectedWeapon = playerState.selectedWeapon;
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
        changedWorld: true,
        mapChange: { goto: move.exit.goto },
      };
    }
    return this.consumePlayerTurn();
  }

  private tryMovePlayer(delta: GridDelta): MoveResult {
    const current = this.player.getPosition();
    const next = { x: current.x + delta.dx, y: current.y + delta.dy };

    if (this.positionBlocks(next.x, next.y)) return { moved: false };

    this.player.setPosition(next);
    this.collectKeyAt(next.x, next.y);
    return {
      moved: true,
      exit: this.exitAt(next.x, next.y),
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
    const target = this.facedEntity();
    if (target === undefined || !this.world.components.entityHas(Interactable, target)) {
      return UNCHANGED_PLAYER_COMMAND;
    }

    if (this.world.components.entityHas(Door, target)) {
      return this.handleDoorInteractCommand(target);
    } else if (this.world.components.entityHas(Npc, target)) {
      const npc = this.world.components.getEntityData(Npc, target);
      console.log(`Interacted with ${displayNameText(npc.displayName)}.`);
    }

    return this.consumePlayerTurn();
  }

  private handleDoorInteractCommand(door: Entity): PlayerCommandResult {
    const state = this.world.components.getEntityData(Door, door);
    if (state.open === 1) return UNCHANGED_PLAYER_COMMAND;

    if (this.world.components.entityHas(Locked, door)) {
      const lock = this.world.components.getEntityData(Locked, door);
      if (!this.heldKeys.has(lock.lockId)) {
        console.log("The door is locked.");
        return UNCHANGED_PLAYER_COMMAND;
      }
      this.world.components.removeFromEntity(Locked, door);
    }

    this.world.components.setEntityData(Door, door, { open: 1 });
    this.world.components.removeFromEntity(Blocking, door);
    console.log("Opened the door.");
    return this.consumePlayerTurn();
  }

  private handlePlayerAttackCommand(): PlayerCommandResult {
    attackWithSelectedWeapon(
      this.world,
      this.player,
      this.selectedWeapon,
      (x, y) => this.tileBlocks(x, y),
      (x, y) => this.blockingEntityAt(x, y),
    );
    return this.consumePlayerTurn();
  }

  private handlePlayerSelectWeaponCommand(slot: CommandSlot): PlayerCommandResult {
    this.selectedWeapon = slot;
    console.log(`Selected weapon ${slot}: ${weaponLabel(slot)}.`);
    return UNCHANGED_PLAYER_COMMAND;
  }

  private consumePlayerTurn(): PlayerCommandResult {
    advanceEnemyTurns(this.world, this.player, (x, y) => this.positionBlocks(x, y));
    this.world.refresh();
    return {
      changedWorld: true,
    };
  }

  tileBlocks(x: number, y: number): boolean {
    const terrain = terrainAt(this.map, x, y);
    return terrain ? terrain.blocking === true : true;
  }

  private positionBlocks(x: number, y: number): boolean {
    return this.tileBlocks(x, y) || this.blockingEntityAt(x, y) !== undefined;
  }

  private collectKeyAt(x: number, y: number): void {
    const key = this.keyAt(x, y);
    if (key === undefined) return;

    const { lockId } = this.world.components.getEntityData(Key, key);
    this.heldKeys.add(lockId);
    this.world.entities.destroy(key);
    console.log("Picked up a key.");
  }

  private keyAt(x: number, y: number): Entity | undefined {
    return this.entityAt(keyQuery, x, y);
  }

  private exitAt(x: number, y: number): ExitDef | undefined {
    for (const entity of this.map.entities) {
      if (entity.prefab === "exit" && entity.x === x && entity.y === y) return entity;
    }
    return undefined;
  }

  private facedEntity(): Entity | undefined {
    const current = this.player.getPosition();
    const { dir } = this.player.getFacing();
    const delta = directionDelta(dir);
    return this.entityAt(positionedQuery, current.x + delta.dx, current.y + delta.dy);
  }

  private blockingEntityAt(x: number, y: number): Entity | undefined {
    return this.entityAt(blockingQuery, x, y);
  }

  private entityAt(query: Query, x: number, y: number): Entity | undefined {
    for (const entity of this.world.entities.query(query)) {
      if (!this.world.entities.isActive(entity)) continue;
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

export async function createGameSession(map: GameMap, playerState?: PlayerState): Promise<GameSession> {
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

    const player = new Player(world, playerEntity);
    world.refresh();

    return new GameSession(world, player, map, playerState);
  } catch (error) {
    await world.destroy();
    throw error;
  }
}
