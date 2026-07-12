import { enemyAttackFacesTarget } from "@/src/content/enemies.ts";
import {
  attackEntity,
  attackTargets,
  attackWithSelectedWeapon,
  type DefeatEffectWriter,
  entityAttack,
} from "@/src/ecs/combat.ts";
import { hasComponent, readComponent } from "@/src/ecs/components.ts";
import { collectItemAt, interactWithEntity, openDoor, spearPickupDialogue } from "@/src/ecs/interactions.ts";
import {
  applyItemPickupToPlayer,
  heldKeysForPlayer,
  playerHasSpear,
  playerHasUplinkCode,
  playerHasWeapon,
  selectPlayerWeapon,
  spendPlayerAmmo,
} from "@/src/ecs/progression.ts";
import type { GameRuntime } from "@/src/ecs/runtime.ts";
import type { InteractVerb } from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import { examineEntity } from "@/src/game/examine.ts";
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
} from "@/src/grid/direction.ts";
import { type RelativeMoveDirection, TerrainBlock, type TurnDirection } from "turn-based-engine/crawler";
import type { Entity } from "turn-based-engine/ecs";

const MOVE_NOISE_RADIUS = 2;

export type TurnContext = {
  readonly runtime: GameRuntime;
  readonly player: Entity;
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

export type PlayerMoveMode = { readonly type: "relative"; readonly direction: RelativeMoveDirection };
export type EnemyMoveMode = { readonly type: "toward"; readonly target: GridPoint } | {
  readonly type: "awayFrom";
  readonly target: GridPoint;
};
export type FaceMode = { readonly type: "turn"; readonly direction: TurnDirection } | {
  readonly type: "toward";
  readonly target: GridPoint;
};

export type IntentResolution = {
  readonly events: readonly GameEvent[];
  readonly cost?: "free" | "turn";
  readonly noise?: NoiseStimulus;
  readonly dialogue?: { readonly target?: Entity; readonly dialogue: DialogueState };
  readonly terminal?: Entity;
  readonly outcome?: "victory";
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
      return { events: [], cost: "free", acted: true };
    case "attack":
      return intent.target === "enemies" ?
        resolvePlayerAttackIntent(context, intent.actor) :
        resolveEnemyAttackIntent(context, intent.actor);
    case "interact":
      return resolveInteractionIntent(context, intent.target, intent.verb);
    case "wait":
      context.runtime.crawler.dispatchVoid({ type: "wait", entity: intent.actor });
      return { events: [], cost: "turn", acted: true };
    case "selectWeapon":
      return resolveSelectWeaponIntent(context, intent.actor, intent.slot);
    case "examine":
      return { events: [examineEntity(context.runtime, intent.target)], cost: "free", acted: true };
  }
}

export function facedEntity(context: TurnContext): Entity | undefined {
  const position = playerPosition(context);
  const delta = directionDelta(playerFacing(context));
  const x = position.x + delta.dx;
  const y = position.y + delta.dy;
  const occupant = context.runtime.crawler.entityAt(x, y, TerrainBlock.Movement);
  if (occupant !== undefined) return occupant;
  return context.runtime.crawler.findEntityAt(
    x,
    y,
    (entity) => hasComponent(context.runtime.game, entity, "Interactable"),
  ) ?? context.runtime.crawler.findEntityAt(
    x,
    y,
    (entity) => hasComponent(context.runtime.game, entity, "Item"),
  );
}

export function playerPosition(context: TurnContext): GridPoint {
  return context.runtime.crawler.entityPosition(context.player);
}

export function playerFacing(context: TurnContext): number {
  const facing = context.runtime.crawler.entityFacing(context.player);
  if (facing === undefined) throw new Error("Player is missing a facing direction.");
  return facing;
}

