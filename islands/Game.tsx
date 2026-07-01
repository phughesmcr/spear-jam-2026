import { useEffect, useRef } from "preact/hooks";

export default function Game({ seed }: { seed: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "red";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // print seed to canvas
        ctx.font = "16px Arial";
        ctx.fillStyle = "white";
        ctx.fillText("Seed: " + seed, 10, 20);
      }
    }
  }, []);

  return (
    <canvas ref={canvasRef} id="game-canvas" width="100%" height="100%">
    </canvas>
  );
}
