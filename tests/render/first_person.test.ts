import { spriteAppearance } from "@/src/content/sprites.ts";
import type { DrawableEntity, LightEntity, SpriteId as SpriteIdType } from "@/src/ecs/drawables.ts";
import {
  DrawableKind,
  SPRITE_ATTACK_MS,
  SPRITE_DEATH_MS,
  SPRITE_WALK_MS,
  SpriteAnimationKind,
  SpriteId,
} from "@/src/ecs/drawables.ts";
import type { CardinalDirection } from "@/src/grid/direction.ts";
import { Direction } from "@/src/grid/direction.ts";
import type { GameMap } from "@/src/map/map.ts";
import { createGameMap, SKY_CEILING_TEXTURE, TexturePack } from "@/src/map/map.ts";
import { GAME_MAPS } from "@/src/map/maps.ts";
import { DEFAULT_BARS_TERRAIN_ID, DEFAULT_WALL_TERRAIN_ID } from "@/src/map/terrain_palettes.ts";
import type {
  FirstPersonFrameScratch,
  FirstPersonRenderer,
  FirstPersonRenderSession,
} from "@/src/render/first_person.ts";
import { createFirstPersonRenderer } from "@/src/render/first_person.ts";
import type { RaycastScene } from "@/src/render/raycast/scene.ts";
import { TURN_TWEEN_MS } from "@/src/render/tween.ts";
import { assert, assertAlmostEquals, assertEquals, assertNotEquals, assertThrows } from "@std/assert";
import type { Entity } from "turn-based-engine/ecs";

type FakeImageEvent = "load" | "error";
type FakeImageListener = () => void;

const SPRITE_JOHN = firstPersonSlot(SpriteId.John);
const SPRITE_DECOR_CEILING_LIGHT = firstPersonSlot(SpriteId.DecorCeilingLight);
const FIRST_PERSON_FRAME_SCRATCH: FirstPersonFrameScratch = {
  needsFrame: false,
  ambientOnly: false,
  cameraAngle: 0,
};
const ENEMY_SHEET_COLUMNS = 4;
const ROW_WALK = 1;
const ROW_ATTACK = 2;
const ROW_DEATH = 3;
const SPRITE_LIGHTMAP_ASSETS = [
  "/assets/game/sprites/digital_dog_lightmap.png",
  "/assets/game/sprites/gigabit_gun_slinger_lightmap.png",
  "/assets/game/sprites/network_neophyte_lightmap.png",
  "/assets/game/sprites/system_sentinel_lightmap.png",
  "/assets/game/sprites/agentic_acolyte_lightmap.png",
  "/assets/game/sprites/john_lightmap.png",
  "/assets/game/sprites/uplink_terminal_lightmap.png",
  "/assets/game/sprites/health_lightmap.png",
  "/assets/game/sprites/key_lightmap.png",
  "/assets/game/sprites/weapon_2_lightmap.png",
  "/assets/game/sprites/weapon_3_lightmap.png",
  "/assets/game/sprites/uplink_code_lightmap.png",
  "/assets/game/sprites/pistol_ammo_lightmap.png",
  "/assets/game/sprites/cannon_ammo_lightmap.png",
] as const;
const SKY_TEXTURE_ASSET = "/assets/game/textures/sky.png";

function firstPersonSlot(spriteId: SpriteIdType): number {
  const slot = spriteAppearance(spriteId).firstPersonSlot;
  if (slot === undefined) throw new Error(`Sprite ${spriteId} has no first-person slot.`);
  return slot;
}

function renderFirstPersonView(
  renderer: FirstPersonRenderer,
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  session: FirstPersonRenderSession,
  nowMs: number,
  onAssetLoad?: () => void,
): FirstPersonFrameScratch {
  FIRST_PERSON_FRAME_SCRATCH.needsFrame = false;
  FIRST_PERSON_FRAME_SCRATCH.ambientOnly = false;
  FIRST_PERSON_FRAME_SCRATCH.cameraAngle = 0;
  renderer.render(ctx, rect, session, nowMs, FIRST_PERSON_FRAME_SCRATCH, onAssetLoad);
  return FIRST_PERSON_FRAME_SCRATCH;
}

