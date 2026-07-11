import { awardCreditsForDefeats } from "@/src/ecs/progression.ts";
import { playerPosition, resolveIntent, type TurnContext } from "@/src/ecs/turn/actions.ts";
import { isPlayerDefeated, runEnemyActorTurn } from "@/src/ecs/turn/enemy.ts";
import { playerIntentsForCommand } from "@/src/ecs/turn/player.ts";
import type { PlayerCommand } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { NoiseStimulus } from "@/src/game/perception.ts";
import type { DialogueState } from "@/src/game/state.ts";
import type { GridPoint } from "@/src/grid/direction.ts";
import { TerrainBlock } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";

const DOOR_NOISE_RADIUS = 4;

export type TurnCost = "free" | "turn";

export type TurnTransactionResult = {
  readonly events: readonly GameEvent[];
  readonly cost: TurnCost;
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
  let actionNoise: NoiseStimulus | undefined;

  for (const intent of playerIntentsForCommand(context, command)) {
    const resolution = resolveIntent(context, intent);
    playerEvents.push(...resolution.events);
    cost = resolution.cost ?? cost;
    actionNoise = resolution.noise ?? actionNoise;
    if (resolution.dialogue !== undefined) {
      return {
        events: playerEvents,
        cost: "free",
        dialogue: resolution.dialogue,
      };
    }
    if (resolution.terminal !== undefined) {
      return {
        events: playerEvents,
        cost: "free",
        terminal: resolution.terminal,
      };
    }
  }

  if (cost === "free") {
    return {
      events: playerEvents,
      cost,
      noise: noisesForPlayerAction(context, playerEvents, actionNoise),
    };
  }

  const actionEvents = awardCreditsForDefeats(context.runtime.game, context.player, playerEvents);
  const noises = noisesForPlayerAction(context, actionEvents, actionNoise);
  const enemyContext = {
    ...context,
    noises,
    blocksSight: context.blocksSight ?? ((x, y) => context.runtime.crawler.blocksAt(x, y, TerrainBlock.Sight)),
  };
  context.runtime.pathfinder.beginBatch();
  let enemyEvents: readonly GameEvent[];
  try {
    enemyEvents = runEnemyPhase(enemyContext);
  } finally {
    context.runtime.pathfinder.endBatch();
  }
  const events = [...actionEvents, ...enemyEvents];
  return {
    events,
    cost,
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
  const enemies: Entity[] = [];
  context.runtime.game.query(context.runtime.game.components.Enemy, context.runtime.game.components.TurnTaker).forEach(
    (enemy) => enemies.push(enemy),
  );
  for (const enemy of enemies) {
    if (isPlayerDefeated(context)) break;
    events.push(...runEnemyActorTurn(context, enemy));
  }
  return events;
}

function noisesForPlayerAction(
  context: TurnContext,
  events: readonly GameEvent[],
  actionNoise: NoiseStimulus | undefined,
): readonly NoiseStimulus[] {
  const eventNoise = events.some((event) => event.type === "doorOpened" || event.type === "doorShattered") ?
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
