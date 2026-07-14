import "../assets/styles.css";
import { bootQueryFromSearch } from "../src/app/boot_query.ts";
import { startGame } from "../src/app/start.ts";

function main(): void {
  const canvas = document.getElementById("gameCanvas");
  const gate = document.getElementById("launch-gate");
  const trigger = document.getElementById("launch-trigger");
  if (
    !(canvas instanceof HTMLCanvasElement) ||
    gate === null ||
    !(trigger instanceof HTMLButtonElement)
  ) {
    console.error("itch boot: missing canvas or launch gate elements.");
    return;
  }

  let started = false;
  trigger.addEventListener("click", () => {
    if (started) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      console.error("Failed to get canvas context; the game cannot start.");
      return;
    }

    const { seed, startMapName, cheat } = bootQueryFromSearch(location.search);
    const game = startGame({
      canvas,
      ctx,
      seed,
      startMapName,
      cheat,
      host: globalThis.window,
    });
    started = true;
    void game.unlockAudio();
    gate.remove();
  });
  trigger.focus();
}

main();
