import { useEffect, useRef } from "preact/hooks";
import { startGame } from "@/src/entry.ts";

export default function Game({ seed }: { seed: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let activeGame: Disposable | undefined;

    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");

      activeGame = startGame({
        canvas: canvasRef.current,
        ctx: ctx,
        window: globalThis.window,
        seed,
      });
    }

    return () => {
      activeGame?.[Symbol.dispose]();
    };
  }, [seed]);

  return <canvas id="gameCanvas" ref={canvasRef}></canvas>;
}