class FakeImage {
  decoding: "async" | "auto" | "sync" = "auto";
  naturalWidth = 0;
  naturalHeight = 0;
  width = 0;
  height = 0;
  src = "";
  private readonly listeners: Record<FakeImageEvent, FakeImageListener[]> = {
    load: [],
    error: [],
  };

  addEventListener(type: FakeImageEvent, listener: FakeImageListener, _options?: AddEventListenerOptions): void {
    this.listeners[type].push(listener);
  }

  load(width: number, height: number): void {
    this.naturalWidth = width;
    this.naturalHeight = height;
    this.width = width;
    this.height = height;
    for (const listener of this.listeners.load) listener();
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
  imageSmoothingEnabled = true;

  createImageData(width: number, height: number): ImageData {
    return new ImageData(width, height);
  }

  clearRect(_x: number, _y: number, _width: number, _height: number): void {
  }

  drawImage(..._args: unknown[]): void {
  }

  getImageData(_sx: number, _sy: number, width: number, height: number): ImageData {
    const imageData = new ImageData(width, height);
    for (let y = 12; y < height; y++) {
      for (let x = width >> 2; x < width - (width >> 2); x++) {
        imageData.data[(y * width + x) * 4 + 3] = 255;
      }
    }
    return imageData;
  }

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
}

class FakeOffscreenCanvas {
  readonly width: number;
  readonly height: number;
  private readonly context = new FakeOffscreenCanvasRenderingContext2D();

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  getContext(
    contextId: string,
    _options?: CanvasRenderingContext2DSettings,
  ): FakeOffscreenCanvasRenderingContext2D | null {
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

function playerDrawable(x: number, y: number, dir: CardinalDirection): DrawableEntity {
  return { kind: DrawableKind.Player, entity: 1 as Entity, x, y, dir, spriteId: SpriteId.Player };
}

function sessionFor(
  map: ReturnType<typeof createGameMap>,
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

function scratchReusingSession(
  map: ReturnType<typeof createGameMap>,
  drawables: readonly DrawableEntity[],
): FirstPersonRenderSession {
  const scratch = {} as DrawableEntity;
  return {
    getMap: () => map,
    forEachDrawable(visit): void {
      for (const drawable of drawables) {
        Object.assign(scratch, drawable);
        visit(scratch);
      }
    },
    forEachLight(): void {},
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
        {
          kind: "floor",
          id: 1,
          color: "#000000",
          floor_texture: `${TexturePack.Pack1}:0,0`,
          ceiling_texture: "ceiling",
        },
        { kind: "wall", id: 2, color: "#888888", wall_texture: `${TexturePack.Pack2}:3,2` },
        { kind: "floor", id: 3, color: "#111111", floor_texture: "floor", ceiling_texture: `${TexturePack.Pack3}:4,3` },
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

Deno.test("sceneForMap maps sky ceiling textures to a distinct plane slot", () => {
  const map = createGameMap(
    "Sky",
    [[1, 2]],
    [],
    {
      palette: [
        { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
        { kind: "floor", id: 2, color: "#111111", floor_texture: "floor", ceiling_texture: SKY_CEILING_TEXTURE },
      ],
    },
  );

  const scene = sceneForMap(map);

  assert(scene.ceilings[0]! > 0);
  assert(scene.ceilings[1]! > 0);
  assertNotEquals(scene.ceilings[0], scene.ceilings[1]);
});

Deno.test("first-person rendering maps barrier terrain to a transparent thin wall over floor and ceiling", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap("Barrier", [
      [0, 0, DEFAULT_WALL_TERRAIN_ID, 0, 0],
      [0, 0, DEFAULT_BARS_TERRAIN_ID, 0, 0],
      [0, 0, DEFAULT_WALL_TERRAIN_ID, 0, 0],
    ], []);
    const renderer = createFirstPersonRenderer();

    renderFirstPersonView(
      renderer,
      new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 64, height: 64 },
      sessionFor(map, [playerDrawable(1, 1, Direction.East)]),
      0,
    );

    const scene = renderer.sceneForMap(map);
    const cell = 1 * 5 + 2;

    assertEquals(scene.walls[cell], 0);
    assert(scene.floors[cell]! > 0);
    assert(scene.ceilings[cell]! > 0);
    assertNotEquals(scene.thinByCell[cell], -1);
    assertEquals(scene.thinCount, 1);
  });
});

Deno.test("first-person renderer reports the tweened camera angle", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "Turn Tween",
      [
        [2, 2, 2],
        [2, 1, 2],
        [2, 2, 2],
      ],
      [],
      {
        palette: [
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const renderer = createFirstPersonRenderer();
    const ctx = new FakeCanvasContext() as unknown as CanvasRenderingContext2D;
    const rect = { x: 0, y: 0, width: 64, height: 64 };

    const initial = renderFirstPersonView(
      renderer,
      ctx,
      rect,
      sessionFor(map, [playerDrawable(1, 1, Direction.East)]),
      0,
    );
    assertAlmostEquals(initial.cameraAngle!, 0);

    renderFirstPersonView(renderer, ctx, rect, sessionFor(map, [playerDrawable(1, 1, Direction.South)]), 0);
    const midTurn = renderFirstPersonView(
      renderer,
      ctx,
      rect,
      sessionFor(map, [playerDrawable(1, 1, Direction.South)]),
      TURN_TWEEN_MS / 2,
    );

    assertAlmostEquals(midTurn.cameraAngle!, Math.PI / 4);
    assert(midTurn.needsFrame);
  });
});

Deno.test("sceneForMap rejects texture refs outside the 5x4 pack grid", () => {
  const map = createGameMap(
    "Invalid Texture",
    [[1]],
    [],
    {
      palette: [
        {
          kind: "floor",
          id: 1,
          color: "#000000",
          floor_texture: `${TexturePack.Pack1}:5,0`,
          ceiling_texture: "ceiling",
        },
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

Deno.test("first-person renderer requests lightmap assets for every lit sprite", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "Sprite Lightmaps",
      [
        [2, 2, 2],
        [2, 1, 2],
        [2, 2, 2],
      ],
      [],
      {
        palette: [
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const ctx = new FakeCanvasContext() as unknown as CanvasRenderingContext2D;

    renderFirstPersonView(
      createFirstPersonRenderer(),
      ctx,
      { x: 0, y: 0, width: 64, height: 64 },
      sessionFor(map, [playerDrawable(1, 1, Direction.East)]),
      0,
    );

    const imageSources = (ctx.canvas.ownerDocument as unknown as FakeDocument).images.map((image) => image.src);
    for (const lightmapAsset of SPRITE_LIGHTMAP_ASSETS) {
      assert(
        imageSources.some((src) => src.includes(lightmapAsset)),
        `${lightmapAsset} should be requested.`,
      );
    }
  });
});

Deno.test("first-person renderer requests the authored sky texture", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "Sky Asset",
      [
        [2, 2, 2],
        [2, 1, 2],
        [2, 2, 2],
      ],
      [],
      {
        palette: [
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: SKY_CEILING_TEXTURE },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const ctx = new FakeCanvasContext() as unknown as CanvasRenderingContext2D;

    renderFirstPersonView(
      createFirstPersonRenderer(),
      ctx,
      { x: 0, y: 0, width: 64, height: 64 },
      sessionFor(map, [playerDrawable(1, 1, Direction.East)]),
      0,
    );

    const imageSources = (ctx.canvas.ownerDocument as unknown as FakeDocument).images.map((image) => image.src);
    assert(
      imageSources.some((src) => src.includes(SKY_TEXTURE_ASSET)),
      `${SKY_TEXTURE_ASSET} should be requested.`,
    );
  });
});

Deno.test("first-person rendering requests another frame for scrolling sky ceilings", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "Scrolling Sky",
      [
        [2, 2, 2],
        [2, 1, 2],
        [2, 2, 2],
      ],
      [],
      {
        palette: [
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: SKY_CEILING_TEXTURE },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const renderer = createFirstPersonRenderer();
    const ctx = new FakeCanvasContext() as unknown as CanvasRenderingContext2D;

    const result = renderFirstPersonView(
      renderer,
      ctx,
      { x: 0, y: 0, width: 64, height: 64 },
      sessionFor(map, [playerDrawable(1, 1, Direction.East)]),
      0,
      () => {},
    );

    assertEquals(result.needsFrame, true);
    assertEquals(result.ambientOnly, true);
  });
});

Deno.test("first-person rendering updates flickering lights and requests another frame", () => {
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
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
        ],
      },
    );
    const drawables: DrawableEntity[] = [
      playerDrawable(1, 1, Direction.East),
    ];
    const session = sessionFor(map, drawables, [
      {
        entity: 2 as Entity,
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

    const result = renderFirstPersonView(renderer, ctx, { x: 0, y: 0, width: 64, height: 64 }, session, 0, () => {});
    const scene = renderer.sceneForMap(map);
    const firstAdjacentLight = scene.lightRed[1 * 3 + 2]!;

    renderFirstPersonView(renderer, ctx, { x: 0, y: 0, width: 64, height: 64 }, session, 16);
    assertEquals(scene.lightRed[1 * 3 + 2], firstAdjacentLight);

    renderFirstPersonView(renderer, ctx, { x: 0, y: 0, width: 64, height: 64 }, session, 250);

    assertNotEquals(scene.lightRed[1 * 3 + 2], firstAdjacentLight);
    assertEquals(result.needsFrame, true);
    assertEquals(result.ambientOnly, true);
  });
});

