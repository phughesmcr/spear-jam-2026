import { enemyArchetypeFor, readComponent } from "@/src/game/simulation/components.ts";
import {
  createDrawableReaders,
  type DrawableEntityVisitor,
  type LightEntityVisitor,
  type RuntimeReaders,
} from "@/src/game/simulation/drawables.ts";
import { createPlayer } from "@/src/game/simulation/prefabs.ts";
import {
  applyCheatPlayerLoadout,
  capturePlayerProgressionCheckpoint,
  clearTransientPlayerState,
  completePlayerLevel,
  type PlayerProgressionCheckpoint,
  playerStatusSnapshotFor,
  playerStoryFlags,
  restorePlayerProgressionCheckpoint,
  selectedPlayerWeapon,
} from "@/src/game/simulation/progression.ts";
import { createRuntime, type GameRuntime } from "@/src/game/simulation/runtime.ts";
import { playerSpawnFor, spawnMapEntities } from "@/src/game/simulation/session/lifecycle.ts";
import {
  type AnimationController,
  createAnimationController,
} from "@/src/game/simulation/session/sprite_animations.ts";
import { applyEvent, queueTalkEvent } from "@/src/game/simulation/session/story_actions.ts";
import {
  createSoundReaders,
  type EnemyIdleSoundSourceVisitor,
  type SoundEmitterVisitor,
  type SoundReaders,
} from "@/src/game/simulation/sounds.ts";
import type { TurnContext } from "@/src/game/simulation/turn/actions.ts";
import { runTurnTransaction, type TurnTransactionResult } from "@/src/game/simulation/turn/transaction.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/model/commands.ts";
import type { GameEvent } from "@/src/game/model/events.ts";
import type { LevelStats } from "@/src/game/model/level_stats.ts";
import type { RandomSource } from "@/src/engine/random.ts";
import type { SoundCue } from "@/src/game/model/sound.ts";
import { soundCuesForEvents } from "@/src/game/simulation/sound_cues.ts";
import type { PlayerStatusSnapshot } from "@/src/game/model/state.ts";
import type { StoryEventId, StoryFlag } from "@/src/game/content/story.ts";
import type { TileVisibility } from "@/src/game/world/visibility.ts";
import { playerWeaponSpec } from "@/src/game/content/weapons.ts";
import type { CardinalDirection, GridPoint } from "@/src/game/world/direction.ts";
import { type GameMap, VICTORY_GOTO } from "@/src/game/world/map.ts";
import { terminalDestinationForCode } from "@/src/game/world/campaign.ts";
import { enemyCatalogEntry, type EnemySoundProfile } from "@/src/game/content/enemies.ts";
import type { Entity } from "turn-based-engine/ecs";

const PLAYER_STABLE_ID = 1;
const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = Object.freeze({ type: "continue", events: [] });
type EntityPositionSnapshot = ReadonlyMap<Entity, GridPoint>;
export type GameSessionTickResult = { readonly needsFrame: boolean };
export type MapScopedMetadataSnapshot = Partial<{
  readonly displayName: number;
  readonly dialogueTreeId: number;
  readonly examineTextId: number;
  readonly storyId: number;
  readonly onTalkEvent: number;
  readonly terminalDestination: number;
}>;
export type GameSessionOptions = {
  readonly cheat?: boolean;
  readonly now?: () => number;
};

export function createGameSession(
  map: GameMap,
  random: RandomSource,
  options: GameSessionOptions = {},
): Promise<GameSession> {
  return Promise.try(() => new GameSession(map, random, options));
}

export class GameSession implements Disposable {
  private runtime: GameRuntime;
  private playerEntity: Entity;
  private currentMap: GameMap;
  private readonly random: RandomSource;
  private readonly cheat: boolean;
  private readonly now: () => number;
  private readers: RuntimeReaders;
  private soundReaders: SoundReaders;
  private animations: AnimationController;
  private levelEntryCheckpoint: PlayerProgressionCheckpoint;
  private pendingDialogueStoryEvent?: StoryEventId;
  private levelStartedAtMs = 0;
  private levelMoves = 0;
  private monstersKilled = 0;
  private totalMonsters = 0;
  private disposed = false;
  private readonly visibility: TileVisibility;

  constructor(map: GameMap, random: RandomSource, options: GameSessionOptions = {}) {
    this.currentMap = map;
    this.random = random;
    this.cheat = options.cheat === true;
    this.now = options.now ?? currentTimeMs;
    const state = createMapRuntime(map);
    this.runtime = state.runtime;
    this.playerEntity = state.player;
    if (this.cheat) applyCheatPlayerLoadout(this.runtime.game, this.playerEntity);
    this.readers = createDrawableReaders(this.runtime);
    this.soundReaders = createSoundReaders(this.runtime);
    this.animations = createAnimationController(this.runtime);
    this.resetLevelStats();
    this.levelEntryCheckpoint = capturePlayerProgressionCheckpoint(this.runtime.game, this.playerEntity);
    this.visibility = {
      isVisible: (x, y) => this.runtime.crawler.isVisibleTo(this.playerEntity, x, y),
      isExplored: (x, y) => this.runtime.crawler.isDiscoveredBy(this.playerEntity, x, y),
    };
  }

