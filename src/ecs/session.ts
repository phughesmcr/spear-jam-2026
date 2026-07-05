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
  StoryTarget,
  TalkStoryEvent,
  UplinkTerminal,
} from "@/src/ecs/components.ts";
import { normalizeDirection } from "@/src/grid/direction.ts";
import {
  createDrawableRenderScratch,
  createLightEntityScratch,
  type DrawableEntity,
  type DrawableEntityVisitor,
  DrawableKind,
  type DrawableSystem,
  drawableSystem,
  type LightEntityVisitor,
  type LightSystem,
  lightSystem,
} from "@/src/ecs/drawables.ts";
import { type EnemyTurnSystem, enemyTurnSystem } from "@/src/ecs/enemy.ts";
import { createCorpse, createMapEntity } from "@/src/ecs/prefabs.ts";
import {
  type PlayerActionResolution,
  type PlayerTurnContext,
  type PlayerTurnSystem,
  playerTurnSystem,
  targetMarkerTone,
} from "@/src/ecs/player_turn.ts";
import { drawableRenderQuery, spriteAnimationQuery, storyTargetQuery } from "@/src/ecs/queries.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { NoiseStimulus } from "@/src/game/perception.ts";
import {
  awardCreditsForDefeats,
  clearTransientPlayerState,
  completePlayerLevel,
  initializePlayerProgression,
  type PlayerStateSnapshot,
  playerStateSnapshotFor,
  tickPlayerTurnEffects,
} from "@/src/ecs/progression.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import type { PlayerStateInput, TargetMarkerTone } from "@/src/game/state.ts";
import {
  normalizeStoryFlags,
  type StoryAction,
  storyEventDefinition,
  storyEventForCode,
  type StoryEventId,
  type StoryFlag,
  storyPathDestination,
  storyTargetCode,
  storyTargetForCode,
} from "@/src/game/story.ts";
import { type TileVisibility, VisibilityMap } from "@/src/game/visibility.ts";
import { type GameMap, mapDimensions, terminalDestinationForCode, VICTORY_GOTO } from "@/src/map/map.ts";

const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = Object.freeze({
  events: [],
});
const PLAYER_VISIBILITY_RADIUS = 6;
const DOOR_NOISE_RADIUS = 4;
const STORY_MOVE_MS = 260;

type ActorPositionSnapshot = Map<Entity, { readonly x: number; readonly y: number }>;

export async function createGameSession(
  map: GameMap,
  random: RandomSource,
  playerState: PlayerStateInput = {},
): Promise<GameSession> {
  const world = await createWorld();

  try {
    let playerEntity: Entity | undefined;

    for (const entityDef of map.entities) {
      const entity = createMapEntity(world, entityDef);
      if (entityDef.prefab === "player") {
        playerEntity = entity;
      }
    }

    if (playerEntity === undefined) throw new Error("Map is missing a player spawn.");

    world.refresh();
    assertUniqueStoryTargets(world);

    return new GameSession(world, playerEntity, map, random, playerState);
  } catch (error) {
    await world.destroy();
    throw error;
  }
}

export class GameSession implements Disposable {
  readonly world: World;
  readonly playerEntity: Entity;
  readonly map: GameMap;
  private readonly random: RandomSource;
  private readonly drawableSystem: DrawableSystem;
  private readonly drawableScratch = createDrawableRenderScratch();
  private readonly lightSystem: LightSystem;
  private readonly lightScratch = createLightEntityScratch();
  private readonly playerTurnSystem: PlayerTurnSystem;
  private readonly enemyTurnSystem: EnemyTurnSystem;
  private readonly spatial: SpatialIndex;
  private readonly playerTurnContext: PlayerTurnContext;
  private readonly visibility: VisibilityMap;
  private readonly storyFlags: Set<StoryFlag>;
  private pendingDialogueStoryEvent?: StoryEventId;
  private disposed = false;

