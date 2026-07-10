import Game from "@/islands/Game.tsx";
import { assertStringIncludes } from "@std/assert";
import { h } from "preact";
import { renderToString } from "preact-render-to-string";

Deno.test("game renders an accessible launch gate before the canvas starts", () => {
  const html = renderToString(h(Game, { seed: 42 }));

  assertStringIncludes(html, 'class="launch-gate"');
  assertStringIncludes(html, '<button type="button"');
  assertStringIncludes(html, "AGE RESTRICTED CONTENT");
  assertStringIncludes(html, "18+");
  assertStringIncludes(html, "I AM OVER 18");
  assertStringIncludes(html, '<canvas id="gameCanvas"');
});
