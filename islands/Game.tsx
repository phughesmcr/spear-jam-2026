import { startGame } from "@/src/entry.ts";
import { useEffect, useRef } from "preact/hooks";

export default function Game({ seed, startMapName }: { seed: number; startMapName?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let activeGame: Disposable | undefined;

    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        console.error("Failed to get canvas context; the game cannot start.");
        return;
      }

      activeGame = startGame({
        canvas,
        ctx,
        startMapName,
        host: globalThis.window,
        seed,
      });
    }

    return () => {
      activeGame?.[Symbol.dispose]();
    };
  }, [seed, startMapName]);

  return <canvas id="gameCanvas" ref={canvasRef}></canvas>;
}
