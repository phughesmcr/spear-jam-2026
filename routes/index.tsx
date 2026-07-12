import Game from "../islands/Game.tsx";
import { bootQueryFromSearch } from "../src/boot_query.ts";
import { define } from "../utils.ts";

export default define.page(function Home(ctx) {
  const { seed, startMapName, cheat } = bootQueryFromSearch(ctx.url.search);

  return (
    <main id="stage">
      <Game seed={seed} startMapName={startMapName} cheat={cheat} />
    </main>
  );
});
