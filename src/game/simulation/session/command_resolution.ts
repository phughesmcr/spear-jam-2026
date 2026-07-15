import type { RandomSource } from "@/src/engine/random.ts";
import { enemyCatalogEntry, type EnemySoundProfile } from "@/src/game/content/enemies.ts";
import type { StoryEventId } from "@/src/game/content/story.ts";
import { playerWeaponSpec } from "@/src/game/content/weapons.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/model/commands.ts";
import type { GameEvent } from "@/src/game/model/events.ts";
import type { SoundCue } from "@/src/game/model/sound.ts";
import { enemyArchetypeFor, readComponent } from "@/src/game/simulation/components.ts";
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
import {
  type AnimationController,
  createAnimationController,
} from "@/src/game/simulation/session/sprite_animations.ts";
import { applyEvent, queueTalkEvent } from "@/src/game/simulation/session/story_actions.ts";
import { soundCuesForEvents } from "@/src/game/simulation/sound_cues.ts";
import type { TurnContext } from "@/src/game/simulation/turn/actions.ts";
import { runTurnTransaction, type TurnTransactionResult } from "@/src/game/simulation/turn/transaction.ts";
import { terminalDestinationForCode } from "@/src/game/world/campaign.ts";
import { VICTORY_GOTO } from "@/src/game/world/destinations.ts";
import type { GridPoint } from "@/src/game/world/direction.ts";
import type { Entity } from "turn-based-engine/ecs";

const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = Object.freeze({ type: "continue", events: [] });
type EntityPositionSnapshot = ReadonlyMap<Entity, GridPoint>;

export type CommandResolutionState = {
  readonly map: MapSessionState;
  readonly progression: ProgressionStatisticsState;
  readonly outputs: OutputReaderState;
  readonly random: RandomSource;
  readonly animations: AnimationController;
  pendingDialogueStoryEvent?: StoryEventId;
};

export function createCommandResolution(
  map: MapSessionState,
  progression: ProgressionStatisticsState,
  outputs: OutputReaderState,
  random: RandomSource,
): CommandResolutionState {
  return {
    map,
    progression,
    outputs,
    random,
    animations: createAnimationController(map.runtime),
  };
}

export function tickCommandResolution(state: CommandResolutionState, nowMs: number): boolean {
  return state.animations.advance(nowMs);
}

export function handlePlayerCommand(
  state: CommandResolutionState,
  command: PlayerCommand,
): PlayerCommandResult {
  const positionsBefore = entityPositionSnapshot(state.map);
  const enemySounds = enemySoundSnapshot(state);
  const playerPositionBefore = playerPosition(state.outputs);
  const playerWeaponSlot = selectedPlayerWeapon(state.map.runtime.game, state.map.player);
  const actorPositions = state.animations.actorPositions();
  const transaction = runTurnTransaction(turnContext(state), command);
  const dialogueTarget = transaction.dialogue?.target;
  const result = commitTurnTransaction(state, transaction, actorPositions);
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
    positionsBefore,
    positionsAfter: entityPositionSnapshot(state.map),
    enemySounds,
    blockedMove: command.type === "move" && samePosition(playerPositionBefore, playerPositionAfter) &&
      result.events.length === 0,
    dialogueTarget,
    playerWeaponSlot,
    playerWeaponRadius: playerWeaponSpec(playerWeaponSlot).noiseRadius,
  });
  return withSoundCues(result, soundCues);
}

export function closeDialogue(state: CommandResolutionState): void {
  const event = state.pendingDialogueStoryEvent;
  state.pendingDialogueStoryEvent = undefined;
  if (event !== undefined) applyEvent(state.map.runtime, state.map.player, event, performance.now());
}

function turnContext(state: CommandResolutionState): TurnContext {
  return {
    runtime: state.map.runtime,
    player: state.map.player,
    random: state.random,
    writeDefeatEffect: state.animations.writeDefeatEffect,
  };
}

function commitTurnTransaction(
  state: CommandResolutionState,
  transaction: TurnTransactionResult,
  actorPositions: ReturnType<AnimationController["actorPositions"]>,
): PlayerCommandResult {
  if (transaction.dialogue !== undefined) {
    const event = queueTalkEvent(state.map.runtime, state.map.player, transaction.dialogue.target);
    if (event !== undefined) state.pendingDialogueStoryEvent = event;
    return { type: "dialogue", events: transaction.events, dialogue: transaction.dialogue.dialogue };
  }
  if (transaction.terminal !== undefined) {
    return commitUplinkTerminalActivation(state, transaction.terminal, transaction.events);
  }
  if (transaction.outcome === "victory") return commitVictory(state, transaction.events);
  if (transaction.cost === "turn") {
    const nowMs = performance.now();
    state.animations.applyWalks(actorPositions, nowMs);
    state.animations.applyEvents(state.map.player, transaction.events, nowMs);
    state.animations.advance(nowMs);
  }
  if (transaction.outcome === "defeat") {
    return { type: "outcome", events: transaction.events, outcome: "defeat" };
  }
  return transaction.events.length === 0 ? UNCHANGED_PLAYER_COMMAND : { type: "continue", events: transaction.events };
}

function commitUplinkTerminalActivation(
  state: CommandResolutionState,
  terminal: Entity,
  events: readonly GameEvent[],
): PlayerCommandResult {
  const destinationCode = readComponent(state.map.runtime.game, terminal, "TerminalDestination")?.destination;
  if (destinationCode === undefined) throw new Error(`Uplink terminal ${terminal} is missing a map destination.`);
  const goto = terminalDestinationForCode(destinationCode);
  return goto === VICTORY_GOTO ? commitVictory(state, events) : commitMapChange(state, goto, events);
}

function commitVictory(state: CommandResolutionState, events: readonly GameEvent[]): PlayerCommandResult {
  const completion = completeCurrentLevel(state.progression, state.map, events);
  return { type: "outcome", events: completion.events, outcome: "victory", levelStats: completion.stats };
}

function commitMapChange(
  state: CommandResolutionState,
  goto: string,
  events: readonly GameEvent[],
): PlayerCommandResult {
  const completion = completeCurrentLevel(state.progression, state.map, events);
  return { type: "mapChange", events: completion.events, mapChange: { goto }, levelStats: completion.stats };
}

function entityPositionSnapshot(map: MapSessionState): EntityPositionSnapshot {
  const positions = new Map<Entity, GridPoint>();
  for (const entity of map.runtime.crawler.entities()) {
    positions.set(entity, map.runtime.crawler.entityPosition(entity));
  }
  return positions;
}

function enemySoundSnapshot(state: CommandResolutionState): ReadonlyMap<Entity, EnemySoundProfile> {
  const sounds = new Map<Entity, EnemySoundProfile>();
  forEachEnemyIdleSoundSource(state.outputs, (source) => {
    const archetype = enemyArchetypeFor(state.map.runtime.game, source.entity);
    if (archetype !== undefined) sounds.set(source.entity, enemyCatalogEntry(archetype).sounds);
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
