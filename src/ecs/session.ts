import type { Entity, World } from "@phughesmcr/miski";
import {
  DialogueTreeRef,
  DisplayNameComponent,
  ExamineTextRef,
  Facing,
  type FacingSchema,
  GridPos,
  type GridPosSchema,
  healthFor,
  OnTalkEvent,
  StoryTarget,
  TerminalDestination,
} from "@/src/ecs/components.ts";
import { normalizeDirection } from "@/src/grid/direction.ts";
import {
  createDrawableRenderScratch,
  createLightEntityScratch,
  type DrawableEntityVisitor,
  type DrawableSystem,
  drawableSystem,
  type LightEntityVisitor,
  type LightSystem,
  lightSystem,
} from "@/src/ecs/drawables.ts";
import { type EnemyTurnSystem, enemyTurnSystem } from "@/src/ecs/enemy.ts";
import { createPlayer } from "@/src/ecs/prefabs.ts";
import {
  type PlayerActionResolution,
  type PlayerTurnContext,
  type PlayerTurnSystem,
  playerTurnSystem,
  targetMarkerTone,
} from "@/src/ecs/player_turn.ts";
import { mapScopedQuery, positionedQuery } from "@/src/ecs/queries.ts";
import type { SpatialIndex } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { NoiseStimulus } from "@/src/game/perception.ts";
import {
  awardCreditsForDefeats,
  clearTransientPlayerState,
  completePlayerLevel,
  type PlayerProgressionCheckpoint,
  playerStatusSnapshotFor,
  resetPlayerProgression,
  selectedPlayerWeapon,
} from "@/src/ecs/progression.ts";
import type { PlayerStatusSnapshot } from "@/src/game/state.ts";
import {
  createEnemyIdleSoundSourceScratch,
  createSoundEmitterScratch,
  type EnemyIdleSoundSourceSystem,
  enemyIdleSoundSourceSystem,
  type EnemyIdleSoundSourceVisitor,
  type SoundEmitterSystem,
  soundEmitterSystem,
  type SoundEmitterVisitor,
} from "@/src/ecs/sounds.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import type { SoundCue } from "@/src/game/sound.ts";
import { soundCuesForEvents } from "@/src/game/sound_cues.ts";
import type { TargetMarkerTone } from "@/src/game/state.ts";
import { normalizeStoryFlags, type StoryEventId, type StoryFlag } from "@/src/game/story.ts";
import type { TileVisibility, VisibilityMap } from "@/src/game/visibility.ts";
import { playerWeaponSpec } from "@/src/game/weapons.ts";
import { type EntityDef, type GameMap, VICTORY_GOTO } from "@/src/map/map.ts";
import {
  actorPositionSnapshot,
  advanceAnimations,
  applyEventAnimations,
  applyWalkAnimations,
  setAnimation,
  writeDefeatEffect,
} from "@/src/ecs/session/sprite_animations.ts";
import {
  captureCheckpoint,
  playerSpawnFor,
  rebuildRuntimeState,
  refreshVisibility,
  replaceMapContent,
  restoreCheckpoint,
  spawnMapScopedEntities,
} from "@/src/ecs/session/lifecycle.ts";
import { applyEvent, assertUniqueTargets, queueTalkEvent } from "@/src/ecs/session/story_actions.ts";

const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = Object.freeze({
  type: "continue",
  events: [],
});
const DOOR_NOISE_RADIUS = 4;

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

