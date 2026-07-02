import { assertEquals } from "@std/assert";
import { VisibilityMap } from "@/src/game/visibility.ts";
import { Direction } from "@/src/grid/direction.ts";

Deno.test("VisibilityMap reveals tiles in radius with line of sight", () => {
  const visibility = new VisibilityMap({ width: 5, height: 3 });

  visibility.revealFrom({ x: 2, y: 1 }, {
    radius: 1,
    blocksSight: () => false,
  });

  assertEquals(visibleTiles(visibility, 5, 3), [
    "2,0",
    "1,1",
    "2,1",
    "3,1",
    "2,2",
  ]);
  assertEquals(visibility.isVisible(0, 1), false);
});

Deno.test("VisibilityMap remembers explored tiles after they leave current view", () => {
  const visibility = new VisibilityMap({ width: 5, height: 1 });

  visibility.revealFrom({ x: 0, y: 0 }, {
    radius: 4,
    blocksSight: () => false,
  });
  visibility.revealFrom({ x: 0, y: 0 }, {
    radius: 1,
    blocksSight: () => false,
  });

  assertEquals(visibility.isVisible(4, 0), false);
  assertEquals(visibility.isExplored(4, 0), true);
});

Deno.test("VisibilityMap can restrict visible tiles to a 90-degree facing cone", () => {
  const visibility = new VisibilityMap({ width: 5, height: 5 });

  visibility.revealFrom({ x: 2, y: 2 }, {
    radius: 3,
    facing: Direction.East,
    blocksSight: () => false,
  });

  assertEquals(visibility.isVisible(2, 2), true);
  assertEquals(visibility.isVisible(3, 2), true);
  assertEquals(visibility.isVisible(4, 0), true);
  assertEquals(visibility.isVisible(4, 4), true);
  assertEquals(visibility.isVisible(2, 1), false);
  assertEquals(visibility.isVisible(1, 2), false);
  assertEquals(visibility.isVisible(3, 0), false);
});

Deno.test("VisibilityMap reveals opaque tiles but hides tiles behind them", () => {
  const visibility = new VisibilityMap({ width: 5, height: 1 });

  visibility.revealFrom({ x: 0, y: 0 }, {
    radius: 4,
    blocksSight: (x) => x === 2,
  });

  assertEquals(visibility.isVisible(1, 0), true);
  assertEquals(visibility.isVisible(2, 0), true);
  assertEquals(visibility.isVisible(3, 0), false);
  assertEquals(visibility.isVisible(4, 0), false);
});

Deno.test("VisibilityMap treats out-of-bounds reads as hidden and unexplored", () => {
  const visibility = new VisibilityMap({ width: 2, height: 2 });

  visibility.revealFrom({ x: 0, y: 0 }, {
    radius: 2,
    blocksSight: () => false,
  });

  assertEquals(visibility.isVisible(-1, 0), false);
  assertEquals(visibility.isExplored(2, 0), false);
});

function visibleTiles(visibility: VisibilityMap, width: number, height: number): readonly string[] {
  const tiles: string[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (visibility.isVisible(x, y)) tiles.push(`${x},${y}`);
    }
  }
  return tiles;
}
