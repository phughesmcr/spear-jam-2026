import { assert, assertAlmostEquals, assertEquals, assertNotEquals, assertThrows } from "@std/assert";
import { DrawableKind, spriteAppearance, SpriteId } from "@/src/ecs/drawables.ts";
import type { DrawableEntity, LightEntity } from "@/src/ecs/drawables.ts";
import type { SpriteId as SpriteIdType } from "@/src/ecs/components.ts";
import { Direction } from "@/src/grid/direction.ts";
import type { CardinalDirection } from "@/src/grid/direction.ts";
import { createGameMap, TexturePack } from "@/src/map/map.ts";
import type { GameMap } from "@/src/map/map.ts";
import { GAME_MAPS } from "@/src/map/maps.ts";
import { createFirstPersonRenderer } from "@/src/render/first_person.ts";
import type { FirstPersonRenderSession } from "@/src/render/first_person.ts";
import type { RaycastScene } from "@/src/render/raycast/scene.ts";

type FakeImageEvent = "load" | "error";
type FakeImageListener = () => void;

const SPRITE_JOHN = firstPersonSlot(SpriteId.John);

function firstPersonSlot(spriteId: SpriteIdType): number {
  const slot = spriteAppearance(spriteId).firstPersonSlot;
  if (slot === undefined) throw new Error(`Sprite ${spriteId} has no first-person slot.`);
  return slot;
}

class FakeImage {
  decoding: "async" | "auto" | "sync" = "auto";
  src = "";
  private readonly listeners: Record<FakeImageEvent, FakeImageListener[]> = {
    load: [],
    error: [],
  };

  addEventListener(type: FakeImageEvent, listener: FakeImageListener): void {
    this.listeners[type].push(listener);
  }
}

class FakeDocument {
  readonly images: FakeImage[] = [];

  createElement(tagName: string): FakeImage {
    if (tagName !== "img") throw new Error(`Unexpected tag ${tagName}.`);
    const image = new FakeImage();
    this.images.push(image);
    return image;
  }
}

class FakeCanvasContext {
  imageSmoothingEnabled = true;
  readonly document = new FakeDocument();
  readonly canvas = { ownerDocument: this.document };

  drawImage(..._args: unknown[]): void {
  }
}

class FakeOffscreenCanvasRenderingContext2D {
  createImageData(width: number, height: number): ImageData {
    return new ImageData(width, height);
  }

  putImageData(_imageData: ImageData, _dx: number, _dy: number): void {
  }
}

class FakeOffscreenCanvas {
  readonly width: number;
  readonly height: number;
  private readonly context = new FakeOffscreenCanvasRenderingContext2D();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(contextId: string): FakeOffscreenCanvasRenderingContext2D | null {
    return contextId === "2d" ? this.context : null;
  }
}

function withFakeOffscreenCanvas(run: () => void): void {
  const original = globalThis.OffscreenCanvas;
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    configurable: true,
    writable: true,
    value: FakeOffscreenCanvas as unknown as typeof OffscreenCanvas,
  });
  try {
    run();
  } finally {
    Object.defineProperty(globalThis, "OffscreenCanvas", {
      configurable: true,
      writable: true,
      value: original,
    });
  }
}

function withFakePerformanceNow(nowMs: number, run: () => void): void {
  const hadOwnNow = Object.hasOwn(performance, "now");
  const ownNow = Object.getOwnPropertyDescriptor(performance, "now");
  Object.defineProperty(performance, "now", {
    configurable: true,
    writable: true,
    value: (): number => nowMs,
  });
  try {
    run();
  } finally {
    if (hadOwnNow && ownNow !== undefined) {
      Object.defineProperty(performance, "now", ownNow);
    } else {
      delete (performance as { now?: () => number }).now;
    }
  }
}

function withFakeRequestAnimationFrame(run: () => void): number {
  const hadOwnRaf = Object.hasOwn(globalThis, "requestAnimationFrame");
  const ownRaf = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  let scheduled = 0;
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    writable: true,
    value: (_callback: FrameRequestCallback): number => {
      scheduled++;
      return scheduled;
    },
  });
  try {
    run();
    return scheduled;
  } finally {
    if (hadOwnRaf && ownRaf !== undefined) {
      Object.defineProperty(globalThis, "requestAnimationFrame", ownRaf);
    } else {
      delete (globalThis as { requestAnimationFrame?: typeof requestAnimationFrame }).requestAnimationFrame;
    }
  }
}

function playerDrawable(x: number, y: number, dir: CardinalDirection): DrawableEntity {
  return { kind: DrawableKind.Player, entity: 1, x, y, dir, spriteId: SpriteId.Player };
}

function sessionFor(
  map: ReturnType<typeof createGameMap>,
  drawables: readonly DrawableEntity[],
  lights: readonly LightEntity[] = [],
): FirstPersonRenderSession {
  return {
    map,
    forEachDrawable(visit): void {
      for (const drawable of drawables) visit(drawable);
    },
    forEachLight(visit): void {
      for (const light of lights) visit(light);
    },
  };
}

