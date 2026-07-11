import { hasComponent, readComponent } from "@/src/ecs/components.ts";
import { type ActorIntent, facedEntity, type TurnContext } from "@/src/ecs/turn/actions.ts";
import type { PlayerCommand } from "@/src/game/commands.ts";
import type { Entity } from "turn-based-engine/ecs";

export function playerIntentsForCommand(context: TurnContext, command: PlayerCommand): readonly ActorIntent[] {
  switch (command.type) {
    case "move":
      return [{
        type: "move",
        actor: context.player,
        mode: { type: "relative", direction: command.direction },
      }];
    case "turn":
      return [{
        type: "face",
        actor: context.player,
        mode: { type: "turn", direction: command.direction },
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
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}

function smartActionIntents(context: TurnContext): readonly ActorIntent[] {
  const target = smartActionInteractionTarget(context);
  if (target !== undefined) return [{ type: "interact", actor: context.player, target }];

  return [{ type: "attack", actor: context.player, target: "enemies" }];
}

function smartActionInteractionTarget(context: TurnContext): Entity | undefined {
  const target = facedEntity(context);
  if (target === undefined || !hasComponent(context.runtime.game, target, "Interactable")) return undefined;
  if (hasComponent(context.runtime.game, target, "Secret")) return undefined;
  if (hasComponent(context.runtime.game, target, "Glass")) return undefined;

  const door = readComponent(context.runtime.game, target, "Door");
  if (door !== undefined) return door.open === 0 ? target : undefined;

  if (hasComponent(context.runtime.game, target, "Npc")) return target;
  if (hasComponent(context.runtime.game, target, "UplinkTerminal")) return target;
  return undefined;
}
