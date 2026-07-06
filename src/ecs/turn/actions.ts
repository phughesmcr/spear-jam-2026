import type { Entity, World } from "@phughesmcr/miski";
import { AttackFacingRequirement, Door, Facing, GridPos, PlayerEquipment, Secret } from "@/src/ecs/components.ts";
import {
  attackEntity,
  attackTargets,
  attackWithSelectedWeapon,
  type DefeatEffectWriter,
  entityAttack,
} from "@/src/ecs/combat.ts";
import { collectItemAt, interactWithEntity } from "@/src/ecs/interactions.ts";
import {
  applyItemPickupToPlayer,
  heldKeysForPlayer,
  playerHasUplinkCode,
  playerHasWeapon,
  selectPlayerWeapon,
  spendPlayerAmmo,
} from "@/src/ecs/progression.ts";
import type { SpatialAccess, SpatialDistanceField } from "@/src/ecs/spatial.ts";
import { examineEntity } from "@/src/game/examine.ts";
import type { InteractVerb } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { BlocksSight, NoiseStimulus } from "@/src/game/perception.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import type { CommandSlot, DialogueState } from "@/src/game/state.ts";
import { playerWeaponSpec } from "@/src/game/weapons.ts";
import {
  CARDINAL_DELTAS,
  type CardinalDirection,
  Direction,
  directionDelta,
  type GridDelta,
  type GridPoint,
  manhattanDistance,
  normalizeDirection,
} from "@/src/grid/direction.ts";

const MOVE_NOISE_RADIUS = 2;

export type TurnSpatial = SpatialAccess & {
  itemAt(x: number, y: number): Entity | undefined;
  facedEntity(current: GridPoint, dir: number): Entity | undefined;
  nextStepToward(start: GridPoint, target: GridPoint): GridPoint | undefined;
  distanceFieldTo?(target: GridPoint): SpatialDistanceField;
};

export type TurnContext = {
  readonly world: World;
  readonly player: Entity;
  readonly spatial: TurnSpatial;
  readonly random: RandomSource;
  readonly blocksSight?: BlocksSight;
  readonly writeDefeatEffect?: DefeatEffectWriter;
};

export type ActorIntent =
  | {
    readonly type: "move";
    readonly actor: Entity;
    readonly mode: PlayerMoveMode | EnemyMoveMode;
    readonly stopAfterActing?: boolean;
    readonly stopAfterBlocked?: boolean;
  }
  | { readonly type: "face"; readonly actor: Entity; readonly mode: FaceMode }
  | { readonly type: "attack"; readonly actor: Entity; readonly target: "enemies" | "player" }
  | {
    readonly type: "interact";
    readonly actor: Entity;
    readonly target: Entity | undefined;
    readonly verb?: InteractVerb;
  }
  | { readonly type: "wait"; readonly actor: Entity }
  | { readonly type: "selectWeapon"; readonly actor: Entity; readonly slot: CommandSlot }
  | { readonly type: "examine"; readonly actor: Entity; readonly target: Entity | undefined };

export type PlayerMoveMode = {
  readonly type: "relative";
  readonly directionOffset: number;
};

export type EnemyMoveMode =
  | { readonly type: "toward"; readonly target: GridPoint }
  | { readonly type: "awayFrom"; readonly target: GridPoint };

export type FaceMode =
  | { readonly type: "turn"; readonly directionDelta: number }
  | { readonly type: "toward"; readonly target: GridPoint };

export type IntentResolution = {
  readonly events: readonly GameEvent[];
  readonly cost?: "free" | "turn";
  readonly refreshVisibility?: boolean;
  readonly noise?: NoiseStimulus;
  readonly dialogue?: {
    readonly target: Entity;
    readonly dialogue: DialogueState;
  };
  readonly terminal?: Entity;
  readonly acted?: boolean;
};

export function resolveIntent(context: TurnContext, intent: ActorIntent): IntentResolution {
  switch (intent.type) {
    case "move":
      return intent.mode.type === "relative" ?
        resolvePlayerMoveIntent(context, intent.actor, intent.mode) :
        resolveEnemyMoveIntent(context, intent.actor, intent.mode);
    case "face":
      resolveFaceIntent(context, intent.actor, intent.mode);
      return { events: [], cost: "free", refreshVisibility: intent.actor === context.player, acted: true };
    case "attack":
      return intent.target === "enemies" ?
        resolvePlayerAttackIntent(context, intent.actor) :
        resolveEnemyAttackIntent(context, intent.actor);
    case "interact":
      return resolveInteractionIntent(context, intent.target, intent.verb);
    case "wait":
      return { events: [], cost: "turn", acted: true };
    case "selectWeapon":
      return resolveSelectWeaponIntent(context, intent.actor, intent.slot);
    case "examine":
      return { events: [examineEntity(context.world, intent.target)], cost: "free", acted: true };
  }
}

export function facedEntity(context: TurnContext): Entity | undefined {
  return context.spatial.facedEntity(playerPosition(context), playerFacing(context));
}