Deno.test("first-person rendering resets cached scene lighting when active lights disappear", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "Lights Out",
      [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ],
      [],
      {
        palette: [
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
        ],
      },
    );
    const drawables: DrawableEntity[] = [
      playerDrawable(1, 1, Direction.East),
    ];
    const renderer = createFirstPersonRenderer();
    const ctx = new FakeCanvasContext() as unknown as CanvasRenderingContext2D;

    renderFirstPersonView(
      renderer,
      ctx,
      { x: 0, y: 0, width: 64, height: 64 },
      sessionFor(map, drawables, [
        {
          entity: 2 as Entity,
          x: 1,
          y: 1,
          red: 255,
          green: 0,
          blue: 0,
          radius: 1,
          flickerAmount: 0,
          flickerSpeed: 0,
        },
      ]),
      0,
    );

    const scene = renderer.sceneForMap(map);
    assertEquals(scene.lightGreen[1 * 3 + 1], 112);

    renderFirstPersonView(renderer, ctx, { x: 0, y: 0, width: 64, height: 64 }, sessionFor(map, drawables), 16);

    assertEquals([...scene.lightRed], Array(9).fill(255));
    assertEquals([...scene.lightGreen], Array(9).fill(255));
    assertEquals([...scene.lightBlue], Array(9).fill(255));
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
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const drawables: DrawableEntity[] = [
      playerDrawable(1, 1, Direction.East),
      {
        kind: DrawableKind.Door,
        entity: 2 as Entity,
        x: 2,
        y: 1,
        open: true,
        locked: false,
        secret: false,
        glass: false,
        openMs: 0,
      },
    ];
    const session = sessionFor(map, drawables);
    const renderer = createFirstPersonRenderer();

    renderFirstPersonView(
      renderer,
      new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 64, height: 64 },
      session,
      0,
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
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const drawables: DrawableEntity[] = [
      playerDrawable(1, 1, Direction.East),
      {
        kind: DrawableKind.Door,
        entity: 2 as Entity,
        x: 2,
        y: 1,
        open: false,
        locked: false,
        secret: true,
        glass: false,
        openMs: 0,
      },
    ];
    const session = sessionFor(map, drawables);
    const renderer = createFirstPersonRenderer();

    renderFirstPersonView(
      renderer,
      new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 64, height: 64 },
      session,
      0,
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
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const drawables: DrawableEntity[] = [
      playerDrawable(1, 1, Direction.East),
      {
        kind: DrawableKind.Door,
        entity: 2 as Entity,
        x: 2,
        y: 1,
        open: true,
        locked: false,
        secret: true,
        glass: false,
        openMs: 0,
      },
    ];
    const session = sessionFor(map, drawables);
    const renderer = createFirstPersonRenderer();

    renderFirstPersonView(
      renderer,
      new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 64, height: 64 },
      session,
      0,
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
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const drawables: DrawableEntity[] = [
      playerDrawable(1, 2, Direction.North),
      {
        kind: DrawableKind.Actor,
        entity: 2 as Entity,
        x: 1,
        y: 1,
        dir: Direction.South,
        spriteId: SpriteId.John,
      },
    ];
    const session = sessionFor(map, drawables);
    const renderer = createFirstPersonRenderer();
    const ctx = new FakeCanvasContext() as unknown as CanvasRenderingContext2D;

    renderFirstPersonView(renderer, ctx, { x: 0, y: 0, width: 64, height: 64 }, session, 0);

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

