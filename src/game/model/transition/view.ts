import type { ViewMode } from "@/src/game/model/state.ts";
import type { GameModel, GameTransition } from "@/src/game/model/transition/contracts.ts";
import { done } from "@/src/game/model/transition/result.ts";

export function toggleView(model: GameModel): GameTransition {
  const viewMode: ViewMode = model.viewMode === "firstPerson" ? "topDown" : "firstPerson";
  return done({ ...model, viewMode }, [{ type: "resetFirstPerson" }, { type: "render" }]);
}