export function playerPosition(context: TurnContext): GridPoint {
  return context.world.components.getEntityData(GridPos, context.player);
}

export function playerFacing(context: TurnContext): number {
  return normalizeDirection(context.world.components.getEntityData(Facing, context.player).dir);
}

function resolvePlayerMoveIntent(
  context: TurnContext,
  actor: Entity,
  mode: PlayerMoveMode,
): IntentResolution {
  const delta = directionDelta(playerFacing(context) + mode.directionOffset);
  const current = playerPosition(context);
  const faced = context.spatial.facedEntity(current, playerFacing(context) + mode.directionOffset);
  if (
    faced !== undefined &&
    context.world.components.entityHas(Secret, faced) &&
    context.world.components.readEntityData(Door, faced)?.open === 0
  ) {
    return resolveInteractionIntent(context, faced, "open");
  }

  const next = { x: current.x + delta.dx, y: current.y + delta.dy };
  if (context.spatial.positionBlocks(next.x, next.y)) return { events: [], cost: "free" };

  context.spatial.moveEntity(actor, next);
  const pickup = collectItemAt(context.world, context.spatial, next.x, next.y);
  return {
    events: pickup === undefined ? [] : applyItemPickupToPlayer(context.world, actor, pickup),
    cost: "turn",
    noise: playerNoise(context, MOVE_NOISE_RADIUS),
    acted: true,
  };
}

function resolveEnemyMoveIntent(
  context: TurnContext,
  actor: Entity,
  mode: EnemyMoveMode,
): IntentResolution {
  const moved = mode.type === "toward" ?
    tryMoveEnemyTowardPosition(context, mode.target, actor) :
    tryMoveEnemyAwayFromPosition(context, actor, mode.target);
  return { events: [], acted: moved };
}

function resolveFaceIntent(context: TurnContext, actor: Entity, mode: FaceMode): void {
  const facing = context.world.components.getEntityData(Facing, actor);
  if (mode.type === "turn") {
    context.world.components.setEntityData(Facing, actor, {
      dir: normalizeDirection(facing.dir + mode.directionDelta),
    });
    return;
  }

  faceEntityToward(context, actor, mode.target);
}

function resolveInteractionIntent(
  context: TurnContext,
  target: Entity | undefined,
  verb?: InteractVerb,
): IntentResolution {
  const interaction = interactWithEntity(
    context.world,
    context.spatial,
    target,
    heldKeysForPlayer(context.world, context.player),
    playerHasUplinkCode(context.world, context.player),
    verb,
  );

  switch (interaction.type) {
    case "unchanged":
      return { events: interaction.events, cost: "free", acted: interaction.events.length > 0 };
    case "consumeTurn":
      return { events: interaction.events, cost: "turn", acted: true };
    case "dialogue":
      return {
        events: interaction.events,
        cost: "free",
        dialogue: { target: interaction.target, dialogue: interaction.dialogue },
        acted: true,
      };
    case "uplinkTerminal":
      return { events: interaction.events, cost: "free", terminal: interaction.terminal, acted: true };
  }
}

function resolvePlayerAttackIntent(context: TurnContext, actor: Entity): IntentResolution {
  const selectedWeapon = context.world.components.getEntityData(PlayerEquipment, actor);
  return resolvePlayerSelectedWeaponAttack(context, actor, selectedWeapon.selectedWeapon as CommandSlot);
}

function resolvePlayerSelectedWeaponAttack(
  context: TurnContext,
  actor: Entity,
  selectedWeapon: CommandSlot,
): IntentResolution {
  const weapon = playerWeaponSpec(selectedWeapon);
  const ammoKind = weapon.ammo;
  if (ammoKind !== undefined && !spendPlayerAmmo(context.world, actor, ammoKind)) {
    return { events: [{ type: "noAmmo", ammo: ammoKind }], cost: "free", acted: true };
  }

  const attackEvents = attackWithSelectedWeapon(
    context.world,
    actor,
    selectedWeapon,
    context.spatial,
    context.random,
    context.writeDefeatEffect,
  );
  return {
    events: ammoKind === undefined ? attackEvents : [{ type: "ammoSpent", ammo: ammoKind, amount: 1 }, ...attackEvents],
    cost: "turn",
    noise: playerNoise(context, weapon.noiseRadius),
    acted: true,
  };
}

function resolveEnemyAttackIntent(context: TurnContext, actor: Entity): IntentResolution {
  const attack = entityAttack(context.world, actor);
  if (attack === undefined) return { events: [] };

  const targets = attackEntityTargetsPlayer(context, actor);
  if (targets.length === 0) return { events: [] };

  const events: GameEvent[] = [];
  for (const target of targets) {
    events.push(
      ...attackEntity(context.world, actor, target, attack, context.random, context.spatial, context.writeDefeatEffect),
    );
  }
  return { events, acted: events.length > 0 };
}

function resolveSelectWeaponIntent(context: TurnContext, actor: Entity, slot: CommandSlot): IntentResolution {
  const label = playerWeaponSpec(slot).label;
  const available = playerHasWeapon(context.world, actor, slot);
  if (available) selectPlayerWeapon(context.world, actor, slot);
  return {
    events: [{
      type: available ? "weaponSelected" : "weaponUnavailable",
      slot,
      label,
    }],
    cost: "free",
    acted: true,
  };
}

