import type { Entity, World } from "@phughesmcr/miski";
import {
  Door,
  Drawable,
  Facing,
  type FacingSchema,
  GridPos,
  type GridPosSchema,
  healthFor,
  PENDING_SPRITE_ANIMATION_START_MS,
  SPRITE_ATTACK_MS,
  SPRITE_WALK_MS,
  SpriteAnimation,
  SpriteAnimationKind,
  type SpriteAnimationSchema,
} from "@/src/ecs/components.ts";
import {
  createEntityContentStore,
  entityContent,
  type EntityContentStore,
  removeEntityContent,
} from "@/src/ecs/entity_content.ts";
import { normalizeDirection } from "@/src/grid/direction.ts";
import {
  createDrawableRenderScratch,
  createLightEntityScratch,
  type DrawableEntityVisitor,
  DrawableKind,
  type DrawableSystem,
  drawableSystem,
  type LightEntityVisitor,
  type LightSystem,
  lightSystem,
} from "@/src/ecs/drawables.ts";
import { type EnemyTurnSystem, enemyTurnSystem } from "@/src/ecs/enemy.ts";
import { createCorpse, createMapEntity, createPlayer, type PlayerPrefab } from "@/src/ecs/prefabs.ts";
import {
  type PlayerActionResolution,
  type PlayerTurnContext,
  type PlayerTurnSystem,
  playerTurnSystem,
  targetMarkerTone,
} from "@/src/ecs/player_turn.ts";
import { drawableRenderQuery, mapScopedQuery, spriteAnimationQuery } from "@/src/ecs/queries.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { NoiseStimulus } from "@/src/game/perception.ts";
import {
  awardCreditsForDefeats,
  capturePlayerProgressionCheckpoint,
  clearTransientPlayerState,
  completePlayerLevel,
  type PlayerProgressionCheckpoint,
  type PlayerStatusSnapshot,
  playerStatusSnapshotFor,
  resetPlayerProgression,
  restorePlayerProgressionCheckpoint,
} from "@/src/ecs/progression.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import type { TargetMarkerTone } from "@/src/game/state.ts";
import {
  normalizeStoryFlags,
  type StoryAction,
  storyEventDefinition,
  type StoryEventId,
  type StoryFlag,
} from "@/src/game/story.ts";
import { type TileVisibility, VisibilityMap } from "@/src/game/visibility.ts";
import { type EntityDef, type GameMap, mapDimensions, VICTORY_GOTO } from "@/src/map/map.ts";

const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = Object.freeze({
  events: [],
});
const PLAYER_VISIBILITY_RADIUS = 6;
const DOOR_NOISE_RADIUS = 4;
const STORY_MOVE_MS = 260;

type ActorPositionSnapshot = Map<Entity, { readonly x: number; readonly y: number }>;
export type GameSessionTickResult = {
  readonly needsFrame: boolean;
};

export async function createGameSession(
  map: GameMap,
  random: RandomSource,
): Promise<GameSession> {
  const world = await createWorld();
  const contentStore = createEntityContentStore();

  try {
    const playerEntity = createPlayer(world, playerSpawnFor(map));
    resetPlayerProgression(world, playerEntity);
    spawnMapScopedEntities(world, contentStore, map);

    world.refresh();
    assertUniqueStoryTargets(contentStore);

    return new GameSession(world, contentStore, playerEntity, map, random);
  } catch (error) {
    await world.destroy();
    throw error;
  }
}