export async function createGameSession(
  map: GameMap,
  random: RandomSource,
): Promise<GameSession> {
  const world = await createWorld();

  try {
    const playerEntity = createPlayer(world, playerSpawnFor(map));
    spawnMapScopedEntities(world, map);

    world.refresh();
    assertUniqueTargets(world);

    return new GameSession(world, playerEntity, map, random);
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
  private readonly drawableSystem: DrawableSystem;
  private readonly drawableScratch = createDrawableRenderScratch();
  private readonly lightSystem: LightSystem;
  private readonly lightScratch = createLightEntityScratch();
  private readonly soundEmitterSystem: SoundEmitterSystem;
  private readonly soundEmitterScratch = createSoundEmitterScratch();
  private readonly enemyIdleSoundSourceSystem: EnemyIdleSoundSourceSystem;
  private readonly enemyIdleSoundSourceScratch = createEnemyIdleSoundSourceScratch();
  private readonly playerTurnSystem: PlayerTurnSystem;
  private readonly enemyTurnSystem: EnemyTurnSystem;
  private spatial: SpatialIndex;
  private visibility: VisibilityMap;
  private readonly storyFlags: Set<StoryFlag>;
  private levelEntryCheckpoint: PlayerProgressionCheckpoint;
  private pendingDialogueStoryEvent?: StoryEventId;
  private disposed = false;

  constructor(
    world: World,
    playerEntity: Entity,
    map: GameMap,
    random: RandomSource,
  ) {
    this.world = world;
    this.playerEntity = playerEntity;
    this.currentMap = map;
    this.random = random;
    this.drawableSystem = world.systems.create(drawableSystem);
    this.lightSystem = world.systems.create(lightSystem);
    this.soundEmitterSystem = world.systems.create(soundEmitterSystem);
    this.enemyIdleSoundSourceSystem = world.systems.create(enemyIdleSoundSourceSystem);
    this.playerTurnSystem = world.systems.create(playerTurnSystem);
    this.enemyTurnSystem = world.systems.create(enemyTurnSystem);
    const runtimeState = rebuildRuntimeState(world, playerEntity, map);
    this.spatial = runtimeState.spatial;
    this.visibility = runtimeState.visibility;
    this.storyFlags = new Set();
    this.levelEntryCheckpoint = captureCheckpoint(this.world, this.playerEntity, this.storyFlags);
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
    return normalizeStoryFlags([...this.storyFlags]);
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
    return targetMarkerTone(this.playerTurnContext());
  }

  forEachDrawable(visit: DrawableEntityVisitor): void {
    this.drawableSystem({
      scratch: this.drawableScratch,
      visit,
    });
  }

  forEachLight(visit: LightEntityVisitor): void {
    this.lightSystem({
      scratch: this.lightScratch,
      visit,
    });
  }

  forEachSoundEmitter(visit: SoundEmitterVisitor): void {
    this.soundEmitterSystem({
      scratch: this.soundEmitterScratch,
      visit,
    });
  }

  forEachEnemyIdleSoundSource(visit: EnemyIdleSoundSourceVisitor): void {
    this.enemyIdleSoundSourceSystem({
      scratch: this.enemyIdleSoundSourceScratch,
      visit,
    });
  }

  getVisibility(): TileVisibility {
    return this.visibility;
  }

  loadMap(map: GameMap): void {
    this.pendingDialogueStoryEvent = undefined;
    this.currentMap = map;
    this.replaceMapContent(map);
    this.levelEntryCheckpoint = captureCheckpoint(this.world, this.playerEntity, this.storyFlags);
  }

  retryMap(map: GameMap): void {
    restoreCheckpoint(this.world, this.playerEntity, this.storyFlags, this.levelEntryCheckpoint);
    this.pendingDialogueStoryEvent = undefined;
    this.currentMap = map;
    this.replaceMapContent(map);
  }

  resetRun(map: GameMap): void {
    resetPlayerProgression(this.world, this.playerEntity);
    this.storyFlags.clear();
    this.pendingDialogueStoryEvent = undefined;
    this.currentMap = map;
    this.replaceMapContent(map);
    this.levelEntryCheckpoint = captureCheckpoint(this.world, this.playerEntity, this.storyFlags);
  }

  tick(nowMs: number): GameSessionTickResult {
    return { needsFrame: advanceAnimations(this.world, nowMs) };
  }

  handlePlayerCommand(command: PlayerCommand): PlayerCommandResult {
    const positionsBefore = this.entityPositionSnapshot();
    const playerPositionBefore = this.getPlayerPosition();
    const playerWeaponSlot = selectedPlayerWeapon(this.world, this.playerEntity);
    const playerWeapon = playerWeaponSpec(playerWeaponSlot);
    const action = this.playerTurnSystem({ ...this.playerTurnContext(), command });
    const dialogueTarget = action.type === "dialogue" ? action.target : undefined;
    const result = this.commitPlayerAction(action);
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

  private playerTurnContext(): PlayerTurnContext {
    return {
      world: this.world,
      player: this.playerEntity,
      spatial: this.spatial,
      random: this.random,
      writeDefeatEffect: (effect) => writeDefeatEffect(this.world, effect),
    };
  }

  private queueTalkStoryEvent(target: Entity | undefined): void {
    const event = queueTalkEvent(this.world, this.storyFlags, target);
    if (event !== undefined) this.pendingDialogueStoryEvent = event;
  }

  private applyStoryEvent(event: StoryEventId): void {
    const applied = applyEvent(
      this.world,
      this.spatial,
      this.storyFlags,
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
    const goto = this.destinationForTerminal(terminal);

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

  private destinationForTerminal(terminal: Entity): string {
    const position = this.world.components.readEntityData(GridPos, terminal);
    if (position === undefined) throw new Error(`Uplink terminal ${terminal} is missing a grid position.`);

    const terminalDef = this.currentMap.entities.find((
      entity,
    ): entity is Extract<EntityDef, { readonly prefab: "uplinkTerminal" }> =>
      entity.prefab === "uplinkTerminal" && entity.x === position.x && entity.y === position.y
    );
    if (terminalDef === undefined) {
      throw new Error(`Uplink terminal ${terminal} at (${position.x}, ${position.y}) has no authored destination.`);
    }
    return terminalDef.goto;
  }

  private commitPlayerAction(action: PlayerActionResolution): PlayerCommandResult {
    switch (action.type) {
      case "immediate":
        return this.playerCommandResult(action.events);
      case "refreshVisibility":
        this.refreshVisibility();
        return this.playerCommandResult(action.events);
      case "consumeTurn":
        return this.commitConsumedPlayerAction(action);
      case "dialogue":
        this.queueTalkStoryEvent(action.target);
        return {
          type: "dialogue",
          events: action.events,
          dialogue: action.dialogue,
        };
      case "uplinkTerminal":
        return this.commitUplinkTerminalActivation(action.terminal, action.events);
    }
  }

  private commitConsumedPlayerAction(
    action: Extract<PlayerActionResolution, { readonly type: "consumeTurn" }>,
  ): PlayerCommandResult {
    const actorPositions = actorPositionSnapshot(this.world);
    const actionEvents = this.applyPlayerActionReactions(action.events);
    const enemyEvents = this.enemyTurnSystem({
      world: this.world,
      player: this.playerEntity,
      spatial: this.spatial,
      random: this.random,
      blocksSight: (x, y) => this.spatial.tileBlocksSight(x, y),
      noises: this.noisesForPlayerAction(actionEvents, action.noise),
      writeDefeatEffect: (effect) => writeDefeatEffect(this.world, effect),
    });
    const allEvents = [...actionEvents, ...enemyEvents];
    const nowMs = performance.now();
    applyWalkAnimations(this.world, actorPositions, nowMs);
    applyEventAnimations(this.world, this.playerEntity, allEvents, nowMs);
    this.world.refresh();
    advanceAnimations(this.world, nowMs);
    this.refreshVisibility();
    return this.isPlayerDefeated() ?
      { type: "outcome", events: allEvents, outcome: "defeat" } :
      { type: "continue", events: allEvents };
  }

  private playerCommandResult(events: readonly GameEvent[]): PlayerCommandResult {
    return events.length === 0 ? UNCHANGED_PLAYER_COMMAND : { type: "continue", events };
  }

  private applyPlayerActionReactions(events: readonly GameEvent[]): readonly GameEvent[] {
    return awardCreditsForDefeats(this.world, this.playerEntity, events);
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

  private noisesForPlayerAction(
    events: readonly GameEvent[],
    actionNoise: NoiseStimulus | undefined,
  ): readonly NoiseStimulus[] {
    const eventNoise = events.some((event) => event.type === "doorOpened") ?
      this.playerNoise(DOOR_NOISE_RADIUS) :
      undefined;
    if (actionNoise === undefined) return eventNoise === undefined ? [] : [eventNoise];
    return eventNoise === undefined ? [actionNoise] : [actionNoise, eventNoise];
  }

  private playerNoise(radius: number): NoiseStimulus | undefined {
    if (radius <= 0) return undefined;

    const position = this.getPlayerPosition();
    return {
      x: position.x,
      y: position.y,
      radius,
    };
  }

  private isPlayerDefeated(): boolean {
    return (healthFor(this.world, this.playerEntity)?.current ?? 1) <= 0;
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
