import type { Entity, World } from "@phughesmcr/miski";
import {
  Door,
  Drawable,
  GridPos,
  healthFor,
  Interactable,
  Locked,
  Npc,
  PENDING_SPRITE_ANIMATION_START_MS,
  Secret,
  SPRITE_ATTACK_MS,
  SPRITE_WALK_MS,
  SpriteAnimation,
  SpriteAnimationKind,
  UplinkTerminal,
} from "@/src/ecs/components.ts";
import type { SpriteAnimationSchema } from "@/src/ecs/components.ts";
import { directionDelta } from "@/src/grid/direction.ts";
import type { GridDelta } from "@/src/grid/direction.ts";
import {
  attackTargetsForSelectedWeapon,
  attackWithSelectedWeapon,
  weaponAmmoKind,
  weaponLabel,
  weaponNoiseRadius,
} from "@/src/ecs/combat.ts";
import {
  createDrawableRenderScratch,
  createLightEntityScratch,
  DrawableKind,
  drawableSystem,
  lightSystem,
} from "@/src/ecs/drawables.ts";
import type {
  DrawableEntity,
  DrawableEntityVisitor,
  DrawableSystem,
  LightEntityVisitor,
  LightSystem,
} from "@/src/ecs/drawables.ts";
import { enemyTurnSystem } from "@/src/ecs/enemy.ts";
import type { EnemyTurnSystem } from "@/src/ecs/enemy.ts";
import { collectItemAt, interactWithEntity } from "@/src/ecs/interactions.ts";
import { createCorpse, createMapEntity } from "@/src/ecs/prefabs.ts";
import { Player } from "@/src/ecs/player.ts";
import { drawableRenderQuery, spriteAnimationQuery } from "@/src/ecs/queries.ts";
import { SpatialIndex } from "@/src/ecs/spatial.ts";
import { createWorld } from "@/src/ecs/world.ts";
import { examineEntity } from "@/src/game/examine.ts";
import { relativeMoveDirectionOffset, turnDirectionDelta } from "@/src/game/commands.ts";
import type { PlayerCommand, PlayerCommandResult } from "@/src/game/commands.ts";
import type { InteractVerb } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { NoiseStimulus } from "@/src/game/perception.ts";
import {
  applyItemPickupToPlayer,
  awardCreditsForDefeats,
  clearTransientPlayerState,
  completePlayerLevel,
  heldKeysForPlayer,
  initializePlayerProgression,
  playerAmmoAmount,
  playerHasUplinkCode,
  playerHasWeapon,
  playerStateSnapshotFor,
  selectedPlayerWeapon,
  selectPlayerWeapon,
  spendPlayerAmmo,
  tickPlayerTurnEffects,
} from "@/src/ecs/progression.ts";
import type { PlayerStateSnapshot } from "@/src/ecs/progression.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import type { CommandSlot, DialogueState, PlayerStateInput } from "@/src/game/state.ts";
import type { TargetMarkerTone } from "@/src/game/target_marker.ts";
import { VisibilityMap } from "@/src/game/visibility.ts";
import type { TileVisibility } from "@/src/game/visibility.ts";
import { mapDimensions, VICTORY_GOTO } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";

const UNCHANGED_PLAYER_COMMAND: PlayerCommandResult = Object.freeze({
  events: [],
});
const PLAYER_VISIBILITY_RADIUS = 6;
const MOVE_NOISE_RADIUS = 2;
const DOOR_NOISE_RADIUS = 4;

type MoveResult =
  | { readonly moved: false }
  | { readonly moved: true; readonly events: readonly GameEvent[] };

type ConsumedPlayerAction = {
  readonly type: "consumeTurn";
  readonly events: readonly GameEvent[];
  readonly noise?: NoiseStimulus;
};
type ActorPositionSnapshot = Map<Entity, { readonly x: number; readonly y: number }>;

type PlayerActionResolution =
  | { readonly type: "immediate"; readonly events: readonly GameEvent[] }
  | { readonly type: "refreshVisibility"; readonly events: readonly GameEvent[] }
  | ConsumedPlayerAction
  | { readonly type: "dialogue"; readonly dialogue: DialogueState; readonly events: readonly GameEvent[] }
  | { readonly type: "activateUplinkTerminal"; readonly terminal: Entity; readonly events: readonly GameEvent[] };

const UNCHANGED_PLAYER_ACTION: PlayerActionResolution = Object.freeze({
  type: "immediate",
  events: [],
});

