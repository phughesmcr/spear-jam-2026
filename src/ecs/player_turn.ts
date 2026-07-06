import { type Entity, System, type World } from "@phughesmcr/miski";
import { Door, Facing, GridPos, Interactable, Locked, Npc, Secret, UplinkTerminal } from "@/src/ecs/components.ts";
import { attackTargetsForSelectedWeapon, attackWithSelectedWeapon, type DefeatEffectWriter } from "@/src/ecs/combat.ts";
import { collectItemAt, interactWithEntity, type PlayerInteractionResult } from "@/src/ecs/interactions.ts";
import {
  applyItemPickupToPlayer,
  heldKeysForPlayer,
  playerAmmoAmount,
  playerHasUplinkCode,
  playerHasWeapon,
  selectedPlayerWeapon,
  selectPlayerWeapon,
  spendPlayerAmmo,
} from "@/src/ecs/progression.ts";
import { playerTurnQuery } from "@/src/ecs/queries.ts";
import type { SpatialIndex } from "@/src/ecs/spatial.ts";
import { examineEntity } from "@/src/game/examine.ts";
import {
  type InteractVerb,
  type PlayerCommand,
  relativeMoveDirectionOffset,
  turnDirectionDelta,
} from "@/src/game/commands.ts";
import type { GameEvent } from "@/src/game/events.ts";
import type { NoiseStimulus } from "@/src/game/perception.ts";
import type { RandomSource } from "@/src/game/rng.ts";
import type { CommandSlot, TargetMarkerTone } from "@/src/game/state.ts";
import { playerWeaponSpec } from "@/src/game/weapons.ts";
import { directionDelta, type GridPoint, normalizeDirection } from "@/src/grid/direction.ts";

const MOVE_NOISE_RADIUS = 2;

export type PlayerActionResolution =
  | { readonly type: "immediate"; readonly events: readonly GameEvent[] }
  | { readonly type: "refreshVisibility"; readonly events: readonly GameEvent[] }
  | { readonly type: "consumeTurn"; readonly events: readonly GameEvent[]; readonly noise?: NoiseStimulus }
  | Extract<PlayerInteractionResult, { readonly type: "dialogue" | "uplinkTerminal" }>;

export type PlayerTurnContext = {
  readonly world: World;
  readonly player: Entity;
  readonly spatial: SpatialIndex;
  readonly random: RandomSource;
  readonly writeDefeatEffect?: DefeatEffectWriter;
};

export type PlayerTurnSystemContext = Omit<PlayerTurnContext, "player"> & {
  readonly command: PlayerCommand;
};

export type PlayerTurnSystem = (context: PlayerTurnSystemContext) => PlayerActionResolution;

export const playerTurnSystem = new System({
  name: "playerTurnSystem",
  query: playerTurnQuery,
  callback: (_components, players, context: PlayerTurnSystemContext): PlayerActionResolution => {
    if (players.count !== 1) throw new Error(`Expected exactly one player turn actor, found ${players.count}.`);
    return resolvePlayerAction({ ...context, player: players.indices[0]! }, context.command);
  },
});

function resolvePlayerAction(context: PlayerTurnContext, command: PlayerCommand): PlayerActionResolution {
  switch (command.type) {
    case "move":
      return resolvePlayerMoveAction(context, relativeMoveDirectionOffset(command.direction));
    case "turn":
      context.world.components.setEntityData(Facing, context.player, {
        dir: normalizeDirection(playerFacing(context) + turnDirectionDelta(command.direction)),
      });
      return { type: "refreshVisibility", events: [] };
    case "wait":
      return { type: "consumeTurn", events: [] };
    case "interact":
      return resolvePlayerInteraction(context, facedEntity(context), command.verb);
    case "examine":
      return { type: "immediate", events: [examineEntity(context.world, facedEntity(context))] };
    case "attack":
      return resolvePlayerAttackAction(context);
    case "smartAction":
      return resolvePlayerSmartAction(context);
    case "selectWeapon":
      return resolvePlayerSelectWeaponAction(context, command.slot);
  }
}

export function targetMarkerTone(context: PlayerTurnContext): TargetMarkerTone | undefined {
  const interactionTarget = smartActionInteractionTarget(context);
  if (interactionTarget !== undefined) {
    return context.world.components.entityHas(Locked, interactionTarget) ? "locked" : "use";
  }

  const selectedWeapon = selectedPlayerWeapon(context.world, context.player);
  const weapon = playerWeaponSpec(selectedWeapon);
  const ammoKind = weapon.ammo;
  if (
    (ammoKind === undefined || playerAmmoAmount(context.world, context.player, ammoKind) > 0) &&
    attackTargetsForSelectedWeapon(context.world, context.player, selectedWeapon, context.spatial).length > 0
  ) {
    return "danger";
  }

  const current = playerPosition(context);
  const delta = directionDelta(playerFacing(context));
  const x = current.x + delta.dx;
  const y = current.y + delta.dy;
  return !context.spatial.positionBlocks(x, y) && context.spatial.itemAt(x, y) !== undefined ? "loot" : undefined;
}