export class GameSession implements Disposable {
  readonly world: World;
  readonly contentStore: EntityContentStore;
  readonly playerEntity: Entity;
  map: GameMap;
  private readonly random: RandomSource;
  private readonly drawableSystem: DrawableSystem;
  private readonly drawableScratch = createDrawableRenderScratch();
  private readonly lightSystem: LightSystem;
  private readonly lightScratch = createLightEntityScratch();
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
    contentStore: EntityContentStore,
    playerEntity: Entity,
    map: GameMap,
    random: RandomSource,
  ) {
    this.world = world;
    this.contentStore = contentStore;
    this.playerEntity = playerEntity;
    this.map = map;
    this.random = random;
    this.drawableSystem = world.systems.create(drawableSystem);
    this.lightSystem = world.systems.create(lightSystem);
    this.playerTurnSystem = world.systems.create(playerTurnSystem);
    this.enemyTurnSystem = world.systems.create(enemyTurnSystem);
    this.spatial = new SpatialIndex(world, map);
    const dimensions = mapDimensions(map);
    this.visibility = new VisibilityMap(dimensions);
    this.storyFlags = new Set();
    this.refreshVisibility();
    this.levelEntryCheckpoint = this.captureCheckpoint();
  }

  getPlayerStatus(): PlayerStatusSnapshot {
    return playerStatusSnapshotFor(this.world, this.playerEntity);
  }

  getStoryFlags(): readonly StoryFlag[] {
    return normalizeStoryFlags([...this.storyFlags]);
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

  getVisibility(): TileVisibility {
    return this.visibility;
  }

  loadMap(map: GameMap): void {
    this.loadMapContent(map);
    this.levelEntryCheckpoint = this.captureCheckpoint();
  }

  retryMap(map: GameMap): void {
    this.restoreCheckpoint(this.levelEntryCheckpoint);
    this.loadMapContent(map);
  }

  resetRun(map: GameMap): void {
    resetPlayerProgression(this.world, this.playerEntity);
    this.storyFlags.clear();
    this.loadMapContent(map);
    this.levelEntryCheckpoint = this.captureCheckpoint();
  }

  tick(nowMs: number): GameSessionTickResult {
    return { needsFrame: this.advanceSpriteAnimations(nowMs) };
  }

  handlePlayerCommand(command: PlayerCommand): PlayerCommandResult {
    return this.commitPlayerAction(this.playerTurnSystem({ ...this.playerTurnContext(), command }));
  }

  closeDialogue(): void {
    const event = this.pendingDialogueStoryEvent;
    this.pendingDialogueStoryEvent = undefined;
    if (event !== undefined) this.applyStoryEvent(event);
  }

  private loadMapContent(map: GameMap): void {
    const spawn = playerSpawnFor(map);
    this.pendingDialogueStoryEvent = undefined;
    this.clearMapScopedEntities();
    this.map = map;
    this.world.components.setEntityData(GridPos, this.playerEntity, { x: spawn.x, y: spawn.y });
    this.world.components.setEntityData(Facing, this.playerEntity, { dir: normalizeDirection(spawn.dir) });
    spawnMapScopedEntities(this.world, this.contentStore, map);
    this.world.refresh();
    assertUniqueStoryTargets(this.contentStore);
    this.rebuildMapRuntimeState(map);
  }

  private clearMapScopedEntities(): void {
    const entities = Array.from(this.world.entities.query(mapScopedQuery));
    for (const entity of entities) {
      removeEntityContent(this.contentStore, entity);
      this.world.entities.destroy(entity);
    }
  }

  private rebuildMapRuntimeState(map: GameMap): void {
    this.spatial = new SpatialIndex(this.world, map);
    this.visibility = new VisibilityMap(mapDimensions(map));
    this.refreshVisibility();
  }

  private captureCheckpoint(): PlayerProgressionCheckpoint {
    return capturePlayerProgressionCheckpoint(this.world, this.playerEntity, [...this.storyFlags]);
  }

  private restoreCheckpoint(checkpoint: PlayerProgressionCheckpoint): void {
    const storyFlags = restorePlayerProgressionCheckpoint(this.world, this.playerEntity, checkpoint);
    this.storyFlags.clear();
    for (const flag of storyFlags) this.storyFlags.add(flag);
  }

  private playerTurnContext(): PlayerTurnContext {
    return {
      world: this.world,
      contentStore: this.contentStore,
      player: this.playerEntity,
      spatial: this.spatial,
      random: this.random,
    };
  }

  private queueTalkStoryEvent(target: Entity | undefined): void {
    if (target === undefined) return;

    const event = entityContent(this.contentStore, target)?.onTalkEvent;
    if (event === undefined) return;

    const definition = storyEventDefinition(event);
    if (this.storyFlags.has(definition.flag)) return;
    this.pendingDialogueStoryEvent = event;
  }

  private applyStoryEvent(event: StoryEventId): void {
    const definition = storyEventDefinition(event);
    if (this.storyFlags.has(definition.flag)) return;
    if (!this.canApplyStoryActions(definition.actions)) return;

    const nowMs = performance.now();
    for (const action of definition.actions) {
      switch (action.type) {
        case "moveEntity": {
          const target = this.storyTargetEntity(action.target);
          if (target === undefined) return;
          this.spatial.moveEntity(target, action.destination);
          this.setSpriteAnimation(target, {
            kind: SpriteAnimationKind.Walk,
            startedAtMs: nowMs,
            durationMs: STORY_MOVE_MS,
          });
          break;
        }
      }
    }

    this.storyFlags.add(definition.flag);
    this.world.refresh();
    this.refreshVisibility();
  }

  private canApplyStoryActions(actions: readonly StoryAction[]): boolean {
    for (const action of actions) {
      switch (action.type) {
        case "moveEntity": {
          const target = this.storyTargetEntity(action.target);
          if (target === undefined) return false;

          const destination = action.destination;
          if (this.spatial.tileBlocks(destination.x, destination.y)) return false;

          const blocker = this.spatial.blockingEntityAt(destination.x, destination.y);
          if (blocker !== undefined && blocker !== target) return false;
          break;
        }
      }
    }
    return true;
  }

  private storyTargetEntity(targetId: StoryAction["target"]): Entity | undefined {
    for (const [entity, content] of this.contentStore) {
      if (!this.world.entities.isActive(entity)) continue;
      if (content.storyId === targetId) return entity;
    }
    return undefined;
  }

  private commitUplinkTerminalActivation(terminal: Entity, events: readonly GameEvent[]): PlayerCommandResult {
    const goto = entityContent(this.contentStore, terminal)?.terminalDestination;
    if (goto === undefined) {
      throw new Error(`Uplink terminal ${terminal} is missing a map destination.`);
    }

    const levelCompleteEvents = completePlayerLevel(this.world, this.playerEntity, events);
    clearTransientPlayerState(this.world, this.playerEntity);
    this.world.refresh();
    if (goto === VICTORY_GOTO) {
      return { events: levelCompleteEvents, outcome: "victory" };
    }
    return {
      events: levelCompleteEvents,
      mapChange: { goto },
    };
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
    const actorPositions = this.actorPositionSnapshot();
    const actionEvents = this.applyPlayerActionReactions(action.events);
    const enemyEvents = this.enemyTurnSystem({
      world: this.world,
      player: this.playerEntity,
      spatial: this.spatial,
      random: this.random,
      contentStore: this.contentStore,
      blocksSight: (x, y) => this.tileBlocksSight(x, y),
      noises: this.noisesForPlayerAction(actionEvents, action.noise),
    });
    const allEvents = [...actionEvents, ...enemyEvents];
    const nowMs = performance.now();
    this.applyWalkAnimations(actorPositions, nowMs);
    this.applySpriteAnimations(allEvents, nowMs);
    this.world.refresh();
    this.advanceSpriteAnimations(nowMs);
    this.refreshVisibility();
    return this.isPlayerDefeated() ? { events: allEvents, outcome: "defeat" } : { events: allEvents };
  }

  private advanceSpriteAnimations(nowMs: number): boolean {
    let changed = false;
    let active = false;
    for (const entity of this.world.entities.query(spriteAnimationQuery)) {
      const animation = this.world.components.getEntityData(SpriteAnimation, entity);
      if (animation.startedAtMs === PENDING_SPRITE_ANIMATION_START_MS) {
        this.world.components.setEntityData(SpriteAnimation, entity, {
          kind: animation.kind as SpriteAnimationSchema["kind"],
          startedAtMs: nowMs,
          durationMs: animation.durationMs,
        });
        changed = true;
        active = true;
        continue;
      }
      if (nowMs < animation.startedAtMs + animation.durationMs) {
        active = true;
        continue;
      }

      if (animation.kind === SpriteAnimationKind.Death) {
        const position = this.world.components.readEntityData(GridPos, entity);
        removeEntityContent(this.contentStore, entity);
        this.world.entities.destroy(entity);
        if (position !== undefined) createCorpse(this.world, position);
      } else {
        this.world.components.removeFromEntity(SpriteAnimation, entity);
      }
      changed = true;
    }
    if (changed) this.world.refresh();
    return active;
  }

  private playerCommandResult(events: readonly GameEvent[]): PlayerCommandResult {
    return events.length === 0 ? UNCHANGED_PLAYER_COMMAND : { events };
  }

  private applyPlayerActionReactions(events: readonly GameEvent[]): readonly GameEvent[] {
    return awardCreditsForDefeats(this.world, this.playerEntity, events);
  }

  private applySpriteAnimations(events: readonly GameEvent[], nowMs: number): void {
    for (const event of events) {
      if ((event.type === "damageDealt" || event.type === "attackMissed") && event.actor !== this.playerEntity) {
        this.setSpriteAnimation(event.actor, {
          kind: SpriteAnimationKind.Attack,
          startedAtMs: nowMs,
          durationMs: SPRITE_ATTACK_MS,
        });
      }
    }
  }

  private actorPositionSnapshot(): ActorPositionSnapshot {
    const positions: ActorPositionSnapshot = new Map();
    for (const entity of this.world.entities.query(drawableRenderQuery)) {
      const drawable = this.world.components.readEntityData(Drawable, entity);
      if (drawable?.kind !== DrawableKind.Actor) continue;
      const position = this.world.components.readEntityData(GridPos, entity);
      if (position !== undefined) positions.set(entity, { x: position.x, y: position.y });
    }
    return positions;
  }

  private applyWalkAnimations(positions: ActorPositionSnapshot, nowMs: number): void {
    for (const [entity, from] of positions) {
      if (!this.world.entities.isActive(entity)) continue;
      const to = this.world.components.readEntityData(GridPos, entity);
      if (to === undefined || (to.x === from.x && to.y === from.y)) continue;
      this.setSpriteAnimation(entity, {
        kind: SpriteAnimationKind.Walk,
        startedAtMs: nowMs,
        durationMs: SPRITE_WALK_MS,
      });
    }
  }

  private setSpriteAnimation(entity: Entity, animation: SpriteAnimationSchema): void {
    if (!this.world.entities.isActive(entity)) return;
    if (this.world.components.entityHas(SpriteAnimation, entity)) {
      this.world.components.setEntityData(SpriteAnimation, entity, animation);
      return;
    }
    this.world.components.addToEntity(SpriteAnimation, entity, animation);
  }

  private refreshVisibility(): void {
    this.visibility.revealFrom(this.getPlayerPosition(), {
      radius: PLAYER_VISIBILITY_RADIUS,
      facing: this.getPlayerFacing().dir,
      blocksSight: (x, y) => this.tileBlocksSight(x, y),
    });
  }

  private tileBlocksSight(x: number, y: number): boolean {
    if (this.spatial.tileBlocksSight(x, y)) return true;

    const blockingEntity = this.spatial.blockingEntityAt(x, y);
    if (blockingEntity === undefined) return false;
    return this.world.components.readEntityData(Door, blockingEntity)?.open === 0;
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

function assertUniqueStoryTargets(contentStore: EntityContentStore): void {
  const seen = new Set<string>();
  for (const content of contentStore.values()) {
    const storyId = content.storyId;
    if (storyId === undefined) continue;
    if (seen.has(storyId)) throw new Error(`Duplicate story target "${storyId}".`);
    seen.add(storyId);
  }
}

function playerSpawnFor(map: GameMap): PlayerPrefab {
  const player = map.entities.find((entity): entity is Extract<EntityDef, { readonly prefab: "player" }> =>
    entity.prefab === "player"
  );
  if (player === undefined) throw new Error("Map is missing a player spawn.");
  return player;
}

function spawnMapScopedEntities(world: World, contentStore: EntityContentStore, map: GameMap): void {
  for (const entityDef of map.entities) {
    if (entityDef.prefab !== "player") createMapEntity(world, contentStore, entityDef);
  }
}