Deno.test("first-person rendering preserves loaded sprite source aspect ratios", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "John Aspect",
      [
        [2, 2, 2],
        [2, 1, 2],
        [2, 1, 2],
        [2, 2, 2],
      ],
      [],
      {
        palette: [
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const renderer = createFirstPersonRenderer();
    const ctx = new FakeCanvasContext() as unknown as CanvasRenderingContext2D;
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

    renderFirstPersonView(renderer, ctx, { x: 0, y: 0, width: 64, height: 64 }, session, 0);
    const image = (ctx.canvas.ownerDocument as unknown as FakeDocument).images.find((image) =>
      image.src.includes("/assets/game/sprites/john.png")
    );
    assert(image !== undefined);
    image.load(1024, 1365);

    renderFirstPersonView(renderer, ctx, { x: 0, y: 0, width: 64, height: 64 }, session, 0);
    const scene = renderer.sceneForMap(map);

    assertEquals(scene.spriteCount, 1);
    assertAlmostEquals(scene.spriteHeight[0]!, 0.8, 1e-6);
    assertAlmostEquals(scene.spriteWidth[0]!, 0.8 * 1024 / 1365, 1e-6);
  });
});

Deno.test("first-person rendering places ceiling decorations near the ceiling", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "Ceiling Decoration",
      [
        [2, 2, 2],
        [2, 1, 2],
        [2, 1, 2],
        [2, 2, 2],
      ],
      [],
      {
        palette: [
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const drawables: DrawableEntity[] = [
      playerDrawable(1, 2, Direction.North),
      { kind: DrawableKind.Sprite, entity: 2 as Entity, x: 1, y: 1, spriteId: SpriteId.DecorCeilingLight },
    ];
    const session = sessionFor(map, drawables);
    const renderer = createFirstPersonRenderer();
    const ctx = new FakeCanvasContext() as unknown as CanvasRenderingContext2D;

    renderFirstPersonView(renderer, ctx, { x: 0, y: 0, width: 64, height: 64 }, session, 0);

    const scene = renderer.sceneForMap(map);

    assertEquals(scene.spriteCount, 1);
    assertEquals(scene.spriteTex[0], SPRITE_DECOR_CEILING_LIGHT);
    assertAlmostEquals(scene.spriteElevation[0]!, 0.5, 1e-6);
    assert(
      (ctx.canvas.ownerDocument as unknown as FakeDocument).images.some((image) =>
        image.src.includes("/assets/game/sprites/decor_ceiling_light.png")
      ),
    );
  });
});