  getPlayerStatus(): PlayerStatusSnapshot {
    return playerStatusSnapshotFor(this.runtime.game, this.playerEntity);
  }

  getMap(): GameMap {
    return this.currentMap;
  }

  getPlayerEntity(): Entity {
    return this.playerEntity;
  }

  getStoryFlags(): readonly StoryFlag[] {
    return playerStoryFlags(this.runtime.game, this.playerEntity);
  }

  getMapScopedMetadata(): readonly MapScopedMetadataSnapshot[] {
    const metadata: MapScopedMetadataSnapshot[] = [];
    for (const entity of this.runtime.crawler.entities()) {
      if (entity === this.playerEntity) continue;
      const entry: MapScopedMetadataSnapshot = {};
      copyMetadata(this.runtime, entity, entry);
      if (Object.keys(entry).length > 0) metadata.push(entry);
    }
    return metadata;
  }

  getPlayerPosition(): GridPoint {
    return this.runtime.crawler.entityPosition(this.playerEntity);
  }

  getPlayerFacing(): { readonly dir: CardinalDirection } {
    const direction = this.runtime.crawler.entityFacing(this.playerEntity);
    if (direction === undefined) throw new Error("Player is missing a facing direction.");
    return { dir: direction };
  }

  getVisibility(): TileVisibility {
    return this.visibility;
  }

  forEachDrawable(visit: DrawableEntityVisitor): void {
    this.readers.forEachDrawable(visit);
  }

  forEachLight(visit: LightEntityVisitor): void {
    this.readers.forEachLight(visit);
  }

  forEachSoundEmitter(visit: SoundEmitterVisitor): void {
    this.soundReaders.forEachSoundEmitter(visit);
  }

  forEachEnemyIdleSoundSource(visit: EnemyIdleSoundSourceVisitor): void {
    this.soundReaders.forEachEnemyIdleSoundSource(visit);
  }

  loadMap(map: GameMap): void {
    const checkpoint = capturePlayerProgressionCheckpoint(this.runtime.game, this.playerEntity);
    this.replaceRuntime(map, checkpoint);
    this.levelEntryCheckpoint = capturePlayerProgressionCheckpoint(this.runtime.game, this.playerEntity);
  }

  retryMap(map: GameMap): void {
    this.replaceRuntime(map, this.levelEntryCheckpoint);
  }

  tick(nowMs: number): GameSessionTickResult {
    return { needsFrame: this.animations.advance(nowMs) };
  }

  handlePlayerCommand(command: PlayerCommand): PlayerCommandResult {
    const positionsBefore = this.entityPositionSnapshot();
    const enemySounds = this.enemySoundSnapshot();
    const playerPositionBefore = this.getPlayerPosition();
    const playerWeaponSlot = selectedPlayerWeapon(this.runtime.game, this.playerEntity);
    const actorPositions = this.animations.actorPositions();
    const transaction = runTurnTransaction(this.turnContext(), command);
    const dialogueTarget = transaction.dialogue?.target;
    const result = this.commitTurnTransaction(transaction, actorPositions);
    const playerPositionAfter = this.getPlayerPosition();
    if (command.type === "move" && !samePosition(playerPositionBefore, playerPositionAfter)) this.levelMoves++;
    this.monstersKilled +=
      result.events.filter((event) =>
        event.type === "entityDefeated" && event.actor === this.playerEntity && event.entity !== this.playerEntity
      ).length;
    const soundCues = soundCuesForEvents(result.events, {
      playerEntity: this.playerEntity,
      playerPosition: playerPositionAfter,
      positionsBefore,
      positionsAfter: this.entityPositionSnapshot(),
      enemySounds,
      blockedMove: command.type === "move" && samePosition(playerPositionBefore, playerPositionAfter) &&
        result.events.length === 0,
      dialogueTarget,
      playerWeaponSlot,
      playerWeaponRadius: playerWeaponSpec(playerWeaponSlot).noiseRadius,
    });
    return withSoundCues(result, soundCues);
  }

  closeDialogue(): void {
    const event = this.pendingDialogueStoryEvent;
    this.pendingDialogueStoryEvent = undefined;
    if (event !== undefined) {
      applyEvent(this.runtime, this.playerEntity, event, performance.now());
    }
  }

  private replaceRuntime(map: GameMap, checkpoint?: PlayerProgressionCheckpoint): void {
    this.pendingDialogueStoryEvent = undefined;
    this.currentMap = map;
    const state = createMapRuntime(map, checkpoint);
    this.runtime = state.runtime;
    this.playerEntity = state.player;
    this.readers = createDrawableReaders(this.runtime);
    this.soundReaders = createSoundReaders(this.runtime);
    this.animations = createAnimationController(this.runtime);
    this.resetLevelStats();
  }

  private turnContext(): TurnContext {
    return {
      runtime: this.runtime,
      player: this.playerEntity,
      random: this.random,
      writeDefeatEffect: this.animations.writeDefeatEffect,
    };
  }

