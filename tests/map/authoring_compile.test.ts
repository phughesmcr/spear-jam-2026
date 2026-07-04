import { assertEquals, assertThrows } from "@std/assert";
import { AttackFacingRequirement, AttackPattern, AttackTargetMode } from "@/src/game/attack.ts";
import { DialogueTreeId } from "@/src/dialogue/dialogue.ts";
import { DecorationKind, ItemKind } from "@/src/ecs/components.ts";
import { EnemyArchetype } from "@/src/ecs/enemy_catalog.ts";
import { ExamineTextId } from "@/src/game/examine.ts";
import { DisplayName } from "@/src/game/names.ts";
import { compileTiledMap } from "@/src/map/authoring/mod.ts";
import { KeyColor, VICTORY_GOTO } from "@/src/map/map.ts";
import { DEFAULT_BARS_TERRAIN_ID, DEFAULT_WALL_TERRAIN_ID, TERRAIN_CATALOG } from "@/src/map/terrain_palettes.ts";
import type { TiledMap, TiledObject, TiledProperty, TiledTemplate } from "@/src/map/authoring/mod.ts";

const TILE_SIZE = 16;
const TERRAIN_FIRST_GID = 17;
const MARKER_FIRST_GID = 200;

Deno.test("compileTiledMap preserves authored terrain IDs", () => {
  const compiled = compileTiledMap(
    tiledMap({
      width: 3,
      height: 1,
      terrainData: [TERRAIN_FIRST_GID, TERRAIN_FIRST_GID + DEFAULT_WALL_TERRAIN_ID, TERRAIN_FIRST_GID + 5],
    }),
    compileOptions(),
  );

  assertEquals(compiled.paletteKey, "test");
  assertEquals(compiled.campaignOrder, 7);
  assertEquals(compiled.gameMap.name, "Fixture");
  assertEquals(compiled.gameMap.terrain.tiles, [[0, DEFAULT_WALL_TERRAIN_ID, 5]]);
  assertEquals(compiled.gameMap.terrain.palette, TERRAIN_CATALOG);
});

Deno.test("compileTiledMap preserves authored barrier terrain IDs", () => {
  const compiled = compileTiledMap(
    tiledMap({
      terrainData: [TERRAIN_FIRST_GID + DEFAULT_BARS_TERRAIN_ID],
    }),
    compileOptions(),
  );

  assertEquals(compiled.gameMap.terrain.tiles, [[DEFAULT_BARS_TERRAIN_ID]]);
});

Deno.test("compileTiledMap rejects terrain IDs missing from the global catalog", () => {
  assertThrows(
    () => compileTiledMap(tiledMap({ terrainData: [TERRAIN_FIRST_GID + 2] }), compileOptions()),
    Error,
    "Unknown terrainId 999.",
  );
});

Deno.test("compileTiledMap rejects empty and transformed terrain GIDs", () => {
  assertThrows(
    () => compileTiledMap(tiledMap({ terrainData: [0] }), compileOptions()),
    Error,
    "empty terrain GID",
  );

  assertThrows(
    () => compileTiledMap(tiledMap({ terrainData: [0x80000000 + TERRAIN_FIRST_GID] }), compileOptions()),
    Error,
    "transformed GID",
  );
});

Deno.test("compileTiledMap rejects marker GIDs in terrain layers", () => {
  assertThrows(
    () => compileTiledMap(tiledMap({ terrainData: [MARKER_FIRST_GID] }), compileOptions()),
    Error,
    "terrainId",
  );
});

Deno.test("compileTiledMap rejects duplicate and unknown properties", () => {
  assertThrows(
    () =>
      compileTiledMap(
        tiledMap({
          properties: [
            property("name", "Fixture"),
            property("name", "Duplicate"),
            property("palette", "test"),
            property("campaignOrder", 7),
          ],
        }),
        compileOptions(),
      ),
    Error,
    'Duplicate property "name"',
  );

  assertThrows(
    () =>
      compileTiledMap(
        tiledMap({
          objects: [
            object({
              x: 0,
              y: 0,
              type: "player",
              properties: [property("dir", "north"), property("bogus", true)],
            }),
          ],
        }),
        compileOptions(),
      ),
    Error,
    'Unknown property "bogus"',
  );

  assertThrows(
    () =>
      compileTiledMap(
        tiledMap({
          properties: [
            { ...property("name", "Fixture"), type: "int" },
            property("palette", "test"),
            property("campaignOrder", 7),
          ],
        }),
        compileOptions(),
      ),
    Error,
    "type does not match",
  );

  assertThrows(
    () =>
      compileTiledMap(
        tiledMap({
          objects: [
            object({
              x: 0,
              y: 0,
              type: "player",
              properties: [property("dir", "north"), property("goto", VICTORY_GOTO)],
            }),
          ],
        }),
        compileOptions(),
      ),
    Error,
    'Property "goto" is not valid for this prefab.',
  );
});

