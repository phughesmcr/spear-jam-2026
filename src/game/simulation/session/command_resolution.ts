import type { EnemySoundProfile } from "@/src/game/content/enemies.ts";
import type { StoryEventId } from "@/src/game/content/story.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/model/commands.ts";
import type { GameEvent } from "@/src/game/model/events.ts";
import type { SoundCue } from "@/src/game/model/sound.ts";
import { enemyArchetypeFor } from "@/src/game/simulation/components.ts";
import { selectedPlayerWeapon } from "@/src/game/simulation/progression.ts";
import type { MapSessionState } from "@/src/game/simulation/session/map_lifecycle.ts";
import {
  forEachEnemyIdleSoundSource,
  type OutputReaderState,
  playerPosition,
} from "@/src/game/simulation/session/output_readers.ts";
import {
  completeCurrentLevel,
  type ProgressionStatisticsState,
  recordCommandStatistics,
} from "@/src/game/simulation/session/progression_statistics.ts";
import { applyEvent, queueTalkEvent } from "@/src/game/simulation/session/story_actions.ts";
import { soundCuesForEvents } from "@/src/game/simulation/sound_cues.ts";
import type { TurnContext } from "@/src/game/simulation/turn/actions.ts";
import { runTurnTransaction, type TurnTransactionResult } from "@/src/game/simulation/turn/transaction.ts";
import type { GridPoint } from "@/src/game/world/direction.ts";
import type { Entity } from "turn-based-engine/ecs";
import type { CrawlerCoreEvent } from "turn-based-engine/crawler";

const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = Object.freeze({ type: "continue", events: [] });

export type CommandResolutionState = {
  readonly map: MapSessionState;
  readonly progression: ProgressionStatisticsState;
  readonly outputs: OutputReaderState;
  readonly now: () => number;
  pendingDialogueStoryEvent?: StoryEventId;
};

export function createCommandResolution(
  map: MapSessionState,
  progression: ProgressionStatisticsState,
  outputs: OutputReaderState,
  now: () => number,
): CommandResolutionState {
  return {
    map,
    progression,
    outputs,
    now,
  };
}

export function tickCommandResolution(state: CommandResolutionState, nowMs: number): boolean {
  return state.outputs.projection.advance(nowMs);
}

export function handlePlayerCommand(
  state: CommandResolutionState,
  command: PlayerCommand,
): PlayerCommandResult {
  const enemySounds = enemySoundSnapshot(state);
  const playerPositionBefore = playerPosition(state.outputs);
  const playerWeaponSlot = selectedPlayerWeapon(state.map.runtime.simulation.ecs, state.map.player);
  const transaction = runTurnTransaction(turnContext(state), command);
  const dialogueTarget = transaction.dialogue?.target;
  const result = commitTurnTransaction(state, transaction);
  const playerPositionAfter = playerPosition(state.outputs);
  recordCommandStatistics(
    state.progression,
    state.map,
    command,
    result,
    playerPositionBefore,
    playerPositionAfter,
  );
  const soundCues = soundCuesForEvents(result.events, {
    playerEntity: state.map.player,
    playerPosition: playerPositionAfter,
    positionFor: positionResolver(state.map, transaction.coreEvents),
    enemySounds,
    blockedMove: command.type === "move" && samePosition(playerPositionBefore, playerPositionAfter) &&
      result.events.length === 0,
    dialogueTarget,
    playerWeaponSlot,
    playerWeaponRadius: state.map.runtime.content.simulation.weapon(playerWeaponSlot).noiseRadius,
  });
  return withSoundCues(result, soundCues);
}

export function closeDialogue(state: CommandResolutionState): void {
  const event = state.pendingDialogueStoryEvent;
  if (event === undefined) return;
  const application = applyEvent(state.map.runtime, state.map.player, event);
  state.pendingDialogueStoryEvent = undefined;
  if (application.applied) {
    const nowMs = state.now();
    state.outputs.projection.consume(state.map.player, application.coreEvents, [], nowMs);
    state.outputs.projection.advance(nowMs);
  }
}