Deno.test("first-person rendering passes the mainframe core ceiling-clip distance to raycast sprites", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "Mainframe Core Clipping",
      [
        [2, 2, 2],
        [2, 1, 2],
        [2, 1, 2],
        [2, 2, 2],
      ],
      [],
      {
        palette: [
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const session = sessionFor(map, [
      playerDrawable(1, 2, Direction.North),
      { kind: DrawableKind.Sprite, entity: 2 as Entity, x: 1, y: 1, spriteId: SpriteId.MainframeCore },
    ]);
    const renderer = createFirstPersonRenderer();
    const ctx = new FakeCanvasContext() as unknown as CanvasRenderingContext2D;

    renderFirstPersonView(renderer, ctx, { x: 0, y: 0, width: 64, height: 64 }, session, 0);

    const scene = renderer.sceneForMap(map);
    assertAlmostEquals(scene.spriteHeight[0]!, 5, 1e-6);
    assertAlmostEquals(scene.spriteCeilingClipDistance[0]!, 8, 1e-6);
  });
});

Deno.test("first-person rendering uses ECS attack animation sheet row", () => {
  withFakeOffscreenCanvas((): void => {
    const nowMs = 100;
    const map = createGameMap(
      "Attack Animation",
      [
        [2, 2, 2],
        [2, 1, 2],
        [2, 1, 2],
        [2, 2, 2],
      ],
      [],
      {
        palette: [
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const base = firstPersonSlot(SpriteId.DigitalDog);
    const session = sessionFor(map, [
      playerDrawable(1, 2, Direction.North),
      {
        kind: DrawableKind.Actor,
        entity: 2 as Entity,
        x: 1,
        y: 1,
        dir: Direction.South,
        spriteId: SpriteId.DigitalDog,
        animation: { kind: SpriteAnimationKind.Attack, startedAtMs: nowMs, durationMs: SPRITE_ATTACK_MS },
      },
    ]);
    const renderer = createFirstPersonRenderer();

    renderFirstPersonView(
      renderer,
      new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 64, height: 64 },
      session,
      nowMs,
    );
    const scene = renderer.sceneForMap(map);

    assertEquals(scene.spriteCount, 1);
    assertEquals(scene.spriteTex[0], base + ROW_ATTACK * ENEMY_SHEET_COLUMNS);
  });
});

Deno.test("first-person rendering passes enemy health to raycast sprites", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "Enemy Health",
      [
        [2, 2, 2],
        [2, 1, 2],
        [2, 1, 2],
        [2, 2, 2],
      ],
      [],
      {
        palette: [
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const session = sessionFor(map, [
      playerDrawable(1, 2, Direction.North),
      {
        kind: DrawableKind.Actor,
        entity: 2 as Entity,
        x: 1,
        y: 1,
        dir: Direction.South,
        spriteId: SpriteId.DigitalDog,
        health: { current: 4, max: 10 },
      },
    ]);
    const renderer = createFirstPersonRenderer();

    renderFirstPersonView(
      renderer,
      new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 64, height: 64 },
      session,
      100,
    );
    const scene = renderer.sceneForMap(map);

    assertEquals(scene.spriteCount, 1);
    assertEquals(scene.spriteHealthCurrent[0], 4);
    assertEquals(scene.spriteHealthMax[0], 10);
  });
});

