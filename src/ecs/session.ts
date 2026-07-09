import {
  DialogueTreeRef,
  DisplayNameComponent,
  ExamineTextRef,
  Facing,
  type FacingSchema,
  GridPos,
  type GridPosSchema,
  OnTalkEvent,
  StoryTarget,
  TerminalDestination,
} from "@/src/ecs/components.ts";
import {
  createDrawableRenderScratch,
  createLightEntityScratch,
  type DrawableEntityVisitor,
  drawableSystem,
  type LightEntityVisitor,
  lightSystem,
} from "@/src/ecs/drawables.ts";
import { createPlayer } from "@/src/ecs/prefabs.ts";
import {
  applyCheatPlayerLoadout,
  capturePlayerProgressionCheckpoint,
  clearTransientPlayerState,
  completePlayerLevel,
  type PlayerProgressionCheckpoint,
  playerStatusSnapshotFor,
  playerStoryFlags,
  resetPlayerProgression,
  restorePlayerProgressionCheckpoint,
  selectedPlayerWeapon,
} from "@/src/ecs/progression.ts";
import { mapScopedQuery, positionedQuery } from "@/src/ecs/queries.ts";
import {
  playerSpawnFor,
  rebuildRuntimeState,
  refreshVisibility,
  replaceMapContent,
  spawnMapScopedEntities,
} from "@/src/ecs/session/lifecycle.ts";
import {
  actorPositionSnapshot,
  advanceAnimations,
  applyEventAnimations,
  applyWalkAnimations,
  setAnimation,
  writeDefeatEffect,
} from "@/src/ecs/session/sprite_animations.ts";
import { applyEvent, assertUniqueTargets, queueTalkEvent } from "@/src/ecs/session/story_actions.ts";
import {
  createEnemyIdleSoundSourceScratch,
  createSoundEmitterScratch,
  enemyIdleSoundSourceSystem,
  type EnemyIdleSoundSourceVisitor,
  soundEmitterSystem,
  type SoundEmitterVisitor,
} from "@/src/ecs/sounds.ts";
import type { SpatialIndex } from "@/src/ecs/spatial.ts";
import type { TurnContext } from "@/src/ecs/turn/actions.ts";
import { targetMarkerTone } from "@/src/ecs/turn/player.ts";
import { runTurnTransaction, type TurnTransactionResult } from "@/src/ecs/turn/transaction.ts";
import { createWorld } from "@/src/ecs/world.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import type { SoundCue } from "@/src/game/sound.ts";
import { soundCuesForEvents } from "@/src/game/sound_cues.ts";
import type { PlayerStatusSnapshot, TargetMarkerTone } from "@/src/game/state.ts";
import type { StoryEventId, StoryFlag } from "@/src/game/story.ts";
import type { TileVisibility, VisibilityMap } from "@/src/game/visibility.ts";
import { playerWeaponSpec } from "@/src/game/weapons.ts";
import { normalizeDirection } from "@/src/grid/direction.ts";
import { type GameMap, VICTORY_GOTO } from "@/src/map/map.ts";
import { terminalDestinationForCode } from "@/src/map/maps.ts";
import type { Entity, World } from "@phughesmcr/miski";

const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = Object.freeze({
  type: "continue",
  events: [],
});

/** Binds a render/audio system to its reused scratch, yielding a ready-to-call `forEach`. */
function boundScratchSystem<Scratch, Visitor>(
  system: (context: { readonly scratch: Scratch; readonly visit: Visitor }) => void,
  scratch: Scratch,
): (visit: Visitor) => void {
  return (visit: Visitor): void => system({ scratch, visit });
}

type EntityPositionSnapshot = ReadonlyMap<Entity, { readonly x: number; readonly y: number }>;
export type GameSessionTickResult = {
  readonly needsFrame: boolean;
};

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
};

export async function createGameSession(
  map: GameMap,
  random: RandomSource,
  options: GameSessionOptions = {},
): Promise<GameSession> {
  const world = await createWorld();

  try {
    const playerEntity = createPlayer(world, playerSpawnFor(map));
    if (options.cheat) {
      applyCheatPlayerLoadout(world, playerEntity);
    }
    spawnMapScopedEntities(world, map);

    world.refresh();
    assertUniqueTargets(world);

    return new GameSession(world, playerEntity, map, random, options);
  } catch (error) {
    await world.destroy();
    throw error;
  }
}

export class GameSession implements Disposable {
  private readonly world: World;
  private readonly playerEntity: Entity;
  private currentMap: GameMap;
  private readonly random: RandomSource;
  private readonly cheat: boolean;
  readonly forEachDrawable: (visit: DrawableEntityVisitor) => void;
  readonly forEachLight: (visit: LightEntityVisitor) => void;
  readonly forEachSoundEmitter: (visit: SoundEmitterVisitor) => void;
  readonly forEachEnemyIdleSoundSource: (visit: EnemyIdleSoundSourceVisitor) => void;
  private spatial: SpatialIndex;
  private visibility: VisibilityMap;
  private levelEntryCheckpoint: PlayerProgressionCheckpoint;
  private pendingDialogueStoryEvent?: StoryEventId;
  private disposed = false;