function turnContext(state: CommandResolutionState): Omit<TurnContext, "execution"> {
  return {
    runtime: state.map.runtime,
    player: state.map.player,
  };
}

function commitTurnTransaction(
  state: CommandResolutionState,
  transaction: TurnTransactionResult,
): PlayerCommandResult {
  const nowMs = state.now();
  state.outputs.projection.consume(state.map.player, transaction.coreEvents, transaction.events, nowMs);
  state.outputs.projection.advance(nowMs);
  if (transaction.dialogue !== undefined) {
    const event = queueTalkEvent(state.map.runtime, state.map.player, transaction.dialogue.target);
    if (event !== undefined) state.pendingDialogueStoryEvent = event;
    return { type: "dialogue", events: transaction.events, dialogue: transaction.dialogue.dialogue };
  }
  if (transaction.transition?.kind === "victory") return commitVictory(state, transaction.events);
  if (transaction.transition?.kind === "map") {
    return commitMapChange(state, transaction.transition.goto, transaction.events);
  }
  if (transaction.outcome === "defeat") {
    return { type: "outcome", events: transaction.events, outcome: "defeat" };
  }
  return transaction.events.length === 0 ? UNCHANGED_PLAYER_COMMAND : { type: "continue", events: transaction.events };
}

function commitVictory(state: CommandResolutionState, events: readonly GameEvent[]): PlayerCommandResult {
  const completion = completeCurrentLevel(state.progression, events);
  return { type: "outcome", events: completion.events, outcome: "victory", levelStats: completion.stats };
}

function commitMapChange(
  state: CommandResolutionState,
  goto: string,
  events: readonly GameEvent[],
): PlayerCommandResult {
  const completion = completeCurrentLevel(state.progression, events);
  return { type: "mapChange", events: completion.events, mapChange: { goto }, levelStats: completion.stats };
}

function positionResolver(
  map: MapSessionState,
  coreEvents: readonly CrawlerCoreEvent[],
): (entity: Entity) => GridPoint | undefined {
  const changed = new Map<Entity, GridPoint>();
  for (const event of coreEvents) {
    switch (event.type) {
      case "moved":
      case "teleported":
        changed.set(event.entity.entity, event.to);
        break;
      case "spawned":
      case "despawned":
        changed.set(event.entity.entity, event.at);
        break;
    }
  }
  return (entity) => {
    const position = changed.get(entity);
    if (position !== undefined) return position;
    return map.runtime.simulation.ecs.isEntityAlive(entity) ?
      map.runtime.simulation.crawler.entityPosition(entity) :
      undefined;
  };
}

function enemySoundSnapshot(state: CommandResolutionState): ReadonlyMap<Entity, EnemySoundProfile> {
  const sounds = new Map<Entity, EnemySoundProfile>();
  forEachEnemyIdleSoundSource(state.outputs, (source) => {
    const archetype = enemyArchetypeFor(
      state.map.runtime.simulation.ecs,
      source.entity,
      state.map.runtime.content.simulation,
    );
    if (archetype !== undefined) {
      sounds.set(source.entity, state.map.runtime.content.simulation.enemyForCode(archetype).definition.sounds);
    }
  });
  return sounds;
}

function withSoundCues(result: PlayerCommandResult, soundCues: readonly SoundCue[]): PlayerCommandResult {
  if (soundCues.length === 0) return result;
  switch (result.type) {
    case "continue":
      return { type: "continue", events: result.events, soundCues };
    case "dialogue":
      return { type: "dialogue", events: result.events, dialogue: result.dialogue, soundCues };
    case "mapChange":
      return {
        type: "mapChange",
        events: result.events,
        mapChange: result.mapChange,
        levelStats: result.levelStats,
        soundCues,
      };
    case "outcome":
      return result.outcome === "victory" ?
        { type: "outcome", events: result.events, outcome: "victory", levelStats: result.levelStats, soundCues } :
        { type: "outcome", events: result.events, outcome: "defeat", soundCues };
  }
}

function samePosition(a: GridPoint, b: GridPoint): boolean {
  return a.x === b.x && a.y === b.y;
}
