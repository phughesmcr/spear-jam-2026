import { SHIPPED_GAME } from "@/src/game/content/shipped.ts";
import { createGameModel, createGameTransition } from "@/src/game/model/transition/mod.ts";

export { createGameModel };
export const transition = createGameTransition(SHIPPED_GAME.dialogue);
export type { GameModel } from "@/src/game/model/transition/mod.ts";
