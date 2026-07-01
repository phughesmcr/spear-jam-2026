import type { Entity } from "@phughesmcr/miski";
import { createMapEntity } from "@/src/ecs/prefabs.ts";
import { Player } from "@/src/ecs/player.ts";
import { GameSession } from "@/src/ecs/session.ts";
import type { RandomSource } from "@/src/ecs/session.ts";
import { createWorld } from "@/src/ecs/world.ts";
import type { PlayerState } from "@/src/game/state.ts";
import type { GameMap } from "@/src/map/map.ts";

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

    const player = new Player(world, playerEntity);
    world.refresh();

    return new GameSession(world, player, map, random, playerState);
  } catch (error) {
    await world.destroy();
    throw error;
  }
}