function attackEntityTargetsPlayer(context: TurnContext, actor: Entity): readonly Entity[] {
  const attack = entityAttack(context.world, actor);
  if (attack === undefined) return [];

  if (attack.requiresFacing === AttackFacingRequirement.Required) {
    faceEntityToward(context, actor, playerPosition(context));
  }

  return attackWithPredicate(context, actor, (candidate) => candidate === context.player);
}

function attackWithPredicate(
  context: TurnContext,
  actor: Entity,
  isTarget: (entity: Entity) => boolean,
): readonly Entity[] {
  const attack = entityAttack(context.world, actor);
  if (attack === undefined) return [];

  return attackTargets(context.world, actor, attack, context.spatial, isTarget);
}

function tryMoveEnemyTowardPosition(context: TurnContext, target: GridPoint, actor: Entity): boolean {
  const current = context.world.components.getEntityData(GridPos, actor);
  const next = context.spatial.nextStepToward(current, target);
  if (next !== undefined) {
    context.spatial.moveEntity(actor, next);
    setFacingDirection(context, actor, directionForStep({ dx: next.x - current.x, dy: next.y - current.y }));
    return true;
  }

  faceEntityToward(context, actor, target);
  return false;
}

function tryMoveEnemyAwayFromPosition(context: TurnContext, actor: Entity, target: GridPoint): boolean {
  const current = context.world.components.getEntityData(GridPos, actor);
  const currentDistance = manhattanDistance(current, target);
  const awayX = Math.sign(current.x - target.x);
  const awayY = Math.sign(current.y - target.y);
  const horizontalDistance = Math.abs(current.x - target.x);
  const verticalDistance = Math.abs(current.y - target.y);
  let best:
    | {
      readonly delta: GridDelta;
      readonly x: number;
      readonly y: number;
      readonly distance: number;
      readonly priority: number;
    }
    | undefined;

  for (let index = 0; index < CARDINAL_DELTAS.length; index++) {
    const delta = CARDINAL_DELTAS[index]!;
    const x = current.x + delta.dx;
    const y = current.y + delta.dy;
    if (context.spatial.positionBlocks(x, y)) continue;

    const distance = manhattanDistance({ x, y }, target);
    if (distance <= currentDistance) continue;
    const priority = movePriority(delta, awayX, awayY, horizontalDistance, verticalDistance, index);
    if (
      best === undefined ||
      distance > best.distance ||
      (distance === best.distance && priority < best.priority)
    ) {
      best = { delta, x, y, distance, priority };
    }
  }

  if (best === undefined) return false;
  context.spatial.moveEntity(actor, { x: best.x, y: best.y });
  setFacingDirection(context, actor, directionForStep(best.delta));
  return true;
}

function movePriority(
  delta: GridDelta,
  preferredDx: number,
  preferredDy: number,
  horizontalDistance: number,
  verticalDistance: number,
  cardinalIndex: number,
): number {
  const horizontalPreferred = preferredDx !== 0 && delta.dx === preferredDx && delta.dy === 0;
  const verticalPreferred = preferredDy !== 0 && delta.dy === preferredDy && delta.dx === 0;
  if (horizontalDistance >= verticalDistance) {
    if (horizontalPreferred) return 0;
    if (verticalPreferred) return preferredDx === 0 ? 0 : 1;
    return (preferredDx === 0 || preferredDy === 0 ? 1 : 2) + cardinalIndex;
  }
  if (verticalPreferred) return 0;
  if (horizontalPreferred) return preferredDy === 0 ? 0 : 1;
  return (preferredDx === 0 || preferredDy === 0 ? 1 : 2) + cardinalIndex;
}

function faceEntityToward(context: TurnContext, actor: Entity, target: GridPoint): void {
  const position = context.world.components.getEntityData(GridPos, actor);
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const delta = {
    dx: Math.sign(dx),
    dy: Math.sign(dy),
  };

  if (Math.abs(dx) >= Math.abs(dy) && delta.dx !== 0) {
    setFacingDirection(context, actor, directionForStep({ dx: delta.dx, dy: 0 }));
  } else if (delta.dy !== 0) {
    setFacingDirection(context, actor, directionForStep({ dx: 0, dy: delta.dy }));
  }
}

function setFacingDirection(context: TurnContext, actor: Entity, dir: CardinalDirection): void {
  context.world.components.setEntityData(Facing, actor, { dir });
}

function directionForStep(delta: GridDelta): CardinalDirection {
  if (delta.dx > 0) return Direction.East;
  if (delta.dx < 0) return Direction.West;
  if (delta.dy > 0) return Direction.South;
  return Direction.North;
}

function playerNoise(context: TurnContext, radius: number): NoiseStimulus | undefined {
  if (radius <= 0) return undefined;

  const position = playerPosition(context);
  return {
    x: position.x,
    y: position.y,
    radius,
  };
}