function sceneForMap(map: GameMap): RaycastScene {
  return createFirstPersonRenderer().sceneForMap(map);
}

Deno.test("sceneForMap uses terrain palette texture refs for wall and plane slots", () => {
  const map = createGameMap(
    "Textured",
    [[1, 2, 3]],
    [],
    {
      palette: [
        { id: 1, color: "#000000", floor_texture: `${TexturePack.Pack1}:0,0`, ceiling_texture: "ceiling" },
        { id: 2, color: "#888888", wall_texture: `${TexturePack.Pack2}:3,2`, blocking: true },
        { id: 3, color: "#111111", floor_texture: "floor", ceiling_texture: `${TexturePack.Pack3}:4,3` },
      ],
    },
  );

  const scene = sceneForMap(map);
  const customFloorSlot = scene.floors[0]!;
  const defaultCeilingSlot = scene.ceilings[0]!;
  const customWallSlot = scene.walls[1]!;
  const defaultFloorSlot = scene.floors[2]!;
  const customCeilingSlot = scene.ceilings[2]!;

  assert(customFloorSlot > 0);
  assert(customWallSlot > 0);
  assert(customCeilingSlot > 0);
  assertNotEquals(customFloorSlot, defaultFloorSlot);
  assertNotEquals(customWallSlot, 1);
  assertNotEquals(customCeilingSlot, defaultCeilingSlot);
  assertEquals(scene.floors[1], 0);
  assertEquals(scene.ceilings[1], 0);
});

Deno.test("sceneForMap rejects texture refs outside the 5x4 pack grid", () => {
  const map = createGameMap(
    "Invalid Texture",
    [[1]],
    [],
    {
      palette: [
        { id: 1, color: "#000000", floor_texture: `${TexturePack.Pack1}:5,0`, ceiling_texture: "ceiling" },
      ],
    },
  );

  assertThrows(() => sceneForMap(map), Error, "5x4");
});

Deno.test("sceneForMap builds static scenes for authored textured maps", () => {
  for (const map of GAME_MAPS) {
    const scene = sceneForMap(map);
    assert(scene.floors.some((texture) => texture > 0), `${map.name} should have floor textures.`);
    assert(scene.ceilings.some((texture) => texture > 0), `${map.name} should have ceiling textures.`);
    assert(scene.walls.some((texture) => texture > 0), `${map.name} should have wall textures.`);
  }
});

Deno.test("first-person rendering updates flickering lights and schedules repaint", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "Flicker",
      [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ],
      [],
      {
        palette: [
          { id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
        ],
      },
    );
    const drawables: DrawableEntity[] = [
      playerDrawable(1, 1, Direction.East),
    ];
    const session = sessionFor(map, drawables, [
      {
        entity: 2,
        x: 1,
        y: 1,
        red: 255,
        green: 255,
        blue: 255,
        radius: 2,
        flickerAmount: 1,
        flickerSpeed: 7,
      },
    ]);
    const renderer = createFirstPersonRenderer();
    const ctx = new FakeCanvasContext() as unknown as CanvasRenderingContext2D;

    const scheduled = withFakeRequestAnimationFrame((): void => {
      withFakePerformanceNow(0, (): void => {
        renderer.render(ctx, { x: 0, y: 0, width: 64, height: 64 }, session, undefined, () => {});
      });
    });
    const scene = renderer.sceneForMap(map);
    const firstAdjacentLight = scene.lightRed[1 * 3 + 2]!;

    withFakePerformanceNow(250, (): void => {
      renderer.render(ctx, { x: 0, y: 0, width: 64, height: 64 }, session);
    });

    assertNotEquals(scene.lightRed[1 * 3 + 2], firstAdjacentLight);
    assertEquals(scheduled, 1);
  });
});

Deno.test("first-person rendering keeps open doors in the raycast scene for jambs", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "Open Door Jambs",
      [
        [2, 2, 2, 2, 2],
        [2, 1, 1, 1, 2],
        [2, 2, 2, 2, 2],
      ],
      [],
      {
        palette: [
          { id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { id: 2, color: "#ffffff", wall_texture: "wall", blocking: true },
        ],
      },
    );
    const drawables: DrawableEntity[] = [
      playerDrawable(1, 1, Direction.East),
      { kind: DrawableKind.Door, entity: 2, x: 2, y: 1, open: true, locked: false, secret: false, openMs: 0 },
    ];
    const session = sessionFor(map, drawables);
    const renderer = createFirstPersonRenderer();

    renderer.render(
      new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 64, height: 64 },
      session,
    );

    const scene = renderer.sceneForMap(map);
    const cell = 1 * 5 + 2;
    const thinIndex = scene.thinByCell[cell]!;

    assertNotEquals(thinIndex, -1);
    assertEquals(scene.thinCount, 1);
    assertEquals(scene.thinOffset[thinIndex], 1);
  });
});

