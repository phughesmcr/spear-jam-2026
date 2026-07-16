import type { RandomSource } from "@/src/engine/random.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/model/commands.ts";
import type { EnemyIdleSoundSourceVisitor, SoundEmitterVisitor } from "@/src/game/model/sound.ts";
import type { DrawableEntityVisitor, LightEntityVisitor } from "@/src/game/model/render_snapshot.ts";
import type { PlayerStatusSnapshot } from "@/src/game/model/state.ts";
import type { StoryFlag } from "@/src/game/content/story.ts";
import {
  closeDialogue as closeResolvedDialogue,
  type CommandResolutionState,
  createCommandResolution,
  handlePlayerCommand as resolvePlayerCommand,
  tickCommandResolution,
} from "@/src/game/simulation/session/command_resolution.ts";
import { createMapSessionState, type MapSessionState } from "@/src/game/simulation/session/map_lifecycle.ts";
import {
  createOutputReaders,
  forEachDrawable,
  forEachEnemyIdleSoundSource,
  forEachLight,
  forEachSoundEmitter,
  mapScopedMetadata,
  type MapScopedMetadataSnapshot,
  type OutputReaderState,
  playerFacing,
  playerPosition,
  replaceOutputMap,
} from "@/src/game/simulation/session/output_readers.ts";
import {
  applyInitialCheatLoadout,
  checkpointForMapLoad,
  checkpointForRetry,
  createProgressionStatistics,
  playerStatus,
  type ProgressionStatisticsState,
  startLevelStatistics,
  storyFlags,
} from "@/src/game/simulation/session/progression_statistics.ts";
import type { CardinalDirection, GridPoint } from "@/src/game/world/direction.ts";
import type { GameMap } from "@/src/game/world/map.ts";
import type { TileVisibility } from "@/src/game/world/visibility.ts";
import type { Entity } from "turn-based-engine/ecs";
import type { GameSessionContent } from "@/src/game/simulation/content.ts";

export type GameSessionTickResult = { readonly needsFrame: boolean };
export type GameSessionOptions = {
  readonly cheat?: boolean;
  readonly now?: () => number;
};

export function createGameSession(
  map: GameMap,
  random: RandomSource,
  content: GameSessionContent,
  options: GameSessionOptions = {},
): GameSession {
  return new GameSession(map, random, content, options);
}

export class GameSession {
  private mapState: MapSessionState;
  private progression: ProgressionStatisticsState;
  private readonly outputs: OutputReaderState;
  private commands: CommandResolutionState;
  private readonly content: GameSessionContent;

  constructor(map: GameMap, random: RandomSource, content: GameSessionContent, options: GameSessionOptions = {}) {
    this.content = content;
    const now = options.now ?? currentTimeMs;
    this.mapState = createMapSessionState(map, content);
    if (options.cheat === true) applyInitialCheatLoadout(this.mapState);
    this.progression = createProgressionStatistics(this.mapState, now);
    this.outputs = createOutputReaders(this.mapState);
    this.commands = createCommandResolution(this.mapState, this.progression, this.outputs, random, now);
    startLevelStatistics(this.progression, this.mapState);
  }

  getPlayerStatus(): PlayerStatusSnapshot {
    return playerStatus(this.mapState);
  }

  getMap(): GameMap {
    return this.mapState.map;
  }

  getPlayerEntity(): Entity {
    return this.mapState.player;
  }

  getStoryFlags(): readonly StoryFlag[] {
    return storyFlags(this.mapState);
  }

  getMapScopedMetadata(): readonly MapScopedMetadataSnapshot[] {
    return mapScopedMetadata(this.outputs);
  }

  getPlayerPosition(): GridPoint {
    return playerPosition(this.outputs);
  }

  getPlayerFacing(): { readonly dir: CardinalDirection } {
    return playerFacing(this.outputs);
  }

  getVisibility(): TileVisibility {
    return this.outputs.visibility;
  }

  forEachDrawable(visit: DrawableEntityVisitor): void {
    forEachDrawable(this.outputs, visit);
  }

  forEachLight(visit: LightEntityVisitor): void {
    forEachLight(this.outputs, visit);
  }

  forEachSoundEmitter(visit: SoundEmitterVisitor): void {
    forEachSoundEmitter(this.outputs, visit);
  }

  forEachEnemyIdleSoundSource(visit: EnemyIdleSoundSourceVisitor): void {
    forEachEnemyIdleSoundSource(this.outputs, visit);
  }

  loadMap(map: GameMap): void {
    this.replaceMap(map, checkpointForMapLoad(this.mapState));
  }

  retryMap(map: GameMap): void {
    const checkpoint = checkpointForRetry(this.progression);
    this.replaceMap(map, checkpoint, checkpoint);
  }

  tick(nowMs: number): GameSessionTickResult {
    return { needsFrame: tickCommandResolution(this.commands, nowMs) };
  }

  handlePlayerCommand(command: PlayerCommand): PlayerCommandResult {
    return resolvePlayerCommand(this.commands, command);
  }

  closeDialogue(): void {
    closeResolvedDialogue(this.commands);
  }

  private replaceMap(
    map: GameMap,
    checkpoint: ReturnType<typeof checkpointForMapLoad>,
    levelEntryCheckpoint?: ReturnType<typeof checkpointForRetry>,
  ): void {
    const nextMapState = createMapSessionState(map, this.content, checkpoint);
    const nextProgression = createProgressionStatistics(
      nextMapState,
      this.progression.now,
      levelEntryCheckpoint,
    );
    const nextCommands = createCommandResolution(
      nextMapState,
      nextProgression,
      this.outputs,
      this.commands.random,
      this.commands.now,
    );
    startLevelStatistics(nextProgression, nextMapState);
    replaceOutputMap(this.outputs, nextMapState);
    this.mapState = nextMapState;
    this.progression = nextProgression;
    this.commands = nextCommands;
  }
}

function currentTimeMs(): number {
  return performance.now();
}
