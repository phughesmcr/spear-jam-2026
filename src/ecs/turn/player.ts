import type { Entity } from "@phughesmcr/miski";
import { Door, Interactable, Locked, Npc, Secret, UplinkTerminal } from "@/src/ecs/components.ts";
import { attackTargetsForSelectedWeapon } from "@/src/ecs/combat.ts";
import { playerAmmoAmount, selectedPlayerWeapon } from "@/src/ecs/progression.ts";
import {
  type ActorIntent,
  facedEntity,
  playerFacing,
  playerPosition,
  type TurnContext,
} from "@/src/ecs/turn/actions.ts";
import { type PlayerCommand, relativeMoveDirectionOffset, turnDirectionDelta } from "@/src/game/commands.ts";
import type { TargetMarkerTone } from "@/src/game/state.ts";
import { playerWeaponSpec } from "@/src/game/weapons.ts";
import { directionDelta } from "@/src/grid/direction.ts";

export function playerIntentsForCommand(context: TurnContext, command: PlayerCommand): readonly ActorIntent[] {
  switch (command.type) {
    case "move":
      return [{
        type: "move",
        actor: context.player,
        mode: { type: "relative", directionOffset: relativeMoveDirectionOffset(command.direction) },
      }];
    case "turn":
      return [{
        type: "face",
        actor: context.player,
        mode: { type: "turn", directionDelta: turnDirectionDelta(command.direction) },
      }];
    case "wait":
      return [{ type: "wait", actor: context.player }];
    case "interact":
      return [{ type: "interact", actor: context.player, target: facedEntity(context), verb: command.verb }];
    case "examine":
      return [{ type: "examine", actor: context.player, target: facedEntity(context) }];
    case "attack":
      return [{ type: "attack", actor: context.player, target: "enemies" }];
    case "smartAction":
      return smartActionIntents(context);
    case "selectWeapon":
      return [{ type: "selectWeapon", actor: context.player, slot: command.slot }];
  }
}

export function targetMarkerTone(context: TurnContext): TargetMarkerTone | undefined {
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

function smartActionIntents(context: TurnContext): readonly ActorIntent[] {
  const target = smartActionInteractionTarget(context);
  if (target !== undefined) return [{ type: "interact", actor: context.player, target }];

  return [{ type: "attack", actor: context.player, target: "enemies" }];
}

function smartActionInteractionTarget(context: TurnContext): Entity | undefined {
  const target = facedEntity(context);
  if (target === undefined || !context.world.components.entityHas(Interactable, target)) return undefined;
  if (context.world.components.entityHas(Secret, target)) return undefined;

  const door = context.world.components.readEntityData(Door, target);
  if (door !== undefined) return door.open === 0 ? target : undefined;

  if (context.world.components.entityHas(Npc, target)) return target;
  if (context.world.components.entityHas(UplinkTerminal, target)) return target;
  return undefined;
}