export async function createGameSession(
  map: GameMap,
  random: RandomSource,
  playerState: PlayerStateInput = {},
): Promise<GameSession> {
  const world = await createWorld();

  try {
    let playerEntity: Entity | undefined;
    const terminalDestinations = new Map<Entity, string>();

    for (const entityDef of map.entities) {
      const entity = createMapEntity(world, entityDef);
      if (entityDef.prefab === "player") {
        playerEntity = entity;
      } else if (entityDef.prefab === "uplinkTerminal") {
        terminalDestinations.set(entity, entityDef.goto);
      }
    }

    if (playerEntity === undefined) throw new Error("Map is missing a player spawn.");

    const player = new Player(world, playerEntity);
    world.refresh();

    return new GameSession(world, player, map, random, terminalDestinations, playerState);
  } catch (error) {
    await world.destroy();
    throw error;
  }
}

export class GameSession implements Disposable {
  readonly world: World;
  readonly player: Player;
  readonly map: GameMap;
  private readonly random: RandomSource;
  private readonly drawableSystem: DrawableSystem;
  private readonly drawableScratch = createDrawableRenderScratch();
  private readonly lightSystem: LightSystem;
  private readonly lightScratch = createLightEntityScratch();
  private readonly enemyTurnSystem: EnemyTurnSystem;
  private readonly spatial: SpatialIndex;
  private readonly visibility: VisibilityMap;
  private readonly terminalDestinations: ReadonlyMap<Entity, string>;
  private disposed = false;

  constructor(
    world: World,
    player: Player,
    map: GameMap,
    random: RandomSource,
    terminalDestinations: ReadonlyMap<Entity, string>,
    playerState: PlayerStateInput,
  ) {
    this.world = world;
    this.player = player;
    this.map = map;
    this.random = random;
    initializePlayerProgression(this.world, this.player.getEntity(), playerState);
    this.world.refresh();
    this.drawableSystem = world.systems.create(drawableSystem);
    this.lightSystem = world.systems.create(lightSystem);
    this.enemyTurnSystem = world.systems.create(enemyTurnSystem);
    this.spatial = new SpatialIndex(world, map);
    this.visibility = new VisibilityMap(mapDimensions(map));
    this.terminalDestinations = new Map(terminalDestinations);
    this.refreshVisibility();
  }

  getPlayerState(): PlayerStateSnapshot {
    return playerStateSnapshotFor(this.world, this.player.getEntity());
  }

  targetMarkerTone(): TargetMarkerTone | undefined {
    return this.interactionTargetMarkerTone() ?? this.attackTargetMarkerTone() ?? this.pickupTargetMarkerTone();
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
    return this.commitPlayerAction(this.resolvePlayerAction(command));
  }

  private resolvePlayerAction(command: PlayerCommand): PlayerActionResolution {
    switch (command.type) {
      case "move":
        return this.resolvePlayerMoveAction(relativeMoveDirectionOffset(command.direction));
      case "turn":
        this.turnPlayer(turnDirectionDelta(command.direction));
        return { type: "refreshVisibility", events: [] };
      case "wait":
        return { type: "consumeTurn", events: [] };
      case "interact":
        return this.resolvePlayerInteractAction(command.verb);
      case "examine":
        return { type: "immediate", events: [examineEntity(this.world, this.spatial.facedEntity(this.player))] };
      case "attack":
        return this.resolvePlayerAttackAction();
      case "smartAction":
        return this.resolvePlayerSmartAction();
      case "selectWeapon":
        return this.resolvePlayerSelectWeaponAction(command.slot);
    }
  }

  private resolvePlayerMoveAction(directionOffset: number): PlayerActionResolution {
    const secretDoor = this.secretDoorInMoveDirection(directionOffset);
    if (secretDoor !== undefined) return this.resolvePlayerInteraction(secretDoor, "open");

    const move = this.tryMovePlayerRelative(directionOffset);
    if (!move.moved) return UNCHANGED_PLAYER_ACTION;
    return { type: "consumeTurn", events: move.events, noise: this.playerNoise(MOVE_NOISE_RADIUS) };
  }