  constructor(
    world: World,
    playerEntity: Entity,
    map: GameMap,
    random: RandomSource,
    options: GameSessionOptions = {},
  ) {
    this.world = world;
    this.playerEntity = playerEntity;
    this.currentMap = map;
    this.random = random;
    this.cheat = options.cheat === true;
    this.forEachDrawable = boundScratchSystem(world.systems.create(drawableSystem), createDrawableRenderScratch());
    this.forEachLight = boundScratchSystem(world.systems.create(lightSystem), createLightEntityScratch());
    this.forEachSoundEmitter = boundScratchSystem(
      world.systems.create(soundEmitterSystem),
      createSoundEmitterScratch(),
    );
    this.forEachEnemyIdleSoundSource = boundScratchSystem(
      world.systems.create(enemyIdleSoundSourceSystem),
      createEnemyIdleSoundSourceScratch(),
    );
    const runtimeState = rebuildRuntimeState(world, playerEntity, map);
    this.spatial = runtimeState.spatial;
    this.visibility = runtimeState.visibility;
    this.levelEntryCheckpoint = capturePlayerProgressionCheckpoint(this.world, this.playerEntity);
  }

  getPlayerStatus(): PlayerStatusSnapshot {
    return playerStatusSnapshotFor(this.world, this.playerEntity);
  }

  getMap(): GameMap {
    return this.currentMap;
  }

  getPlayerEntity(): Entity {
    return this.playerEntity;
  }

  getStoryFlags(): readonly StoryFlag[] {
    return playerStoryFlags(this.world, this.playerEntity);
  }

  getMapScopedMetadata(): readonly MapScopedMetadataSnapshot[] {
    const metadata: MapScopedMetadataSnapshot[] = [];
    for (const entity of this.world.entities.query(mapScopedQuery)) {
      const displayName = this.world.components.readEntityData(DisplayNameComponent, entity)?.displayName;
      const dialogueTreeId = this.world.components.readEntityData(DialogueTreeRef, entity)?.dialogueTreeId;
      const examineTextId = this.world.components.readEntityData(ExamineTextRef, entity)?.examineTextId;
      const storyId = this.world.components.readEntityData(StoryTarget, entity)?.storyId;
      const onTalkEvent = this.world.components.readEntityData(OnTalkEvent, entity)?.onTalkEvent;
      const terminalDestination = this.world.components.readEntityData(TerminalDestination, entity)?.destination;
      const entry: MapScopedMetadataSnapshot = {
        ...(displayName === undefined ? {} : { displayName }),
        ...(dialogueTreeId === undefined ? {} : { dialogueTreeId }),
        ...(examineTextId === undefined ? {} : { examineTextId }),
        ...(storyId === undefined ? {} : { storyId }),
        ...(onTalkEvent === undefined ? {} : { onTalkEvent }),
        ...(terminalDestination === undefined ? {} : { terminalDestination }),
      };
      if (Object.keys(entry).length > 0) metadata.push(entry);
    }
    return metadata;
  }

  getPlayerPosition(): GridPosSchema {
    return this.world.components.getEntityData(GridPos, this.playerEntity);
  }

  getPlayerFacing(): FacingSchema {
    const facing = this.world.components.getEntityData(Facing, this.playerEntity);
    return { dir: normalizeDirection(facing.dir) };
  }

  targetMarkerTone(): TargetMarkerTone | undefined {
    return this.spatial.withFreshOccupancy(() => targetMarkerTone(this.turnContext()));
  }

  getVisibility(): TileVisibility {
    return this.visibility;
  }

  loadMap(map: GameMap): void {
    this.pendingDialogueStoryEvent = undefined;
    this.currentMap = map;
    this.replaceMapContent(map);
    this.levelEntryCheckpoint = capturePlayerProgressionCheckpoint(this.world, this.playerEntity);
  }

  retryMap(map: GameMap): void {
    restorePlayerProgressionCheckpoint(this.world, this.playerEntity, this.levelEntryCheckpoint);
    this.pendingDialogueStoryEvent = undefined;
    this.currentMap = map;
    this.replaceMapContent(map);
  }

  resetRun(map: GameMap): void {
    resetPlayerProgression(this.world, this.playerEntity);
    if (this.cheat) {
      applyCheatPlayerLoadout(this.world, this.playerEntity);
    }
    this.pendingDialogueStoryEvent = undefined;
    this.currentMap = map;
    this.replaceMapContent(map);
    this.levelEntryCheckpoint = capturePlayerProgressionCheckpoint(this.world, this.playerEntity);
  }

  tick(nowMs: number): GameSessionTickResult {
    return { needsFrame: advanceAnimations(this.world, nowMs) };
  }