Deno.test("compileTiledMap rejects non-cell-aligned objects", () => {
  assertThrows(
    () =>
      compileTiledMap(
        tiledMap({
          objects: [
            object({
              x: TILE_SIZE / 2,
              y: 0,
              type: "player",
              properties: [property("dir", "east")],
            }),
          ],
        }),
        compileOptions(),
      ),
    Error,
    "cell-aligned",
  );
});

Deno.test("compileTiledMap rejects non-square tiles and shifted layers", () => {
  assertThrows(
    () => compileTiledMap({ ...tiledMap(), tileheight: TILE_SIZE * 2 }, compileOptions()),
    Error,
    "square",
  );

  const shifted = tiledMap();
  assertThrows(
    () =>
      compileTiledMap({
        ...shifted,
        layers: shifted.layers.map((layer) => layer.name === "terrain" ? { ...layer, x: 1 } : layer),
      }, compileOptions()),
    Error,
    "offset",
  );
});

Deno.test("compileTiledMap treats tile objects as bottom-left anchored", () => {
  const compiled = compileTiledMap(
    tiledMap({
      height: 3,
      objects: [
        object({
          gid: MARKER_FIRST_GID,
          x: TILE_SIZE,
          y: TILE_SIZE * 2,
          width: TILE_SIZE,
          height: TILE_SIZE,
          properties: [property("prefab", "key"), property("color", "red")],
        }),
      ],
    }),
    compileOptions(),
  );

  assertEquals(compiled.gameMap.entities, [
    { prefab: "key", x: 1, y: 1, color: KeyColor.Red },
  ]);
});

Deno.test("compileTiledMap applies marker defaults before object overrides", () => {
  const compiled = compileTiledMap(
    tiledMap({
      objects: [
        object({
          gid: MARKER_FIRST_GID + 2,
          x: 0,
          y: TILE_SIZE,
          width: TILE_SIZE,
          height: TILE_SIZE,
          properties: [property("amount", 9)],
        }),
      ],
    }),
    compileOptions(),
  );

  assertEquals(compiled.gameMap.entities, [
    { prefab: "item", x: 0, y: 0, item: ItemKind.CannonAmmo, amount: 9 },
  ]);
});

Deno.test("compileTiledMap resolves linked object templates with instance overrides", () => {
  const compiled = compileTiledMap(
    tiledMap({
      objects: [
        object({
          template: "templates/player.tx",
          x: 0,
          y: TILE_SIZE,
          properties: [property("facing", "east")],
        }),
      ],
    }),
    compileOptions({
      sourcePath: "fixture.tiled.json",
      templates: {
        "templates/player.tx": template({
          object: object({
            type: "player",
            x: 0,
            y: TILE_SIZE,
            properties: [property("prefab", "player"), property("facing", "north")],
          }),
        }),
      },
    }),
  );

  assertEquals(compiled.gameMap.entities, [
    { prefab: "player", x: 0, y: 1, dir: 1 },
  ]);
});

Deno.test("compileTiledMap decodes template marker GIDs through the template tileset", () => {
  const compiled = compileTiledMap(
    tiledMap({
      objects: [
        object({
          template: "templates/item.tx",
          x: TILE_SIZE,
          y: TILE_SIZE,
          properties: [property("amount", 9)],
        }),
      ],
    }),
    compileOptions({
      sourcePath: "fixture.tiled.json",
      templates: {
        "templates/item.tx": template({
          tilesetFirstGid: 50,
          object: object({
            gid: 52,
            x: 0,
            y: TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE,
          }),
        }),
      },
    }),
  );

  assertEquals(compiled.gameMap.entities, [
    { prefab: "item", x: 1, y: 0, item: ItemKind.CannonAmmo, amount: 9 },
  ]);
});

Deno.test("compileTiledMap rejects missing and invalid templates", () => {
  assertThrows(
    () =>
      compileTiledMap(
        tiledMap({ objects: [object({ template: "templates/missing.tx", x: 0, y: TILE_SIZE })] }),
        compileOptions({ sourcePath: "fixture.tiled.json", templates: {} }),
      ),
    Error,
    'Missing object template "templates/missing.tx"',
  );

  assertThrows(
    () =>
      compileTiledMap(
        tiledMap({ objects: [object({ template: "templates/player.tx", x: 0, y: TILE_SIZE })] }),
        compileOptions({
          sourcePath: "fixture.tiled.json",
          templates: {
            "templates/player.tx": template({
              object: object({
                type: "player",
                rotation: 90,
                x: 0,
                y: TILE_SIZE,
                properties: [property("prefab", "player"), property("facing", "north")],
              }),
            }),
          },
        }),
      ),
    Error,
    "rotation is unsupported",
  );
});

