import { awardCreditsForDefeats } from "@/src/game/simulation/progression.ts";
import { playerPosition, resolveIntent, type TurnContext } from "@/src/game/simulation/turn/actions.ts";
import {
  type EnemyHearing,
  isPlayerDefeated,
  prepareEnemyHearing,
  runEnemyActorTurn,
} from "@/src/game/simulation/turn/enemy.ts";
import { playerIntentsForCommand } from "@/src/game/simulation/turn/player.ts";
import type { PlayerCommand } from "@/src/game/model/commands.ts";
import type { GameEvent } from "@/src/game/model/events.ts";
import type { NoiseStimulus } from "@/src/game/simulation/perception.ts";
import type { DialogueState } from "@/src/game/model/state.ts";
import type { GridPoint } from "@/src/game/world/direction.ts";
import { TerrainBlock } from "turn-based-engine/crawler";
import { type Entity, QuerySnapshot } from "turn-based-engine/ecs";

const DOOR_NOISE_RADIUS = 4;
const enemyTurnSnapshots = new WeakMap<TurnContext["runtime"], QuerySnapshot>();

export type TurnCost = "free" | "turn";

export type TurnTransactionResult = {
  readonly events: readonly GameEvent[];
  readonly cost: TurnCost;
  readonly dialogue?: {
    readonly target?: Entity;
    readonly dialogue: DialogueState;
  };
  readonly terminal?: Entity;
  readonly outcome?: "victory" | "defeat";
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
    if (resolution.outcome === "victory") {
      return {
        events: playerEvents,
        cost: "free",
        outcome: "victory",
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
  const hearing = prepareEnemyHearing(context.runtime, noises);
  const enemyContext = {
    ...context,
    hearing,
    blocksSight: context.blocksSight ?? ((x, y) => context.runtime.crawler.blocksAt(x, y, TerrainBlock.Sight)),
  };
  const enemyEvents = context.runtime.pathfinder.batch(() => runEnemyPhase(enemyContext));
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
    readonly hearing: EnemyHearing;
  },
): readonly GameEvent[] {
  const events: GameEvent[] = [];
  const { game } = context.runtime;
  const enemyQuery = game.query(game.components.Enemy, game.components.TurnTaker);
  const enemyTurnSnapshot = snapshotForEnemyPhase(context.runtime);
  enemyQuery.snapshotInto(enemyTurnSnapshot);
  enemyTurnSnapshot.forEach((enemy) => {
    if (isPlayerDefeated(context)) return;
    if (
      !game.isEntityAlive(enemy) ||
      !game.entityHasComponent(enemy, game.components.Enemy) ||
      !game.entityHasComponent(enemy, game.components.TurnTaker)
    ) return;
    events.push(...runEnemyActorTurn(context, enemy));
  });
  return events;
}

function snapshotForEnemyPhase(runtime: TurnContext["runtime"]): QuerySnapshot {
  let snapshot = enemyTurnSnapshots.get(runtime);
  if (snapshot === undefined) {
    snapshot = new QuerySnapshot();
    enemyTurnSnapshots.set(runtime, snapshot);
  }
  return snapshot;
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