function resolvePlayerMoveAction(context: PlayerTurnContext, directionOffset: number): PlayerActionResolution {
  const delta = directionDelta(playerFacing(context) + directionOffset);
  const current = playerPosition(context);
  const faced = context.spatial.facedEntity(current, playerFacing(context) + directionOffset);
  if (
    faced !== undefined &&
    context.world.components.entityHas(Secret, faced) &&
    context.world.components.readEntityData(Door, faced)?.open === 0
  ) {
    return resolvePlayerInteraction(context, faced, "open");
  }

  const next = { x: current.x + delta.dx, y: current.y + delta.dy };
  if (context.spatial.positionBlocks(next.x, next.y)) return { type: "immediate", events: [] };

  context.spatial.moveEntity(context.player, next);
  const pickup = collectItemAt(context.world, context.spatial, next.x, next.y);
  return {
    type: "consumeTurn",
    events: pickup === undefined ? [] : applyItemPickupToPlayer(context.world, context.player, pickup),
    noise: playerNoise(context, MOVE_NOISE_RADIUS),
  };
}

function resolvePlayerSmartAction(context: PlayerTurnContext): PlayerActionResolution {
  const target = smartActionInteractionTarget(context);
  if (target !== undefined) return resolvePlayerInteraction(context, target);

  return resolvePlayerAttackAction(context);
}

function resolvePlayerInteraction(
  context: PlayerTurnContext,
  target: Entity | undefined,
  verb?: InteractVerb,
): PlayerActionResolution {
  const interaction = interactWithEntity(
    context.world,
    context.spatial,
    target,
    heldKeysForPlayer(context.world, context.player),
    playerHasUplinkCode(context.world, context.player),
    verb,
  );
  return interaction.type === "unchanged" ? { type: "immediate", events: interaction.events } : interaction;
}

function smartActionInteractionTarget(context: PlayerTurnContext): Entity | undefined {
  const target = facedEntity(context);
  if (target === undefined || !context.world.components.entityHas(Interactable, target)) return undefined;
  if (context.world.components.entityHas(Secret, target)) return undefined;

  const door = context.world.components.readEntityData(Door, target);
  if (door !== undefined) return door.open === 0 ? target : undefined;

  if (context.world.components.entityHas(Npc, target)) return target;
  if (context.world.components.entityHas(UplinkTerminal, target)) return target;
  return undefined;
}

function resolvePlayerAttackAction(context: PlayerTurnContext): PlayerActionResolution {
  const selectedWeapon = selectedPlayerWeapon(context.world, context.player);
  const weapon = playerWeaponSpec(selectedWeapon);
  const ammoKind = weapon.ammo;
  if (ammoKind !== undefined && !spendPlayerAmmo(context.world, context.player, ammoKind)) {
    return { type: "immediate", events: [{ type: "noAmmo", ammo: ammoKind }] };
  }

  const attackEvents = attackWithSelectedWeapon(
    context.world,
    context.player,
    selectedWeapon,
    context.spatial,
    context.random,
    context.writeDefeatEffect,
  );
  return {
    type: "consumeTurn",
    events: ammoKind === undefined ? attackEvents : [{ type: "ammoSpent", ammo: ammoKind, amount: 1 }, ...attackEvents],
    noise: playerNoise(context, weapon.noiseRadius),
  };
}

function resolvePlayerSelectWeaponAction(context: PlayerTurnContext, slot: CommandSlot): PlayerActionResolution {
  const label = playerWeaponSpec(slot).label;
  const available = playerHasWeapon(context.world, context.player, slot);
  if (available) selectPlayerWeapon(context.world, context.player, slot);
  return {
    type: "immediate",
    events: [{
      type: available ? "weaponSelected" : "weaponUnavailable",
      slot,
      label,
    }],
  };
}

function facedEntity(context: PlayerTurnContext): Entity | undefined {
  return context.spatial.facedEntity(playerPosition(context), playerFacing(context));
}

function playerPosition(context: PlayerTurnContext): GridPoint {
  return context.world.components.getEntityData(GridPos, context.player);
}

function playerFacing(context: PlayerTurnContext): number {
  return normalizeDirection(context.world.components.getEntityData(Facing, context.player).dir);
}

function playerNoise(context: PlayerTurnContext, radius: number): NoiseStimulus | undefined {
  if (radius <= 0) return undefined;

  const position = playerPosition(context);
  return {
    x: position.x,
    y: position.y,
    radius,
  };
}
