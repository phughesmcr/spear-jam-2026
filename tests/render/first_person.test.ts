import { assert, assertEquals, assertNotEquals, assertThrows } from "@std/assert";
import { DrawableKind } from "@/src/ecs/drawables.ts";
import type { DrawableEntity } from "@/src/ecs/drawables.ts";
import { Direction } from "@/src/grid/direction.ts";
import { DisplayName } from "@/src/game/names.ts";
import { createGameMap, TexturePack } from "@/src/map/map.ts";
import { GAME_MAPS } from "@/src/map/maps.ts";
import { createFirstPersonRenderer, sceneForMap } from "@/src/render/first_person.ts";
import type { FirstPersonRenderSession } from "@/src/render/first_person.ts";

type FakeImageEvent = "load" | "error";
type FakeImageListener = () => void;

const SPRITE_JOHN = 88;

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
      { kind: DrawableKind.Player, entity: 1, x: 1, y: 1, dir: Direction.East, enemyArchetype: undefined },
      { kind: DrawableKind.Door, entity: 2, x: 2, y: 1, open: true, locked: false, secret: false, openMs: 0 },
    ];
    const session: FirstPersonRenderSession = {
      map,
      forEachDrawable(visit): void {
        for (const drawable of drawables) visit(drawable);
      },
    };
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
      { kind: DrawableKind.Player, entity: 1, x: 1, y: 1, dir: Direction.East, enemyArchetype: undefined },
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
    const session: FirstPersonRenderSession = {
      map,
      forEachDrawable(visit): void {
        for (const drawable of drawables) visit(drawable);
      },
    };
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
      { kind: DrawableKind.Player, entity: 1, x: 1, y: 1, dir: Direction.East, enemyArchetype: undefined },
      { kind: DrawableKind.Door, entity: 2, x: 2, y: 1, open: true, locked: false, secret: true, openMs: 0 },
    ];
    const session: FirstPersonRenderSession = {
      map,
      forEachDrawable(visit): void {
        for (const drawable of drawables) visit(drawable);
      },
    };
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
      { kind: DrawableKind.Player, entity: 1, x: 1, y: 2, dir: Direction.North, enemyArchetype: undefined },
      {
        kind: DrawableKind.Npc,
        entity: 2,
        x: 1,
        y: 1,
        dir: Direction.South,
        displayName: DisplayName.John,
        enemyArchetype: undefined,
      },
    ];
    const session: FirstPersonRenderSession = {
      map,
      forEachDrawable(visit): void {
        for (const drawable of drawables) visit(drawable);
      },
    };
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