  handlePlayerCommand(command: PlayerCommand): PlayerCommandResult {
    const positionsBefore = this.entityPositionSnapshot();
    const playerPositionBefore = this.getPlayerPosition();
    const playerWeaponSlot = selectedPlayerWeapon(this.world, this.playerEntity);
    const playerWeapon = playerWeaponSpec(playerWeaponSlot);
    const actorPositions = actorPositionSnapshot(this.world);
    const transaction = runTurnTransaction(this.turnContext(), command);
    const dialogueTarget = transaction.dialogue?.target;
    const result = this.commitTurnTransaction(transaction, actorPositions);
    const playerPositionAfter = this.getPlayerPosition();
    const blockedMove = command.type === "move" &&
      samePosition(playerPositionBefore, playerPositionAfter) &&
      result.events.length === 0;
    const soundCues = soundCuesForEvents(result.events, {
      playerEntity: this.playerEntity,
      playerPosition: playerPositionAfter,
      positionsBefore,
      positionsAfter: this.entityPositionSnapshot(),
      blockedMove,
      dialogueTarget,
      playerWeaponSlot,
      playerWeaponRadius: playerWeapon.noiseRadius,
    });
    return withSoundCues(result, soundCues);
  }

  closeDialogue(): void {
    const event = this.pendingDialogueStoryEvent;
    this.pendingDialogueStoryEvent = undefined;
    if (event !== undefined) this.applyStoryEvent(event);
  }

  private replaceMapContent(map: GameMap): void {
    const runtimeState = replaceMapContent(this.world, this.playerEntity, map);
    this.spatial = runtimeState.spatial;
    this.visibility = runtimeState.visibility;
  }

  private turnContext(): TurnContext {
    return {
      world: this.world,
      player: this.playerEntity,
      spatial: this.spatial,
      random: this.random,
      writeDefeatEffect: (effect) => writeDefeatEffect(this.world, effect),
    };
  }

  private queueTalkStoryEvent(target: Entity | undefined): void {
    const event = queueTalkEvent(this.world, this.playerEntity, target);
    if (event !== undefined) this.pendingDialogueStoryEvent = event;
  }

  private applyStoryEvent(event: StoryEventId): void {
    const applied = applyEvent(
      this.world,
      this.playerEntity,
      this.spatial,
      event,
      performance.now(),
      (entity, animation) => setAnimation(this.world, entity, animation),
    );
    if (applied) this.refreshVisibility();
  }

  private commitUplinkTerminalActivation(terminal: Entity, events: readonly GameEvent[]): PlayerCommandResult {
    const destinationCode = this.world.components.readEntityData(TerminalDestination, terminal)?.destination;
    if (destinationCode === undefined) {
      throw new Error(`Uplink terminal ${terminal} is missing a map destination.`);
    }
    const goto = terminalDestinationForCode(destinationCode);

    const levelCompleteEvents = completePlayerLevel(this.world, this.playerEntity, events);
    clearTransientPlayerState(this.world, this.playerEntity);
    this.world.refresh();
    if (goto === VICTORY_GOTO) {
      return { type: "outcome", events: levelCompleteEvents, outcome: "victory" };
    }
    return {
      type: "mapChange",
      events: levelCompleteEvents,
      mapChange: { goto },
    };
  }

  private commitTurnTransaction(
    transaction: TurnTransactionResult,
    actorPositions: ReturnType<typeof actorPositionSnapshot>,
  ): PlayerCommandResult {
    if (transaction.dialogue !== undefined) {
      this.queueTalkStoryEvent(transaction.dialogue.target);
      return {
        type: "dialogue",
        events: transaction.events,
        dialogue: transaction.dialogue.dialogue,
      };
    }

    if (transaction.terminal !== undefined) {
      return this.commitUplinkTerminalActivation(transaction.terminal, transaction.events);
    }

    if (transaction.cost === "turn") {
      const nowMs = performance.now();
      applyWalkAnimations(this.world, actorPositions, nowMs);
      applyEventAnimations(this.world, this.playerEntity, transaction.events, nowMs);
      this.world.refresh();
      advanceAnimations(this.world, nowMs);
    }

    if (transaction.refreshVisibility) this.refreshVisibility();
    if (transaction.outcome === "defeat") {
      return { type: "outcome", events: transaction.events, outcome: "defeat" };
    }
    return this.playerCommandResult(transaction.events);
  }

  private entityPositionSnapshot(): EntityPositionSnapshot {
    const positions = new Map<Entity, { readonly x: number; readonly y: number }>();
    for (const entity of this.world.entities.query(positionedQuery)) {
      const position = this.world.components.readEntityData(GridPos, entity);
      if (position !== undefined) positions.set(entity, { x: position.x, y: position.y });
    }
    return positions;
  }

  private refreshVisibility(): void {
    refreshVisibility(this.world, this.playerEntity, this.spatial, this.visibility);
  }

  private playerCommandResult(events: readonly GameEvent[]): PlayerCommandResult {
    return events.length === 0 ? UNCHANGED_PLAYER_COMMAND : { type: "continue", events };
  }

  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.world.destroy();
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
      return { type: "mapChange", events: result.events, mapChange: result.mapChange, soundCues };
    case "outcome":
      return { type: "outcome", events: result.events, outcome: result.outcome, soundCues };
  }
}

function samePosition(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
): boolean {
  return a.x === b.x && a.y === b.y;
}