function resolvePlayerMoveIntent(context: TurnContext, actor: Entity, mode: PlayerMoveMode): IntentResolution {
  const current = context.runtime.crawler.entityPosition(actor);
  const facing = context.runtime.crawler.entityFacing(actor);
  if (facing === undefined) return { events: [], cost: "free" };
  const relativeOffset = mode.direction === "forward" ?
    0 :
    mode.direction === "right" ?
    1 :
    mode.direction === "backward" ?
    2 :
    -1;
  const delta = directionDelta(facing + relativeOffset);
  const faced = context.runtime.crawler.entityAt(current.x + delta.dx, current.y + delta.dy, TerrainBlock.Movement);
  if (
    faced !== undefined && hasComponent(context.runtime.game, faced, "Secret") &&
    readComponent(context.runtime.game, faced, "Door")?.open === 0
  ) {
    return resolveInteractionIntent(context, faced, "open");
  }
  const result = context.runtime.crawler.dispatch({ type: "move", entity: actor, direction: mode.direction });
  if (result.events[0]?.type !== "entityMoved") return { events: [], cost: "free" };
  const next = context.runtime.crawler.entityPosition(actor);
  const pickup = collectItemAt(context.runtime, actor, next.x, next.y);
  if (pickup === undefined) {
    return { events: [], cost: "turn", noise: playerNoise(context, MOVE_NOISE_RADIUS), acted: true };
  }
  const events = applyItemPickupToPlayer(context.runtime.game, actor, pickup);
  if (pickup.type === "spear") {
    return {
      events,
      cost: "free",
      dialogue: { dialogue: spearPickupDialogue() },
      acted: true,
    };
  }
  return {
    events,
    cost: "turn",
    noise: playerNoise(context, MOVE_NOISE_RADIUS),
    acted: true,
  };
}

function resolveEnemyMoveIntent(context: TurnContext, actor: Entity, mode: EnemyMoveMode): IntentResolution {
  const moved = mode.type === "toward" ?
    tryMoveEnemyTowardPosition(context, mode.target, actor) :
    tryMoveEnemyAwayFromPosition(context, actor, mode.target);
  return { events: [], acted: moved };
}

function resolveFaceIntent(context: TurnContext, actor: Entity, mode: FaceMode): void {
  if (mode.type === "turn") {
    context.runtime.crawler.dispatchVoid({ type: "turn", entity: actor, direction: mode.direction });
  } else faceEntityToward(context, actor, mode.target);
}