Deno.test("first-person rendering uses sliding solid walls for closed secret doors", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "Closed Secret Door",
      [
        [2, 2, 2, 2, 2],
        [2, 1, 1, 1, 2],
        [2, 2, 2, 2, 2],
      ],
      [],
      {
        palette: [
          { id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { id: 2, color: "#ffffff", wall_texture: "wall", blocking: true },
        ],
      },
    );
    const drawables: DrawableEntity[] = [
      playerDrawable(1, 1, Direction.East),
      {
        kind: DrawableKind.Door,
        entity: 2,
        x: 2,
        y: 1,
        open: false,
        locked: false,
        secret: true,
        openMs: 0,
      },
    ];
    const session = sessionFor(map, drawables);
    const renderer = createFirstPersonRenderer();

    renderer.render(
      new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 64, height: 64 },
      session,
    );

    const scene = renderer.sceneForMap(map);
    const cell = 1 * 5 + 2;

    assertNotEquals(scene.slidingSolidByCell[cell], -1);
    assertEquals(scene.slidingSolidCount, 1);
    assertEquals(scene.thinByCell[cell], -1);
    assertEquals(scene.walls[cell], 0);
  });
});

Deno.test("first-person rendering keeps open secret doors out of the thin-wall path", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "Open Secret Door",
      [
        [2, 2, 2, 2, 2],
        [2, 1, 1, 1, 2],
        [2, 2, 2, 2, 2],
      ],
      [],
      {
        palette: [
          { id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { id: 2, color: "#ffffff", wall_texture: "wall", blocking: true },
        ],
      },
    );
    const drawables: DrawableEntity[] = [
      playerDrawable(1, 1, Direction.East),
      { kind: DrawableKind.Door, entity: 2, x: 2, y: 1, open: true, locked: false, secret: true, openMs: 0 },
    ];
    const session = sessionFor(map, drawables);
    const renderer = createFirstPersonRenderer();

    renderer.render(
      new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 64, height: 64 },
      session,
    );

    const scene = renderer.sceneForMap(map);
    const cell = 1 * 5 + 2;
    const slidingIndex = scene.slidingSolidByCell[cell]!;

    assertNotEquals(slidingIndex, -1);
    assertEquals(scene.slidingSolidCount, 1);
    assertEquals(scene.slidingSolidOffset[slidingIndex], 1);
    assertEquals(scene.thinByCell[cell], -1);
  });
});

Deno.test("first-person rendering uses John's single-frame NPC sprite", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "John",
      [
        [2, 2, 2],
        [2, 1, 2],
        [2, 1, 2],
        [2, 2, 2],
      ],
      [],
      {
        palette: [
          { id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { id: 2, color: "#ffffff", wall_texture: "wall", blocking: true },
        ],
      },
    );
    const drawables: DrawableEntity[] = [
      playerDrawable(1, 2, Direction.North),
      {
        kind: DrawableKind.Actor,
        entity: 2,
        x: 1,
        y: 1,
        dir: Direction.South,
        spriteId: SpriteId.John,
      },
    ];
    const session = sessionFor(map, drawables);
    const renderer = createFirstPersonRenderer();
    const ctx = new FakeCanvasContext() as unknown as CanvasRenderingContext2D;

    renderer.render(ctx, { x: 0, y: 0, width: 64, height: 64 }, session);

    const scene = renderer.sceneForMap(map);

    assertEquals(scene.spriteCount, 1);
    assertEquals(scene.spriteTex[0], SPRITE_JOHN);
    assert(
      (ctx.canvas.ownerDocument as unknown as FakeDocument).images.some((image) =>
        image.src.includes("/assets/game/sprites/john.png")
      ),
    );
  });
});

Deno.test("first-person rendering bobs pickup item sprites vertically", () => {
  withFakeOffscreenCanvas((): void => {
    withFakePerformanceNow(300, (): void => {
      const map = createGameMap(
        "Item Bob",
        [
          [2, 2, 2],
          [2, 1, 2],
          [2, 1, 2],
          [2, 2, 2],
        ],
        [],
        {
          palette: [
            { id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
            { id: 2, color: "#ffffff", wall_texture: "wall", blocking: true },
          ],
        },
      );
      const drawables: DrawableEntity[] = [
        playerDrawable(1, 2, Direction.North),
        { kind: DrawableKind.Sprite, entity: 2, x: 1, y: 1, spriteId: SpriteId.HealthPatch },
      ];
      const session = sessionFor(map, drawables);
      const renderer = createFirstPersonRenderer();

      const scheduled = withFakeRequestAnimationFrame((): void => {
        renderer.render(
          new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
          { x: 0, y: 0, width: 64, height: 64 },
          session,
          undefined,
          () => {},
        );
      });
      const scene = renderer.sceneForMap(map);

      assertEquals(scene.spriteCount, 1);
      assertAlmostEquals(scene.spriteElevation[0]!, 0.055, 1e-6);
      assertEquals(scheduled, 1);
    });
  });
});
