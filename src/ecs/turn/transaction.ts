import type { Entity } from "@phughesmcr/miski";
import { awardCreditsForDefeats } from "@/src/ecs/progression.ts";
import { enemyTurnQuery } from "@/src/ecs/queries.ts";
import type { SpatialDistanceField } from "@/src/ecs/spatial.ts";
import { playerPosition, resolveIntent, type TurnContext, type TurnSpatial } from "@/src/ecs/turn/actions.ts";
import { isPlayerDefeated, runEnemyActorTurn } from "@/src/ecs/turn/enemy.ts";
import { playerIntentsForCommand } from "@/src/ecs/turn/player.ts";
import type { PlayerCommand } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { NoiseStimulus } from "@/src/game/perception.ts";
import type { DialogueState } from "@/src/game/state.ts";
import type { GridPoint } from "@/src/grid/direction.ts";

const DOOR_NOISE_RADIUS = 4;

export type TurnCost = "free" | "turn";

export type TurnTransactionResult = {
  readonly events: readonly GameEvent[];
  readonly cost: TurnCost;
  readonly refreshVisibility: boolean;
  readonly dialogue?: {
    readonly target: Entity;
    readonly dialogue: DialogueState;
  };
  readonly terminal?: Entity;
  readonly outcome?: "defeat";
  readonly noise?: readonly NoiseStimulus[];
};

export function runTurnTransaction(context: TurnContext, command: PlayerCommand): TurnTransactionResult {
  const playerEvents: GameEvent[] = [];
  let cost: TurnCost = "free";
  let refreshVisibility = false;
  let actionNoise: NoiseStimulus | undefined;

  for (const intent of playerIntentsForCommand(context, command)) {
    const resolution = resolveIntent(context, intent);
    playerEvents.push(...resolution.events);
    cost = resolution.cost ?? cost;
    refreshVisibility = refreshVisibility || resolution.refreshVisibility === true;
    actionNoise = resolution.noise ?? actionNoise;
    if (resolution.dialogue !== undefined) {
      return {
        events: playerEvents,
        cost: "free",
        refreshVisibility,
        dialogue: resolution.dialogue,
      };
    }
    if (resolution.terminal !== undefined) {
      return {
        events: playerEvents,
        cost: "free",
        refreshVisibility,
        terminal: resolution.terminal,
      };
    }
  }

  if (cost === "free") {
    return {
      events: playerEvents,
      cost,
      refreshVisibility,
      noise: noisesForPlayerAction(context, playerEvents, actionNoise),
    };
  }

  const actionEvents = awardCreditsForDefeats(context.world, context.player, playerEvents);
  const noises = noisesForPlayerAction(context, actionEvents, actionNoise);
  const enemyEvents = runEnemyPhase({
    ...context,
    spatial: phasePathingSpatial(context.spatial),
    noises,
    blocksSight: context.blocksSight ?? ((x, y) => context.spatial.tileBlocksSight(x, y)),
  });
  const events = [...actionEvents, ...enemyEvents];
  return {
    events,
    cost,
    refreshVisibility: true,
    outcome: isPlayerDefeated(context) ? "defeat" : undefined,
    noise: noises,
  };
}

function runEnemyPhase(
  context: TurnContext & {
    readonly noises: readonly NoiseStimulus[];
  },
): readonly GameEvent[] {
  const events: GameEvent[] = [];
  const enemies = [...context.world.entities.query(enemyTurnQuery)];
  for (const enemy of enemies) {
    if (isPlayerDefeated(context)) break;
    events.push(...runEnemyActorTurn(context, enemy));
  }
  return events;
}

function phasePathingSpatial(spatial: TurnSpatial): TurnSpatial {
  if (spatial.distanceFieldTo === undefined) return spatial;

  const fields = new Map<string, SpatialDistanceField>();
  return {
    tileBlocks: (x, y) => spatial.tileBlocks(x, y),
    tileBlocksSight: (x, y) => spatial.tileBlocksSight(x, y),
    tileBlocksAttacks: (x, y) => spatial.tileBlocksAttacks(x, y),
    blockingEntityAt: (x, y) => spatial.blockingEntityAt(x, y),
    positionBlocks: (x, y) => spatial.positionBlocks(x, y),
    itemAt: (x, y) => spatial.itemAt(x, y),
    facedEntity: (current, dir) => spatial.facedEntity(current, dir),
    moveEntity: (entity, to) => spatial.moveEntity(entity, to),
    removeEntity: (entity) => spatial.removeEntity(entity),
    setBlocking: (entity, blocking) => spatial.setBlocking(entity, blocking),
    setDoorOpen: (entity, open) => spatial.setDoorOpen(entity, open),
    nextStepToward(start, target) {
      const key = `${target.x},${target.y}`;
      let field = fields.get(key);
      if (field === undefined) {
        field = spatial.distanceFieldTo!(target);
        fields.set(key, field);
      }
      return field.nextStepFrom(start);
    },
    distanceFieldTo: (target) => spatial.distanceFieldTo!(target),
  };
}

function noisesForPlayerAction(
  context: TurnContext,
  events: readonly GameEvent[],
  actionNoise: NoiseStimulus | undefined,
): readonly NoiseStimulus[] {
  const eventNoise = events.some((event) => event.type === "doorOpened") ?
    noiseAt(playerPosition(context), DOOR_NOISE_RADIUS) :
    undefined;
  if (actionNoise === undefined) return eventNoise === undefined ? [] : [eventNoise];
  return eventNoise === undefined ? [actionNoise] : [actionNoise, eventNoise];
}

function noiseAt(position: GridPoint, radius: number): NoiseStimulus | undefined {
  if (radius <= 0) return undefined;
  return {
    x: position.x,
    y: position.y,
    radius,
  };
}
