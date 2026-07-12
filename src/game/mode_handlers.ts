import type { GameCommand } from "@/src/game/commands.ts";
import type { GameEffect, GameModel, GameTransition } from "@/src/game/transition.ts";
import type { PointerPhase } from "@/src/input/pointer.ts";

export function done(model: GameModel, effects: readonly GameEffect[] = []): GameTransition {
  return { model, effects };
}

/**
 * Run the handler for `command.type` if present; otherwise ignore the command.
 * Collapses the repeated "long switch of no-ops + a few real cases" pattern in mode handlers.
 */
export function dispatchCommand(
  model: GameModel,
  command: GameCommand,
  handlers: {
    readonly [K in GameCommand["type"]]?: (command: Extract<GameCommand, { type: K }>) => GameTransition;
  },
): GameTransition {
  const handler = handlers[command.type] as ((command: GameCommand) => GameTransition) | undefined;
  return handler === undefined ? done(model) : handler(command);
}

/**
 * Shared pointer phase switch for mode handlers. `move` defaults to a no-op transition.
 */
export function pointerGesture(
  model: GameModel,
  phase: PointerPhase,
  handlers: {
    readonly move?: () => GameTransition;
    readonly down: () => GameTransition;
    readonly up: () => GameTransition;
    readonly cancel: () => GameTransition;
  },
): GameTransition {
  switch (phase) {
    case "move":
      return handlers.move?.() ?? done(model);
    case "down":
      return handlers.down();
    case "up":
      return handlers.up();
    case "cancel":
      return handlers.cancel();
    default: {
      const _exhaustive: never = phase;
      return _exhaustive;
    }
  }
}