  constructor(
    world: World,
    playerEntity: Entity,
    map: GameMap,
    random: RandomSource,
    playerState: PlayerStateInput,
  ) {
    this.world = world;
    this.playerEntity = playerEntity;
    this.map = map;
    this.random = random;
    initializePlayerProgression(this.world, this.playerEntity, playerState);
    this.world.refresh();
    this.drawableSystem = world.systems.create(drawableSystem);
    this.lightSystem = world.systems.create(lightSystem);
    this.playerTurnSystem = world.systems.create(playerTurnSystem);
    this.enemyTurnSystem = world.systems.create(enemyTurnSystem);
    this.spatial = new SpatialIndex(world, map);
    const dimensions = mapDimensions(map);
    this.playerTurnContext = {
      world,
      player: playerEntity,
      spatial: this.spatial,
      random,
    };
    this.visibility = new VisibilityMap(dimensions);
    this.storyFlags = new Set(normalizeStoryFlags(playerState.storyFlags));
    this.refreshVisibility();
  }

  getPlayerState(): PlayerStateSnapshot {
    return playerStateSnapshotFor(this.world, this.playerEntity, [...this.storyFlags]);
  }

  getPlayerPosition(): GridPosSchema {
    return this.world.components.getEntityData(GridPos, this.playerEntity);
  }

  getPlayerFacing(): FacingSchema {
    const facing = this.world.components.getEntityData(Facing, this.playerEntity);
    return { dir: normalizeDirection(facing.dir) };
  }

  targetMarkerTone(): TargetMarkerTone | undefined {
    return targetMarkerTone(this.playerTurnContext);
  }

  forEachDrawable(visit: DrawableEntityVisitor): void {
    this.drawableSystem({
      scratch: this.drawableScratch,
      visit: (drawable) => {
        if (this.drawableIsVisible(drawable)) visit(drawable);
      },
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

  advanceSpriteAnimations(nowMs: number): boolean {
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

  handlePlayerCommand(command: PlayerCommand): PlayerCommandResult {
    return this.commitPlayerAction(this.playerTurnSystem({ ...this.playerTurnContext, command }));
  }

  closeDialogue(): void {
    const event = this.pendingDialogueStoryEvent;
    this.pendingDialogueStoryEvent = undefined;
    if (event !== undefined) this.applyStoryEvent(event);
  }

  private queueTalkStoryEvent(target: Entity | undefined): void {
    if (target === undefined) return;

    const eventData = this.world.components.readEntityData(TalkStoryEvent, target);
    if (eventData === undefined) return;

    const event = storyEventForCode(eventData.event);
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
          this.spatial.moveEntity(target, storyPathDestination(action.path));
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

          const destination = storyPathDestination(action.path);
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
    const targetCode = storyTargetCode(targetId);
    for (const entity of this.world.entities.query(storyTargetQuery)) {
      const target = this.world.components.getEntityData(StoryTarget, entity);
      if (target.id === targetCode) return entity;
    }
    return undefined;
  }

  private commitUplinkTerminalActivation(terminal: Entity, events: readonly GameEvent[]): PlayerCommandResult {
    const destination = this.world.components.readEntityData(UplinkTerminal, terminal);
    if (destination === undefined) {
      throw new Error(`Uplink terminal ${terminal} is missing a map destination.`);
    }

    const goto = terminalDestinationForCode(destination.destination);
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
      blocksSight: (x, y) => this.tileBlocksSight(x, y),
      noises: this.noisesForPlayerAction(actionEvents, action.noise),
    });
    tickPlayerTurnEffects(this.world, this.playerEntity);
    const allEvents = [...actionEvents, ...enemyEvents];
    const nowMs = performance.now();
    this.applyWalkAnimations(actorPositions, nowMs);
    this.applySpriteAnimations(allEvents, nowMs);
    this.world.refresh();
    this.advanceSpriteAnimations(nowMs);
    this.refreshVisibility();
    return this.isPlayerDefeated() ? { events: allEvents, outcome: "defeat" } : { events: allEvents };
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

  private drawableIsVisible(drawable: DrawableEntity): boolean {
    return drawable.kind === DrawableKind.Player || this.visibility.isVisible(drawable.x, drawable.y);
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

function assertUniqueStoryTargets(world: World): void {
  const seen = new Set<number>();
  for (const entity of world.entities.query(storyTargetQuery)) {
    const { id } = world.components.getEntityData(StoryTarget, entity);
    if (seen.has(id)) throw new Error(`Duplicate story target "${storyTargetForCode(id)}".`);
    seen.add(id);
  }
}