  /**
   * The still-disguised secret door the player is about to walk into, if any.
   * Routing the bump through the normal door interaction reveals it (dropping
   * the `Secret` marker) and slides it open while still respecting any lock.
   */
  private secretDoorInMoveDirection(directionOffset: number): Entity | undefined {
    const { dir } = this.player.getFacing();
    const delta = directionDelta(dir + directionOffset);
    const current = this.player.getPosition();
    const blocker = this.spatial.blockingEntityAt(current.x + delta.dx, current.y + delta.dy);
    if (blocker === undefined || !this.world.components.entityHas(Secret, blocker)) return undefined;
    return this.world.components.readEntityData(Door, blocker)?.open === 0 ? blocker : undefined;
  }

  private tryMovePlayer(delta: GridDelta): MoveResult {
    const current = this.player.getPosition();
    const next = { x: current.x + delta.dx, y: current.y + delta.dy };

    if (this.spatial.positionBlocks(next.x, next.y)) return { moved: false };

    this.spatial.moveEntity(this.player.getEntity(), next);
    const pickup = collectItemAt(this.world, this.spatial, next.x, next.y);
    const pickupEvents = pickup === undefined ?
      [] :
      applyItemPickupToPlayer(this.world, this.player.getEntity(), pickup);
    return {
      moved: true,
      events: pickupEvents,
    };
  }

  private tryMovePlayerRelative(directionOffset: number): MoveResult {
    const { dir } = this.player.getFacing();
    return this.tryMovePlayer(directionDelta(dir + directionOffset));
  }

  private turnPlayer(delta: number): void {
    this.player.turnBy(delta);
  }

  private resolvePlayerInteractAction(verb?: InteractVerb): PlayerActionResolution {
    return this.resolvePlayerInteraction(this.spatial.facedEntity(this.player), verb);
  }

  private resolvePlayerSmartAction(): PlayerActionResolution {
    const target = this.smartActionInteractionTarget();
    if (target !== undefined) return this.resolvePlayerInteraction(target);

    return this.resolvePlayerAttackAction();
  }

  private resolvePlayerInteraction(target: Entity | undefined, verb?: InteractVerb): PlayerActionResolution {
    const interaction = interactWithEntity(
      this.world,
      this.spatial,
      target,
      heldKeysForPlayer(this.world, this.player.getEntity()),
      playerHasUplinkCode(this.world, this.player.getEntity()),
      verb,
    );
    switch (interaction.type) {
      case "unchanged":
        return { type: "immediate", events: interaction.events };
      case "consumeTurn":
        return { type: "consumeTurn", events: interaction.events };
      case "dialogue":
        return {
          type: "dialogue",
          events: interaction.events,
          dialogue: interaction.dialogue,
        };
      case "uplinkTerminal":
        return {
          type: "activateUplinkTerminal",
          terminal: interaction.terminal,
          events: interaction.events,
        };
    }
  }

  private smartActionInteractionTarget(): Entity | undefined {
    const target = this.spatial.facedEntity(this.player);
    if (target === undefined || !this.world.components.entityHas(Interactable, target)) return undefined;
    // A disguised secret door gives no smart-action prompt; only bumping reveals it.
    if (this.world.components.entityHas(Secret, target)) return undefined;

    const door = this.world.components.readEntityData(Door, target);
    if (door !== undefined) return door.open === 0 ? target : undefined;

    if (this.world.components.entityHas(Npc, target)) return target;
    if (this.world.components.entityHas(UplinkTerminal, target)) return target;
    return undefined;
  }

  private interactionTargetMarkerTone(): TargetMarkerTone | undefined {
    const target = this.spatial.facedEntity(this.player);
    if (target === undefined || !this.world.components.entityHas(Interactable, target)) return undefined;
    // Keep secret doors unmarked so they stay hidden until bumped.
    if (this.world.components.entityHas(Secret, target)) return undefined;

    const door = this.world.components.readEntityData(Door, target);
    if (door !== undefined) {
      if (door.open === 1) return undefined;
      return this.world.components.entityHas(Locked, target) ? "locked" : "use";
    }

    if (this.world.components.entityHas(Npc, target)) return "use";
    if (this.world.components.entityHas(UplinkTerminal, target)) return "use";
    return undefined;
  }

  private attackTargetMarkerTone(): TargetMarkerTone | undefined {
    const selectedWeapon = selectedPlayerWeapon(this.world, this.player.getEntity());
    const ammoKind = weaponAmmoKind(selectedWeapon);
    if (ammoKind !== undefined && playerAmmoAmount(this.world, this.player.getEntity(), ammoKind) <= 0) {
      return undefined;
    }

    const targets = attackTargetsForSelectedWeapon(this.world, this.player, selectedWeapon, this.spatial);
    return targets.length === 0 ? undefined : "danger";
  }