  private commitUplinkTerminalActivation(terminal: Entity, events: readonly GameEvent[]): PlayerCommandResult {
    const destinationCode = readComponent(this.runtime.game, terminal, "TerminalDestination")?.destination;
    if (destinationCode === undefined) throw new Error(`Uplink terminal ${terminal} is missing a map destination.`);
    const goto = terminalDestinationForCode(destinationCode);
    return goto === VICTORY_GOTO ? this.commitVictory(events) : this.commitMapChange(goto, events);
  }

  private commitVictory(events: readonly GameEvent[]): PlayerCommandResult {
    const levelCompleteEvents = completePlayerLevel(this.runtime.game, this.playerEntity, events);
    clearTransientPlayerState(this.runtime.game, this.playerEntity);
    return { type: "outcome", events: levelCompleteEvents, outcome: "victory", levelStats: this.levelStats() };
  }

  private commitMapChange(goto: string, events: readonly GameEvent[]): PlayerCommandResult {
    const levelCompleteEvents = completePlayerLevel(this.runtime.game, this.playerEntity, events);
    clearTransientPlayerState(this.runtime.game, this.playerEntity);
    return { type: "mapChange", events: levelCompleteEvents, mapChange: { goto }, levelStats: this.levelStats() };
  }

  private commitTurnTransaction(
    transaction: TurnTransactionResult,
    actorPositions: ReturnType<AnimationController["actorPositions"]>,
  ): PlayerCommandResult {
    if (transaction.dialogue !== undefined) {
      const event = queueTalkEvent(this.runtime, this.playerEntity, transaction.dialogue.target);
      if (event !== undefined) this.pendingDialogueStoryEvent = event;
      return { type: "dialogue", events: transaction.events, dialogue: transaction.dialogue.dialogue };
    }
    if (transaction.terminal !== undefined) {
      return this.commitUplinkTerminalActivation(transaction.terminal, transaction.events);
    }
    if (transaction.outcome === "victory") return this.commitVictory(transaction.events);
    if (transaction.cost === "turn") {
      const nowMs = performance.now();
      this.animations.applyWalks(actorPositions, nowMs);
      this.animations.applyEvents(this.playerEntity, transaction.events, nowMs);
      this.animations.advance(nowMs);
    }
    if (transaction.outcome === "defeat") return { type: "outcome", events: transaction.events, outcome: "defeat" };
    return transaction.events.length === 0 ?
      UNCHANGED_PLAYER_COMMAND :
      { type: "continue", events: transaction.events };
  }

  private entityPositionSnapshot(): EntityPositionSnapshot {
    const positions = new Map<Entity, GridPoint>();
    for (const entity of this.runtime.crawler.entities()) {
      positions.set(entity, this.runtime.crawler.entityPosition(entity));
    }
    return positions;
  }

  private enemySoundSnapshot(): ReadonlyMap<Entity, EnemySoundProfile> {
    const sounds = new Map<Entity, EnemySoundProfile>();
    this.forEachEnemyIdleSoundSource((source) => {
      const archetype = enemyArchetypeFor(this.runtime.game, source.entity);
      if (archetype !== undefined) sounds.set(source.entity, enemyCatalogEntry(archetype).sounds);
    });
    return sounds;
  }

  private resetLevelStats(): void {
    this.levelStartedAtMs = this.now();
    this.levelMoves = 0;
    this.monstersKilled = 0;
    this.totalMonsters = this.runtime.game.query(this.runtime.game.components.Enemy).count();
  }

  private levelStats(): LevelStats {
    return {
      elapsedMs: Math.max(0, this.now() - this.levelStartedAtMs),
      moves: this.levelMoves,
      monstersKilled: this.monstersKilled,
      totalMonsters: this.totalMonsters,
    };
  }

  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.disposed = true;
  }
}

function createMapRuntime(
  map: GameMap,
  checkpoint?: PlayerProgressionCheckpoint,
): { runtime: GameRuntime; player: Entity } {
  const runtime = createRuntime(map);
  const player = createPlayer(runtime, playerSpawnFor(map), PLAYER_STABLE_ID);
  if (checkpoint !== undefined) restorePlayerProgressionCheckpoint(runtime.game, player, checkpoint);
  spawnMapEntities(runtime, map);
  return { runtime, player };
}

function copyMetadata(runtime: GameRuntime, entity: Entity, target: MapScopedMetadataSnapshot): void {
  const game = runtime.game;
  const values = [
    ["displayName", "DisplayName", "displayName"],
    ["dialogueTreeId", "DialogueTreeRef", "dialogueTreeId"],
    ["examineTextId", "ExamineTextRef", "examineTextId"],
    ["storyId", "StoryTarget", "storyId"],
    ["onTalkEvent", "OnTalkEvent", "onTalkEvent"],
    ["terminalDestination", "TerminalDestination", "destination"],
  ] as const;
  for (const [targetKey, component, field] of values) {
    if (!game.entityHasComponent(entity, game.components[component])) continue;
    (target as Record<string, number>)[targetKey] = game.storage[component].get(entity, field as never);
  }
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

function currentTimeMs(): number {
  return performance.now();
}
