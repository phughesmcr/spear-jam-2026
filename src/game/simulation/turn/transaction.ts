import {
  awardCreditsForDefeats,
  clearTransientPlayerState,
  completePlayerLevel,
} from "@/src/game/simulation/progression.ts";
import { readComponent } from "@/src/game/simulation/components.ts";
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
import type { CrawlerCoreEvent } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";

const DOOR_NOISE_RADIUS = 4;

export type TurnCost = "free" | "turn";

export type TurnTransactionResult = {
  readonly coreEvents: readonly CrawlerCoreEvent[];
  readonly events: readonly GameEvent[];
  readonly cost: TurnCost;
  readonly dialogue?: {
    readonly target?: Entity;
    readonly dialogue: DialogueState;
  };
  readonly transition?:
    | { readonly kind: "victory" }
    | { readonly kind: "map"; readonly goto: string };
  readonly outcome?: "victory" | "defeat";
  readonly noise?: readonly NoiseStimulus[];
};

type TurnResolution = Omit<TurnTransactionResult, "coreEvents"> & {
  readonly terminal?: Entity;
};

export function runTurnTransaction(
  context: Omit<TurnContext, "execution">,
  command: PlayerCommand,
): TurnTransactionResult {
  const result = context.runtime.simulation.executeTurn((execution) =>
    resolveTurnAndComplete({ ...context, execution }, command)
  );
  return { ...result.value, coreEvents: result.coreEvents };
}

function resolveTurnAndComplete(context: TurnContext, command: PlayerCommand): TurnResolution {
  const resolution = resolveTurn(context, command);
  const transition = transitionFor(context, resolution);
  if (transition === undefined) return resolution;
  const events = completePlayerLevel(
    context.runtime.simulation.ecs,
    context.execution.mutation,
    context.player,
    resolution.events,
  );
  clearTransientPlayerState(context.execution.mutation, context.player);
  return { ...resolution, events, transition, terminal: undefined };
}

function resolveTurn(context: TurnContext, command: PlayerCommand): TurnResolution {
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

  const actionEvents = awardCreditsForDefeats(
    context.runtime.simulation.ecs,
    context.execution.mutation,
    context.player,
    playerEvents,
  );
  const noises = noisesForPlayerAction(context, actionEvents, actionNoise);
  const hearing = prepareEnemyHearing(context.runtime, noises);
  const enemyContext = {
    ...context,
    hearing,
    blocksSight: context.blocksSight ??
      ((x, y) => context.runtime.simulation.crawler.blocksAt(x, y, TerrainBlock.Sight)),
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
  const game = context.runtime.simulation.ecs;
  const enemyQuery = game.query(game.components.Enemy, game.components.TurnTaker);
  context.execution.phase(enemyQuery, (enemy) => {
    if (isPlayerDefeated(context)) return "stop";
    events.push(...runEnemyActorTurn(context, enemy));
  });
  return events;
}

function transitionFor(
  context: TurnContext,
  resolution: TurnResolution,
): TurnResolution["transition"] {
  if (resolution.outcome === "victory") return { kind: "victory" };
  if (resolution.terminal === undefined) return undefined;
  const destinationCode = readComponent(
    context.runtime.simulation.ecs,
    resolution.terminal,
    "TerminalDestination",
  )?.destination;
  if (destinationCode === undefined) {
    throw new Error(`Uplink terminal ${resolution.terminal} is missing a map destination.`);
  }
  const destination = context.runtime.content.levels.destinationForCode(destinationCode);
  return destination.kind === "victory" ? { kind: "victory" } : { kind: "map", goto: destination.level.map.name };
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