Deno.test("compileTiledMap compiles representative prefabs and enemy attack overrides", () => {
  const compiled = compileTiledMap(
    tiledMap({
      width: 3,
      height: 4,
      objects: [
        object({ x: 0, y: 0, type: "player", properties: [property("dir", "east")] }),
        object({
          x: TILE_SIZE,
          y: 0,
          type: "npc",
          properties: [
            property("dir", "south"),
            property("displayName", "john"),
            property("dialogueTreeId", "johnIntro"),
            property("examineTextId", "bootSectorUplinkTerminal"),
          ],
        }),
        object({
          x: TILE_SIZE * 2,
          y: 0,
          type: "enemy",
          properties: [
            property("dir", "west"),
            property("displayName", "systemSentinel"),
            property("archetype", "systemSentinel"),
            property("health", 11),
            property("hitDc", 14),
            property("damage", 4),
            property("attackMinDamage", 2),
            property("attackMaxDamage", 6),
            property("attackRange", 3),
            property("attackRequiresFacing", "none"),
            property("attackBonus", 5),
            property("attackCritThreshold", 19),
            property("attackCritMultiplier", 3),
            property("attackPattern", "adjacent"),
            property("attackTargets", "all"),
          ],
        }),
        object({
          x: 0,
          y: TILE_SIZE,
          type: "door",
          properties: [
            property("locked", true),
            property("color", "blue"),
            property("slide", "up"),
            property("openMs", 600),
            property("examineTextId", "bootSectorUplinkTerminal"),
          ],
        }),
        object({ x: TILE_SIZE, y: TILE_SIZE, type: "key", properties: [property("color", "yellow")] }),
        object({ x: TILE_SIZE * 2, y: TILE_SIZE, type: "uplinkCode" }),
        object({
          x: 0,
          y: TILE_SIZE * 2,
          type: "uplinkTerminal",
          properties: [property("goto", VICTORY_GOTO), property("examineTextId", "bootSectorUplinkTerminal")],
        }),
        object({ x: TILE_SIZE, y: TILE_SIZE * 2, type: "weaponPickup", properties: [property("slot", 3)] }),
        object({
          x: TILE_SIZE * 2,
          y: TILE_SIZE * 2,
          type: "item",
          properties: [property("item", "healthPatch"), property("amount", 4)],
        }),
        object({
          x: 0,
          y: TILE_SIZE * 3,
          type: "decoration",
          properties: [property("decoration", "ceilingLight")],
        }),
      ],
    }),
    compileOptions(),
  );

  assertEquals(compiled.gameMap.entities, [
    { prefab: "player", x: 0, y: 0, dir: 1 },
    {
      prefab: "npc",
      x: 1,
      y: 0,
      dir: 2,
      displayName: DisplayName.John,
      dialogueTreeId: DialogueTreeId.JohnIntro,
      examineTextId: ExamineTextId.BootSectorUplinkTerminal,
    },
    {
      prefab: "enemy",
      x: 2,
      y: 0,
      dir: 3,
      displayName: DisplayName.SystemSentinel,
      archetype: EnemyArchetype.SystemSentinel,
      health: 11,
      hitDc: 14,
      damage: 4,
      attack: {
        minDamage: 2,
        maxDamage: 6,
        range: 3,
        requiresFacing: AttackFacingRequirement.None,
        attackBonus: 5,
        critThreshold: 19,
        critMultiplier: 3,
        pattern: AttackPattern.Adjacent,
        targets: AttackTargetMode.All,
      },
    },
    {
      prefab: "door",
      x: 0,
      y: 1,
      locked: true,
      color: KeyColor.Blue,
      slide: "up",
      openMs: 600,
      examineTextId: ExamineTextId.BootSectorUplinkTerminal,
    },
    { prefab: "key", x: 1, y: 1, color: KeyColor.Yellow },
    { prefab: "uplinkCode", x: 2, y: 1 },
    {
      prefab: "uplinkTerminal",
      x: 0,
      y: 2,
      goto: VICTORY_GOTO,
      examineTextId: ExamineTextId.BootSectorUplinkTerminal,
    },
    { prefab: "weaponPickup", x: 1, y: 2, slot: 3 },
    { prefab: "item", x: 2, y: 2, item: ItemKind.HealthPatch, amount: 4 },
    { prefab: "decoration", x: 0, y: 3, decoration: DecorationKind.CeilingLight },
  ]);
});

