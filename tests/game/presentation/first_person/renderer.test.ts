import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import { type DrawableEntity, DrawableKind, type LightEntity } from "@/src/game/model/render_snapshot.ts";
import type { CardinalDirection } from "@/src/game/world/direction.ts";
import { Direction } from "@/src/game/world/direction.ts";
import { type CeilingTexture, createGameMap } from "@/src/game/world/map.ts";
import { SKY_CEILING_TEXTURE } from "@/src/game/world/terrain_palette.ts";
import {
  createFirstPersonRenderer,
  type FirstPersonFrameScratch,
  type FirstPersonRenderer,
  type FirstPersonRenderSession,
} from "@/src/game/presentation/first_person/renderer.ts";
import { TURN_TWEEN_MS } from "@/src/game/presentation/first_person/tween.ts";
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import type { Entity } from "turn-based-engine/ecs";

class FakeCanvasContext {
  imageSmoothingEnabled = true;
  drawCount = 0;

  drawImage(..._args: unknown[]): void {
    this.drawCount++;
  }
}

class FakeOffscreenCanvasRenderingContext2D {
  static rasterReadCount = 0;

  putImageData(
    _imageData: ImageData,
    _dx: number,
    _dy: number,
    _dirtyX?: number,
    _dirtyY?: number,
    _dirtyWidth?: number,
    _dirtyHeight?: number,
  ): void {
  }

  getImageData(_sx: number, _sy: number, width: number, height: number): ImageData {
    FakeOffscreenCanvasRenderingContext2D.rasterReadCount++;
    return new ImageData(width, height);
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
  FakeOffscreenCanvasRenderingContext2D.rasterReadCount = 0;
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

function testMap(ceilingTexture: CeilingTexture = "ceiling") {
  return createGameMap(
    "Renderer",
    [
      [2, 2, 2],
      [2, 1, 2],
      [2, 1, 2],
      [2, 2, 2],
    ],
    [],
    {
      palette: [
        { kind: "floor", id: 1, floor_texture: "floor", ceiling_texture: ceilingTexture },
        { kind: "wall", id: 2, wall_texture: "wall" },
      ],
    },
  );
}

function playerDrawable(x: number, y: number, dir: CardinalDirection): DrawableEntity {
  return { kind: DrawableKind.Player, entity: 1 as Entity, x, y, dir, spriteId: SpriteId.Player };
}

function sessionFor(
  map: ReturnType<typeof testMap>,
  drawables: readonly DrawableEntity[],
  lights: readonly LightEntity[] = [],
): FirstPersonRenderSession {
  return {
    getMap: () => map,
    forEachDrawable(visit): void {
      for (const drawable of drawables) visit(drawable);
    },
    forEachLight(visit): void {
      for (const light of lights) visit(light);
    },
  };
}

function render(
  renderer: FirstPersonRenderer,
  session: FirstPersonRenderSession,
  nowMs: number,
): FirstPersonFrameScratch {
  const out = { needsFrame: false, ambientOnly: false, cameraAngle: 0 };
  renderer.render(
    new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
    { x: 0, y: 0, width: 64, height: 64 },
    session,
    nowMs,
    out,
  );
  return out;
}

Deno.test("first-person renderer reports the tweened camera angle", () => {
  withFakeOffscreenCanvas(() => {
    const map = testMap();
    const renderer = createFirstPersonRenderer();

    const initial = render(renderer, sessionFor(map, [playerDrawable(1, 2, Direction.East)]), 0);
    assertAlmostEquals(initial.cameraAngle, 0);

    render(renderer, sessionFor(map, [playerDrawable(1, 2, Direction.South)]), 0);
    const midTurn = render(
      renderer,
      sessionFor(map, [playerDrawable(1, 2, Direction.South)]),
      TURN_TWEEN_MS / 2,
    );

    assertAlmostEquals(midTurn.cameraAngle, Math.PI / 4);
    assert(midTurn.needsFrame);
  });
});

Deno.test("first-person renderer reset discards presentation tweens", () => {
  withFakeOffscreenCanvas(() => {
    const map = testMap();
    const renderer = createFirstPersonRenderer();
    render(renderer, sessionFor(map, [playerDrawable(1, 2, Direction.East)]), 0);
    render(renderer, sessionFor(map, [playerDrawable(1, 2, Direction.South)]), 0);

    renderer.reset();
    const reset = render(renderer, sessionFor(map, [playerDrawable(1, 2, Direction.South)]), 0);

    assertAlmostEquals(reset.cameraAngle, Math.PI / 2);
  });
});

Deno.test("first-person renderer exposes ambient frame demand", () => {
  withFakeOffscreenCanvas(() => {
    const skyMap = testMap(SKY_CEILING_TEXTURE);
    const sky = render(
      createFirstPersonRenderer(),
      sessionFor(skyMap, [playerDrawable(1, 2, Direction.North)]),
      0,
    );
    assertEquals(sky, { needsFrame: true, ambientOnly: true, cameraAngle: -Math.PI / 2 });

    const litMap = testMap();
    const flicker = render(
      createFirstPersonRenderer(),
      sessionFor(litMap, [playerDrawable(1, 2, Direction.North)], [{
        entity: 2 as Entity,
        x: 1,
        y: 1,
        red: 255,
        green: 255,
        blue: 255,
        radius: 2,
        flickerAmount: 1,
        flickerSpeed: 7,
      }]),
      0,
    );
    assertEquals(flicker.needsFrame, true);
    assertEquals(flicker.ambientOnly, true);
  });
});

Deno.test("first-person render never loads or raster-bakes assets", () => {
  withFakeOffscreenCanvas(() => {
    const map = testMap();
    const renderer = createFirstPersonRenderer();
    const session = sessionFor(map, [
      playerDrawable(1, 2, Direction.North),
      {
        kind: DrawableKind.Actor,
        entity: 2 as Entity,
        x: 1,
        y: 1,
        dir: Direction.South,
        spriteId: SpriteId.John,
      },
    ]);

    render(renderer, session, 0);

    assertEquals(FakeOffscreenCanvasRenderingContext2D.rasterReadCount, 0);
  });
});

Deno.test("first-person renderer does not retain reusable drawable snapshots", () => {
  withFakeOffscreenCanvas(() => {
    const map = testMap();
    const scratch = {} as DrawableEntity;
    const drawables: readonly DrawableEntity[] = [
      { kind: DrawableKind.Sprite, entity: 2 as Entity, x: 1, y: 1, spriteId: SpriteId.HealthPatch },
      playerDrawable(1, 2, Direction.North),
    ];
    const session: FirstPersonRenderSession = {
      getMap: () => map,
      forEachDrawable(visit): void {
        for (const drawable of drawables) {
          Object.assign(scratch, drawable);
          visit(scratch);
        }
      },
      forEachLight(): void {},
    };

    const result = render(createFirstPersonRenderer(), session, 0);

    assert(result.needsFrame);
    assert(result.ambientOnly);
  });
});
