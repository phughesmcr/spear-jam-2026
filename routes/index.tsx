import Game from "../islands/Game.tsx";
import { define } from "../utils.ts";

export default define.page(function Home(ctx) {
  const seedParam = Number.parseInt(
    ctx.url.searchParams.get("seed") ?? "42",
    10,
  );
  const seed = Number.isFinite(seedParam) ? seedParam : 42;
  const mapName = ctx.url.searchParams.get("map") ?? undefined;
  ctx.state.seed = seed;

  return (
    <main id="stage">
      <Game seed={seed} startMapName={mapName} />
    </main>
  );
});
