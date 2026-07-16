import type { PlayerCommand, PlayerCommandResult } from "@/src/game/model/commands.ts";
import type { LevelStats } from "@/src/game/model/level_stats.ts";
import type { PlayerStatusSnapshot } from "@/src/game/model/state.ts";
import type { GameEvent } from "@/src/game/model/events.ts";
import type { StoryFlag } from "@/src/game/content/story.ts";
import {
  applyCheatPlayerLoadout,
  capturePlayerProgressionCheckpoint,
  type PlayerProgressionCheckpoint,
  playerStatusSnapshotFor,
  playerStoryFlags,
} from "@/src/game/simulation/progression.ts";
import type { MapSessionState } from "@/src/game/simulation/session/map_lifecycle.ts";
import { type GridPoint, samePoint } from "turn-based-engine/crawler";

export type ProgressionStatisticsState = {
  readonly now: () => number;
  readonly levelEntryCheckpoint: PlayerProgressionCheckpoint;
  levelStartedAtMs: number;
  levelMoves: number;
  monstersKilled: number;
  totalMonsters: number;
};

export function applyInitialCheatLoadout(map: MapSessionState): void {
  map.runtime.simulation.mutateAtomically(({ mutation }) => applyCheatPlayerLoadout(mutation, map.player));
}

export function createProgressionStatistics(
  map: MapSessionState,
  now: () => number,
  levelEntryCheckpoint = capturePlayerProgressionCheckpoint(map.runtime.simulation.ecs, map.player),
): ProgressionStatisticsState {
  return {
    now,
    levelEntryCheckpoint,
    levelStartedAtMs: 0,
    levelMoves: 0,
    monstersKilled: 0,
    totalMonsters: 0,
  };
}

export function startLevelStatistics(state: ProgressionStatisticsState, map: MapSessionState): void {
  state.levelStartedAtMs = state.now();
  state.levelMoves = 0;
  state.monstersKilled = 0;
  state.totalMonsters = map.runtime.simulation.ecs.query(map.runtime.simulation.ecs.components.Enemy).count();
}

export function checkpointForMapLoad(map: MapSessionState): PlayerProgressionCheckpoint {
  return capturePlayerProgressionCheckpoint(map.runtime.simulation.ecs, map.player);
}

export function checkpointForRetry(state: ProgressionStatisticsState): PlayerProgressionCheckpoint {
  return state.levelEntryCheckpoint;
}

export function playerStatus(map: MapSessionState): PlayerStatusSnapshot {
  return playerStatusSnapshotFor(map.runtime.simulation.ecs, map.player);
}

export function storyFlags(map: MapSessionState): readonly StoryFlag[] {
  return playerStoryFlags(map.runtime.simulation.ecs, map.player);
}

export function recordCommandStatistics(
  state: ProgressionStatisticsState,
  map: MapSessionState,
  command: PlayerCommand,
  result: PlayerCommandResult,
  playerPositionBefore: GridPoint,
  playerPositionAfter: GridPoint,
): void {
  if (command.type === "move" && !samePoint(playerPositionBefore, playerPositionAfter)) state.levelMoves++;
  state.monstersKilled +=
    result.events.filter((event) =>
      event.type === "entityDefeated" && event.actor === map.player && event.entity !== map.player
    ).length;
}

export function completeCurrentLevel(
  state: ProgressionStatisticsState,
  events: readonly GameEvent[],
): { readonly events: readonly GameEvent[]; readonly stats: LevelStats } {
  return { events, stats: levelStatistics(state) };
}

function levelStatistics(state: ProgressionStatisticsState): LevelStats {
  return {
    elapsedMs: Math.max(0, state.now() - state.levelStartedAtMs),
    moves: state.levelMoves,
    monstersKilled: state.monstersKilled,
    totalMonsters: state.totalMonsters,
  };
}