Deno.test("first-person rendering uses ECS walk animation sheet row", () => {
  withFakeOffscreenCanvas((): void => {
    const nowMs = SPRITE_WALK_MS / 2;
    const map = createGameMap(
      "Walk Animation",
      [
        [2, 2, 2],
        [2, 1, 2],
        [2, 1, 2],
        [2, 2, 2],
      ],
      [],
      {
        palette: [
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const base = firstPersonSlot(SpriteId.DigitalDog);
    const session = sessionFor(map, [
      playerDrawable(1, 2, Direction.North),
      {
        kind: DrawableKind.Actor,
        entity: 2 as Entity,
        x: 1,
        y: 1,
        dir: Direction.South,
        spriteId: SpriteId.DigitalDog,
        animation: { kind: SpriteAnimationKind.Walk, startedAtMs: 0, durationMs: SPRITE_WALK_MS },
      },
    ]);
    const renderer = createFirstPersonRenderer();

    renderFirstPersonView(
      renderer,
      new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 64, height: 64 },
      session,
      nowMs,
    );
    const scene = renderer.sceneForMap(map);

    assertEquals(scene.spriteCount, 1);
    assertEquals(scene.spriteTex[0], base + ROW_WALK * ENEMY_SHEET_COLUMNS);
  });
});

Deno.test("first-person rendering uses ECS death animation sheet frames", () => {
  withFakeOffscreenCanvas((): void => {
    const nowMs = SPRITE_DEATH_MS / 2;
    const map = createGameMap(
      "Death Animation",
      [
        [2, 2, 2],
        [2, 1, 2],
        [2, 1, 2],
        [2, 2, 2],
      ],
      [],
      {
        palette: [
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const base = firstPersonSlot(SpriteId.DigitalDog);
    const session = sessionFor(map, [
      playerDrawable(1, 2, Direction.North),
      {
        kind: DrawableKind.Sprite,
        entity: 2 as Entity,
        x: 1,
        y: 1,
        spriteId: SpriteId.DigitalDog,
        animation: { kind: SpriteAnimationKind.Death, startedAtMs: 0, durationMs: SPRITE_DEATH_MS },
      },
    ]);
    const renderer = createFirstPersonRenderer();

    renderFirstPersonView(
      renderer,
      new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 64, height: 64 },
      session,
      nowMs,
    );
    const scene = renderer.sceneForMap(map);

    assertEquals(scene.spriteCount, 1);
    assertEquals(scene.spriteTex[0], base + ROW_DEATH * ENEMY_SHEET_COLUMNS + 2);
  });
});

Deno.test("first-person rendering bobs pickup item sprites vertically", () => {
  withFakeOffscreenCanvas((): void => {
    const nowMs = 300;
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
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const drawables: DrawableEntity[] = [
      playerDrawable(1, 2, Direction.North),
      { kind: DrawableKind.Sprite, entity: 2 as Entity, x: 1, y: 1, spriteId: SpriteId.HealthPatch },
    ];
    const session = sessionFor(map, drawables);
    const renderer = createFirstPersonRenderer();

    const result = renderFirstPersonView(
      renderer,
      new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 64, height: 64 },
      session,
      nowMs,
    );
    const scene = renderer.sceneForMap(map);

    assertEquals(scene.spriteCount, 1);
    assertAlmostEquals(scene.spriteElevation[0]!, 0.055, 1e-6);
    assertEquals(result.needsFrame, true);
    assertEquals(result.ambientOnly, true);
  });
});

Deno.test("first-person rendering does not retain reusable drawable snapshots", () => {
  withFakeOffscreenCanvas((): void => {
    const map = createGameMap(
      "Reusable Drawables",
      [
        [2, 2, 2],
        [2, 1, 2],
        [2, 1, 2],
        [2, 2, 2],
      ],
      [],
      {
        palette: [
          { kind: "floor", id: 1, color: "#000000", floor_texture: "floor", ceiling_texture: "ceiling" },
          { kind: "wall", id: 2, color: "#ffffff", wall_texture: "wall" },
        ],
      },
    );
    const session = scratchReusingSession(map, [
      { kind: DrawableKind.Sprite, entity: 2 as Entity, x: 1, y: 1, spriteId: SpriteId.HealthPatch },
      playerDrawable(1, 2, Direction.North),
    ]);
    const renderer = createFirstPersonRenderer();

    renderFirstPersonView(
      renderer,
      new FakeCanvasContext() as unknown as CanvasRenderingContext2D,
      { x: 0, y: 0, width: 64, height: 64 },
      session,
      0,
    );

    assertEquals(renderer.sceneForMap(map).spriteCount, 1);
  });
});