  private pickupTargetMarkerTone(): TargetMarkerTone | undefined {
    const current = this.player.getPosition();
    const { dir } = this.player.getFacing();
    const delta = directionDelta(dir);
    const x = current.x + delta.dx;
    const y = current.y + delta.dy;
    if (this.spatial.positionBlocks(x, y)) return undefined;
    return this.spatial.itemAt(x, y) === undefined ? undefined : "loot";
  }

  private commitUplinkTerminalActivation(terminal: Entity, events: readonly GameEvent[]): PlayerCommandResult {
    const goto = this.terminalDestinations.get(terminal);
    if (goto === undefined) {
      throw new Error(`Uplink terminal ${terminal} is missing a map destination.`);
    }

    const levelCompleteEvents = completePlayerLevel(this.world, this.player.getEntity(), events);
    clearTransientPlayerState(this.world, this.player.getEntity());
    this.world.refresh();
    if (goto === VICTORY_GOTO) {
      return { events: levelCompleteEvents, outcome: "victory" };
    }
    return {
      events: levelCompleteEvents,
      mapChange: { goto },
    };
  }

  private resolvePlayerAttackAction(): PlayerActionResolution {
    const selectedWeapon = selectedPlayerWeapon(this.world, this.player.getEntity());
    const ammoKind = weaponAmmoKind(selectedWeapon);
    let ammoEvents: readonly GameEvent[] = [];
    if (ammoKind !== undefined) {
      if (!spendPlayerAmmo(this.world, this.player.getEntity(), ammoKind)) {
        return { type: "immediate", events: [{ type: "noAmmo", ammo: ammoKind }] };
      }
      ammoEvents = [{ type: "ammoSpent", ammo: ammoKind, amount: 1 }];
    }

    const events = attackWithSelectedWeapon(
      this.world,
      this.player,
      selectedWeapon,
      this.spatial,
      this.random,
    );
    return {
      type: "consumeTurn",
      events: [...ammoEvents, ...events],
      noise: this.playerNoise(weaponNoiseRadius(selectedWeapon)),
    };
  }

  private resolvePlayerSelectWeaponAction(slot: CommandSlot): PlayerActionResolution {
    const label = weaponLabel(slot);
    if (!playerHasWeapon(this.world, this.player.getEntity(), slot)) {
      return {
        type: "immediate",
        events: [{
          type: "weaponUnavailable",
          slot,
          label,
        }],
      };
    }

    selectPlayerWeapon(this.world, this.player.getEntity(), slot);
    return {
      type: "immediate",
      events: [{
        type: "weaponSelected",
        slot,
        label,
      }],
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
        return {
          events: action.events,
          dialogue: action.dialogue,
        };
      case "activateUplinkTerminal":
        return this.commitUplinkTerminalActivation(action.terminal, action.events);
    }
  }

  private commitConsumedPlayerAction(action: ConsumedPlayerAction): PlayerCommandResult {
    const actorPositions = this.actorPositionSnapshot();
    const actionEvents = this.applyPlayerActionReactions(action.events);
    const enemyEvents = this.enemyTurnSystem({
      world: this.world,
      player: this.player,
      spatial: this.spatial,
      random: this.random,
      blocksSight: (x, y) => this.tileBlocksSight(x, y),
      noises: this.noisesForPlayerAction(actionEvents, action.noise),
    });
    tickPlayerTurnEffects(this.world, this.player.getEntity());
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
    return awardCreditsForDefeats(this.world, this.player.getEntity(), events);
  }

  private applySpriteAnimations(events: readonly GameEvent[], nowMs: number): void {
    for (const event of events) {
      if ((event.type === "damageDealt" || event.type === "attackMissed") && event.actor !== this.player.getEntity()) {
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
    this.visibility.revealFrom(this.player.getPosition(), {
      radius: PLAYER_VISIBILITY_RADIUS,
      facing: this.player.getFacing().dir,
      blocksSight: (x, y) => this.tileBlocksSight(x, y),
    });
  }

  private tileBlocksSight(x: number, y: number): boolean {
    if (this.spatial.tileBlocks(x, y)) return true;

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

    const position = this.player.getPosition();
    return {
      x: position.x,
      y: position.y,
      radius,
    };
  }

  private isPlayerDefeated(): boolean {
    return (healthFor(this.world, this.player.getEntity())?.current ?? 1) <= 0;
  }

  [Symbol.dispose](): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.world.destroy();
  }
}