Deno.test("compileTiledMap lets enemy archetypes supply display names", () => {
  const compiled = compileTiledMap(
    tiledMap({
      width: 1,
      height: 1,
      objects: [
        object({
          x: 0,
          y: 0,
          type: "enemy",
          properties: [
            property("dir", "north"),
            property("archetype", "networkNeophyte"),
          ],
        }),
      ],
    }),
    compileOptions(),
  );

  assertEquals(compiled.gameMap.entities, [
    {
      prefab: "enemy",
      x: 0,
      y: 0,
      dir: 0,
      archetype: EnemyArchetype.NetworkNeophyte,
    },
  ]);
});

Deno.test("compileTiledMap compiles optional colored lights", () => {
  const compiled = compileTiledMap(
    tiledMap({
      width: 3,
      height: 3,
      lightObjects: [
        object({
          x: TILE_SIZE,
          y: TILE_SIZE,
          properties: [
            property("color", "#ff8844"),
            property("radius", 3),
            property("flickerAmount", 0.25),
            property("flickerSpeed", 7),
          ],
        }),
      ],
    }),
    compileOptions(),
  );

  assertEquals(compiled.gameMap.entities, [
    { prefab: "light", x: 1, y: 1, color: "#ff8844", radius: 3, flickerAmount: 0.25, flickerSpeed: 7 },
  ]);
});

type TiledMapOverrides = {
  readonly width?: number;
  readonly height?: number;
  readonly terrainData?: readonly number[];
  readonly objects?: readonly TiledObject[];
  readonly lightObjects?: readonly TiledObject[];
  readonly properties?: readonly TiledProperty[];
};

type CompileOptionOverrides = {
  readonly sourcePath?: string;
  readonly templates?: Readonly<Record<string, TiledTemplate>>;
};

function compileOptions(overrides: CompileOptionOverrides = {}) {
  return {
    ...overrides,
    tilesets: {
      "markers.tsj": {
        name: "markers",
        tilecount: 8,
        tiles: [
          {
            id: 2,
            type: "item",
            properties: [property("item", "cannonAmmo"), property("amount", 2)],
          },
        ],
      },
    },
  };
}

function tiledMap(overrides: TiledMapOverrides = {}): TiledMap {
  const width = overrides.width ?? 1;
  const height = overrides.height ?? 1;
  return {
    type: "map",
    orientation: "orthogonal",
    infinite: false,
    width,
    height,
    tilewidth: TILE_SIZE,
    tileheight: TILE_SIZE,
    properties: overrides.properties ?? [
      property("name", "Fixture"),
      property("palette", "test"),
      property("campaignOrder", 7),
    ],
    tilesets: [
      {
        firstgid: TERRAIN_FIRST_GID,
        name: "terrain",
        tilecount: TERRAIN_CATALOG.length,
        tiles: [
          { id: 0, properties: [property("terrainId", 0), property("blocking", false)] },
          { id: 2, properties: [property("terrainId", 999), property("blocking", false)] },
          { id: 5, properties: [property("terrainId", 5), property("blocking", false)] },
          {
            id: DEFAULT_WALL_TERRAIN_ID,
            properties: [property("terrainId", DEFAULT_WALL_TERRAIN_ID), property("blocking", true)],
          },
          {
            id: DEFAULT_BARS_TERRAIN_ID,
            properties: [
              property("terrainId", DEFAULT_BARS_TERRAIN_ID),
              property("terrainKind", "barrier"),
              property("blocking", true),
              property("blocksSight", false),
              property("blocksAttacks", true),
              property("barrierTexture", "bars"),
            ],
          },
        ],
      },
      {
        firstgid: MARKER_FIRST_GID,
        source: "markers.tsj",
      },
    ],
    layers: [
      {
        id: 1,
        name: "terrain",
        type: "tilelayer",
        width,
        height,
        data: overrides.terrainData ?? Array.from({ length: width * height }, () => TERRAIN_FIRST_GID),
      },
      {
        id: 2,
        name: "objects",
        type: "objectgroup",
        objects: overrides.objects ?? [],
      },
      ...(overrides.lightObjects === undefined ? [] : [{
        id: 3,
        name: "lights",
        type: "objectgroup",
        objects: overrides.lightObjects,
      }]),
    ],
  };
}

function object(overrides: Partial<TiledObject>): TiledObject {
  return {
    id: 1,
    x: 0,
    y: 0,
    width: TILE_SIZE,
    height: TILE_SIZE,
    visible: true,
    rotation: 0,
    ...overrides,
  };
}

function property(name: string, value: TiledProperty["value"]): TiledProperty {
  return { name, value };
}

function template(
  overrides: {
    readonly object: TiledObject;
    readonly tilesetFirstGid?: number;
  },
): TiledTemplate {
  return {
    type: "template",
    tileset: {
      firstgid: overrides.tilesetFirstGid ?? MARKER_FIRST_GID,
      source: "markers.tsj",
    },
    object: overrides.object,
  };
}