function resolveInteractionIntent(
  context: TurnContext,
  target: Entity | undefined,
  verb?: InteractVerb,
): IntentResolution {
  const interaction = interactWithEntity(
    context.runtime,
    target,
    heldKeysForPlayer(context.runtime.game, context.player),
    playerHasUplinkCode(context.runtime.game, context.player),
    playerHasSpear(context.runtime.game, context.player),
    verb,
  );
  switch (interaction.type) {
    case "unchanged":
      return { events: interaction.events, cost: "free", acted: interaction.events.length > 0 };
    case "consumeTurn":
      return { events: interaction.events, cost: "turn", acted: true };
    case "victory":
      return { events: interaction.events, cost: "free", outcome: "victory", acted: true };
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
  const faced = facedEntity(context);
  if (
    faced !== undefined && hasComponent(context.runtime.game, faced, "Glass") &&
    readComponent(context.runtime.game, faced, "Door")?.open === 0
  ) {
    openDoor(context.runtime, faced);
    return { events: [{ type: "doorShattered", entity: faced }], cost: "turn", acted: true };
  }
  const selected = readComponent(context.runtime.game, actor, "PlayerEquipment")?.selectedWeapon as
    | CommandSlot
    | undefined;
  if (selected === undefined) return { events: [], cost: "free" };
  const weapon = playerWeaponSpec(selected);
  if (weapon.ammo !== undefined && !spendPlayerAmmo(context.runtime.game, actor, weapon.ammo)) {
    return { events: [{ type: "noAmmo", ammo: weapon.ammo }], cost: "free", acted: true };
  }
  const events = attackWithSelectedWeapon(context.runtime, actor, selected, context.random, context.writeDefeatEffect);
  return {
    events: weapon.ammo === undefined ? events : [{ type: "ammoSpent", ammo: weapon.ammo, amount: 1 }, ...events],
    cost: "turn",
    noise: playerNoise(context, weapon.noiseRadius),
    acted: true,
  };
}

function resolveEnemyAttackIntent(context: TurnContext, actor: Entity): IntentResolution {
  const attack = entityAttack(context.runtime, actor);
  if (attack === undefined) return { events: [] };
  if (enemyAttackFacesTarget(attack.pattern)) faceEntityToward(context, actor, playerPosition(context));
  const targets = attackTargets(context.runtime, actor, attack, (candidate) => candidate === context.player);
  const events: GameEvent[] = [];
  for (const target of targets) {
    events.push(...attackEntity(context.runtime, actor, target, attack, context.random, context.writeDefeatEffect));
  }
  return { events, acted: events.length > 0 };
}

function resolveSelectWeaponIntent(context: TurnContext, actor: Entity, slot: CommandSlot): IntentResolution {
  const available = playerHasWeapon(context.runtime.game, actor, slot);
  if (available) selectPlayerWeapon(context.runtime.game, actor, slot);
  return {
    events: [{ type: available ? "weaponSelected" : "weaponUnavailable", slot, label: playerWeaponSpec(slot).label }],
    cost: "free",
    acted: true,
  };
}

function tryMoveEnemyTowardPosition(context: TurnContext, target: GridPoint, actor: Entity): boolean {
  const current = context.runtime.crawler.entityPosition(actor);
  const next = context.runtime.pathfinder.nextStepToward(current, target);
  if (next === undefined) {
    faceEntityToward(context, actor, target);
    return false;
  }
  const direction = directionForStep({ dx: next.x - current.x, dy: next.y - current.y });
  const result = context.runtime.crawler.dispatch({ type: "step", entity: actor, direction });
  return result.events[0]?.type === "entityMoved";
}

function tryMoveEnemyAwayFromPosition(context: TurnContext, actor: Entity, target: GridPoint): boolean {
  const current = context.runtime.crawler.entityPosition(actor);
  const currentDistance = manhattanDistance(current, target);
  const awayX = Math.sign(current.x - target.x);
  const awayY = Math.sign(current.y - target.y);
  const horizontalDistance = Math.abs(current.x - target.x);
  const verticalDistance = Math.abs(current.y - target.y);
  let best: { readonly delta: GridDelta; readonly distance: number; readonly priority: number } | undefined;
  for (let index = 0; index < CARDINAL_DELTAS.length; index++) {
    const delta = CARDINAL_DELTAS[index]!;
    const x = current.x + delta.dx;
    const y = current.y + delta.dy;
    if (context.runtime.crawler.blocksAt(x, y, TerrainBlock.Movement)) continue;
    const distance = manhattanDistance({ x, y }, target);
    if (distance <= currentDistance) continue;
    const priority = movePriority(delta, awayX, awayY, horizontalDistance, verticalDistance, index);
    if (best === undefined || distance > best.distance || (distance === best.distance && priority < best.priority)) {
      best = { delta, distance, priority };
    }
  }
  if (best === undefined) return false;
  const result = context.runtime.crawler.dispatch({
    type: "step",
    entity: actor,
    direction: directionForStep(best.delta),
  });
  return result.events[0]?.type === "entityMoved";
}

function movePriority(
  delta: GridDelta,
  preferredDx: number,
  preferredDy: number,
  horizontal: number,
  vertical: number,
  index: number,
): number {
  const horizontalPreferred = preferredDx !== 0 && delta.dx === preferredDx && delta.dy === 0;
  const verticalPreferred = preferredDy !== 0 && delta.dy === preferredDy && delta.dx === 0;
  if (horizontal >= vertical) {
    if (horizontalPreferred) return 0;
    if (verticalPreferred) return preferredDx === 0 ? 0 : 1;
    return (preferredDx === 0 || preferredDy === 0 ? 1 : 2) + index;
  }
  if (verticalPreferred) return 0;
  if (horizontalPreferred) return preferredDy === 0 ? 0 : 1;
  return (preferredDx === 0 || preferredDy === 0 ? 1 : 2) + index;
}

function faceEntityToward(context: TurnContext, actor: Entity, target: GridPoint): void {
  const position = context.runtime.crawler.entityPosition(actor);
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
    setFacingDirection(context, actor, dx > 0 ? Direction.East : Direction.West);
  } else if (dy !== 0) {
    setFacingDirection(context, actor, dy > 0 ? Direction.South : Direction.North);
  }
}

function setFacingDirection(context: TurnContext, actor: Entity, direction: CardinalDirection): void {
  context.runtime.crawler.setFacing(actor, direction);
}

function directionForStep(delta: GridDelta): CardinalDirection {
  if (delta.dx > 0) return Direction.East;
  if (delta.dx < 0) return Direction.West;
  if (delta.dy > 0) return Direction.South;
  return Direction.North;
}

function playerNoise(context: TurnContext, radius: number): NoiseStimulus | undefined {
  if (radius <= 0) return undefined;
  return { ...playerPosition(context), radius };
}
