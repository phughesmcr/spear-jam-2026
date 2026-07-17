import { startGame } from "@/src/app/start.ts";
import { useEffect, useRef, useState } from "preact/hooks";

export default function Game(
  { seed, startMapName, cheat }: { seed: number; startMapName?: string; cheat?: boolean },
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeGameRef = useRef<ReturnType<typeof startGame>>();
  const [started, setStarted] = useState(false);

  useEffect(() => {
    return () => {
      activeGameRef.current?.[Symbol.dispose]();
      activeGameRef.current = undefined;
    };
  }, []);

  function handleEnter(): void {
    if (activeGameRef.current !== undefined) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", {
      alpha: false,
      desynchronized: false,
      colorSpace: "srgb",
      willReadFrequently: false,
    });
    if (canvas === null || !ctx) {
      console.error("Failed to get canvas context; the game cannot start.");
      return;
    }

    const game = startGame({
      canvas,
      ctx,
      startMapName,
      cheat,
      host: globalThis.window,
      seed,
    });
    activeGameRef.current = game;
    void game.unlockAudio();
    setStarted(true);
  }

  return (
    <>
      <canvas id="gameCanvas" ref={canvasRef} aria-label="Spear of Destiny game"></canvas>
      {!started && (
        <div class="launch-gate">
          <button
            type="button"
            class="launch-gate__trigger"
            aria-label="I am over 18"
            aria-describedby="launch-instruction"
            autoFocus
            onClick={handleEnter}
          >
            <span class="launch-gate__panel">
              <span class="launch-gate__status">AGE RESTRICTED CONTENT</span>
              <span class="launch-gate__title">18+</span>
              <span id="launch-instruction" class="launch-gate__instruction">
                I AM OVER 18
              </span>
              <span class="launch-gate__note">CLICK OR PRESS ENTER TO CONFIRM</span>
            </span>
          </button>
        </div>
      )}
    </>
  );
}
