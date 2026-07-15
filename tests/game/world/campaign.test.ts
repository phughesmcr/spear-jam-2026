import { KeyColor } from "@/src/game/content/map_entities.ts";
import { SoundId } from "@/src/game/model/sound.ts";
import { CAMPAIGN, compileCampaign } from "@/src/game/world/campaign.ts";
import type { GameMap, TerrainTile } from "@/src/game/world/map.ts";
import {
  DEFAULT_BARS_TERRAIN_ID,
  DEFAULT_WALL_TERRAIN_ID,
  isTexturePackRef,
  SKY_CEILING_TEXTURE,
} from "@/src/game/world/terrain_palette.ts";
import {
  assert,
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";

Deno.test("compileCampaign publishes one coherent campaign", () => {
  const campaign = compileCampaign({
    startMapName: "Start Map",
    maps: [
      {
        name: "First Map",
        tiles: [[0, 0, 0]],
        entities: [
          { prefab: "player", x: 0, y: 0, dir: 1 },
          { prefab: "uplinkCode", x: 1, y: 0 },
          { prefab: "uplinkTerminal", x: 2, y: 0, goto: "Start Map" },
        ],
      },
      {
        name: "Start Map",
        tiles: [[0, 0, 0]],
        entities: [
          { prefab: "player", x: 0, y: 0, dir: 1 },
          { prefab: "uplinkCode", x: 1, y: 0 },
          { prefab: "uplinkTerminal", x: 2, y: 0, goto: "victory" },
        ],
      },
    ],
  });

  assertEquals(campaign.maps.map((map) => map.name), ["First Map", "Start Map"]);
  assertStrictEquals(campaign.startMap, campaign.map("Start Map"));
  assertStrictEquals(campaign.startMap, campaign.maps[1]);
  assertEquals(campaign.codeForDestination("victory"), 1);
  assertEquals(campaign.codeForDestination("First Map"), 2);
  assertEquals(campaign.codeForDestination("Start Map"), 3);

  const mapDestination = campaign.destinationForCode(campaign.codeForDestination("First Map"));
  assertEquals(mapDestination.kind, "map");
  if (mapDestination.kind === "map") {
    assertStrictEquals(mapDestination.map, campaign.map("First Map"));
  }

  const victoryDestination = campaign.destinationForCode(campaign.codeForDestination("victory"));
  assertEquals(victoryDestination, { kind: "victory" });
});

Deno.test("separately compiled campaigns keep maps and destination tables isolated", () => {
  const first = compileCampaign(twoMapCampaign("First Start", "First Exit"));
  const second = compileCampaign(twoMapCampaign("Second Start", "Second Exit"));

  assertNotStrictEquals(first.startMap, second.startMap);
  assertStrictEquals(
    mapDestination(first, first.codeForDestination("First Exit")),
    first.map("First Exit"),
  );
  assertStrictEquals(
    mapDestination(second, second.codeForDestination("Second Exit")),
    second.map("Second Exit"),
  );
  assertThrows(() => first.map("Second Exit"), Error, "Unknown map");
  assertThrows(
    () => first.codeForDestination("Second Exit"),
    Error,
    "Unknown terminal destination",
  );
});

Deno.test("failed compilation does not mutate an existing campaign snapshot", () => {
  const campaign = compileCampaign(twoMapCampaign("Stable Start", "Stable Exit"));
  const startMap = campaign.startMap;
  const maps = [...campaign.maps];
  const exitCode = campaign.codeForDestination("Stable Exit");

  assertThrows(
    () =>
      compileCampaign({
        startMapName: "Broken",
        maps: [{ name: "Broken", tiles: [[0]], entities: [] }],
      }),
    Error,
    "expected exactly one player spawn",
  );

  assertStrictEquals(campaign.startMap, startMap);
  assertStrictEquals(campaign.maps[0], maps[0]);
  assertStrictEquals(campaign.maps[1], maps[1]);
  assertStrictEquals(mapDestination(campaign, exitCode), maps[1]);
});

Deno.test("compiled campaign reports unknown map, destination, and code lookups", () => {
  const campaign = compileCampaign(twoMapCampaign("Start", "Exit"));

  assertThrows(() => campaign.map("Missing"), Error, "Unknown map: Missing");
  assertThrows(
    () => campaign.codeForDestination("Missing"),
    Error,
    'Unknown terminal destination "Missing"',
  );
  assertThrows(
    () => campaign.destinationForCode(999),
    Error,
    "Unknown terminal destination code: 999",
  );
});

Deno.test("compileCampaign rejects duplicate, missing, and reserved campaign names", () => {
  assertCompilationFails(
    { maps: [authoredMap("Start", [[0, 0, 0]], completionEntities())] },
    "startMapName",
  );
  assertCompilationFails(
    {
      startMapName: "Start",
      maps: [{ tiles: [[0, 0, 0]], entities: completionEntities() }],
    },
    "maps.0.name",
  );
  assertCompilationFails(
    {
      startMapName: "Missing",
      maps: [authoredMap("Start", [[0, 0, 0]], completionEntities())],
    },
    'Unknown start map "Missing"',
  );
  assertCompilationFails(
    {
      startMapName: "Duplicate",
      maps: [
        authoredMap("Duplicate", [[0, 0, 0]], completionEntities()),
        authoredMap("Duplicate", [[0, 0, 0]], completionEntities()),
      ],
    },
    "map names must be unique",
  );
  assertCompilationFails(
    authoredCampaign("victory", [[0, 0, 0]], completionEntities()),
    'Map name "victory" is reserved',
  );
});

Deno.test("compileCampaign rejects malformed native map content", () => {
  assertCompilationFails(
    {
      startMapName: "Fixture",
      maps: [{
        name: "Fixture",
        palette: "boot_sector",
        tiles: [[0]],
        entities: [],
      }],
    },
    'Unrecognized key: "palette"',
  );
  assertCompilationFails(
    {
      startMapName: "Fixture",
      maps: [{
        name: "Fixture",
        tiles: [[0]],
        entities: [{ prefab: "player", x: 0, y: 0, dir: 1, goto: "victory" }],
      }],
    },
    'Unrecognized key: "goto"',
  );
  assertCompilationFails(
    campaignWith({
      prefab: "enemy",
      x: 3,
      y: 0,
      facing: "east",
      attackMinDamage: 2,
    }),
    "Unrecognized keys",
  );
});

Deno.test("compileCampaign preserves semantic authored entity fields", () => {
  const enemy = {
    prefab: "enemy",
    x: 3,
    y: 0,
    dir: 1,
    attack: { minDamage: 2, maxDamage: 4, pattern: "adjacent", targets: "all" },
  } as const;
  const campaign = compileCampaign(campaignWith(enemy));

  assertEquals(campaign.startMap.entities[3], enemy);
});

Deno.test("compileCampaign rejects unknown map content ids", () => {
  const invalidEntities = [
    { prefab: "npc", x: 3, y: 0, dir: 3, displayName: "missingName" },
    { prefab: "npc", x: 3, y: 0, dir: 3, displayName: "john", dialogueTreeId: "missingDialogue" },
    { prefab: "npc", x: 3, y: 0, dir: 3, displayName: "john", storyId: "missingStoryTarget" },
    { prefab: "npc", x: 3, y: 0, dir: 3, displayName: "john", onTalkEvent: "missingStoryEvent" },
    { prefab: "enemy", x: 3, y: 0, dir: 3, archetype: "missingEnemy" },
    { prefab: "enemy", x: 3, y: 0, dir: 3, displayName: "missingName" },
    { prefab: "door", x: 3, y: 0, examineTextId: "missingExamineText" },
  ];

  for (const entity of invalidEntities) {
    assertCompilationFails(campaignWith(entity), "Invalid campaign content");
  }
});

Deno.test("shipped campaign preserves its authored signature", () => {
  const signature = CAMPAIGN.maps.map((map) => ({
    name: map.name,
    width: map.terrain.tiles[0]?.length,
    height: map.terrain.tiles.length,
    entities: map.entities.length,
  }));

  assertEquals(CAMPAIGN.startMap.name, "Boot Sector");
  assertStrictEquals(CAMPAIGN.startMap, CAMPAIGN.map("Boot Sector"));
  assertEquals(signature, [
    { name: "Boot Sector", width: 15, height: 18, entities: 59 },
    { name: "Data Conduit", width: 15, height: 13, entities: 35 },
    { name: "Firewall", width: 17, height: 17, entities: 62 },
    { name: "The Nexus", width: 17, height: 17, entities: 50 },
    { name: "Mainframe Core", width: 19, height: 20, entities: 72 },
  ]);
  assertEquals(CAMPAIGN.maps.reduce((count, map) => count + map.entities.length, 0), 278);
});

Deno.test("shipped campaign uses valid texture-pack terrain palettes", () => {
  for (const map of CAMPAIGN.maps) {
    assert(
      map.terrain.palette.some((tile) => terrainTextures(tile).length > 0),
      `${map.name} should declare terrain textures.`,
    );
    assert(
      map.terrain.palette.every(terrainTexturesAreValid),
      `${map.name} should use pack-backed floor/wall textures and pack-backed or sky ceilings.`,
    );
  }
});

Deno.test("shipped campaign terrain palettes vary floor, ceiling, and wall textures", () => {
  for (const map of CAMPAIGN.maps) {
    const textures = paletteTerrainTextures(map.terrain.palette);
    assert(
      textures.floors.size >= 3,
      `${map.name} palette should define at least 3 floor textures, got ${textures.floors.size}.`,
    );
    assert(
      textures.ceilings.size >= 3,
      `${map.name} palette should define at least 3 ceiling textures, got ${textures.ceilings.size}.`,
    );
    assert(
      textures.walls.size >= 3,
      `${map.name} palette should define at least 3 wall textures, got ${textures.walls.size}.`,
    );
  }
});

Deno.test("compileCampaign rejects invalid terrain during construction", () => {
  assertCompilationFails(
    authoredCampaign("Empty Terrain", [], []),
    "maps.0.tiles",
  );
  assertCompilationFails(
    authoredCampaign("Ragged Terrain", [[0, 0], [0]], completionEntities()),
    'Map "Ragged Terrain" terrain must be rectangular',
  );
  assertCompilationFails(
    authoredCampaign("Missing Palette Tile", [[999]], completionEntities()),
    'Map "Missing Palette Tile" terrain tile 999 at (0,0) is missing from its palette.',
  );
});

Deno.test("compileCampaign requires exactly one player spawn", () => {
  assertCompilationFails(
    authoredCampaign("No Player", [[0]], []),
    "No Player: expected exactly one player spawn, found 0.",
  );
  assertCompilationFails(
    authoredCampaign("Two Players", [[0, 0]], [
      { prefab: "player", x: 0, y: 0, dir: 1 },
      { prefab: "player", x: 1, y: 0, dir: 3 },
    ]),
    "Two Players: expected exactly one player spawn, found 2.",
  );
});

Deno.test("compileCampaign rejects overlapping blocking entities", () => {
  assertCompilationFails(
    authoredCampaign("Overlapping Blockers", [[0]], [
      { prefab: "player", x: 0, y: 0, dir: 1 },
      { prefab: "enemy", x: 0, y: 0, dir: 3 },
    ]),
    "Overlapping Blockers: enemy at (0,0) overlaps blocking player.",
  );
});

Deno.test("compileCampaign reports entities outside terrain bounds", () => {
  assertCompilationFails(
    authoredCampaign("Out Of Bounds", [[0]], [
      { prefab: "player", x: 0, y: 0, dir: 1 },
      { prefab: "key", x: 1, y: 0, color: KeyColor.Red },
      { prefab: "uplinkTerminal", x: 0, y: 1, goto: "victory" },
    ]),
    "Out Of Bounds: key at (1,0) is outside the 1x1 map.",
    "Out Of Bounds: uplinkTerminal at (0,1) is outside the 1x1 map.",
  );
});

Deno.test("compileCampaign requires terminals to point to known destinations", () => {
  assertCompilationFails(
    authoredCampaign("Start", [[0, 0, 0]], [
      { prefab: "player", x: 0, y: 0, dir: 1 },
      { prefab: "uplinkCode", x: 1, y: 0 },
      { prefab: "uplinkTerminal", x: 2, y: 0, goto: "Missing Map" },
    ]),
    'Start: uplink terminal at (2,0) points to unknown map "Missing Map".',
  );
});

Deno.test("compileCampaign requires locked-door keys to be obtainable", () => {
  assertCompilationFails(
    authoredCampaign("Missing Key", [
      [0, 0, 0],
      [DEFAULT_WALL_TERRAIN_ID, 0, DEFAULT_WALL_TERRAIN_ID],
      [0, 0, 0],
    ], [
      { prefab: "player", x: 0, y: 0, dir: 1 },
      { prefab: "door", x: 1, y: 1, locked: true, color: KeyColor.Red },
      { prefab: "uplinkCode", x: 1, y: 0 },
      { prefab: "uplinkTerminal", x: 2, y: 0, goto: "victory" },
    ]),
    "Missing Key: locked red door at (1,1) has no obtainable red key before it is needed.",
  );
});

Deno.test("compileCampaign validates terrain placement and doorway spans", () => {
  assertCompilationFails(
    authoredCampaign("Bad Door", [
      [0, 0, 0],
      [0, DEFAULT_WALL_TERRAIN_ID, 0],
      [0, 0, 0],
    ], [
      { prefab: "player", x: 0, y: 0, dir: 1 },
      { prefab: "door", x: 1, y: 1 },
      { prefab: "uplinkCode", x: 0, y: 1 },
      { prefab: "uplinkTerminal", x: 2, y: 1, goto: "victory" },
    ]),
    "Bad Door: door at (1,1) is placed on blocking terrain.",
    "Bad Door: door at (1,1) must sit between exactly one opposite pair of blocking wall tiles.",
  );

  const campaign = compileCampaign(authoredCampaign("Good Door", [
    [0, 0, 0],
    [DEFAULT_WALL_TERRAIN_ID, 0, DEFAULT_WALL_TERRAIN_ID],
    [0, 0, 0],
  ], [
    { prefab: "player", x: 0, y: 0, dir: 1 },
    { prefab: "door", x: 1, y: 1 },
    { prefab: "uplinkCode", x: 1, y: 0 },
    { prefab: "uplinkTerminal", x: 2, y: 0, goto: "victory" },
  ]));
  assertEquals(campaign.startMap.name, "Good Door");
});

Deno.test("compileCampaign allows sound emitters on blocking terrain", () => {
  const campaign = compileCampaign(authoredCampaign("Ambient Wall", [
    [0, DEFAULT_WALL_TERRAIN_ID, 0],
    [0, 0, 0],
  ], [
    { prefab: "player", x: 0, y: 1, dir: 1 },
    { prefab: "sound", x: 1, y: 0, soundId: SoundId.AmbientHum, radius: 5 },
    { prefab: "uplinkCode", x: 0, y: 0 },
    { prefab: "uplinkTerminal", x: 2, y: 1, goto: "victory" },
  ]));
  assertEquals(campaign.startMap.name, "Ambient Wall");
});

Deno.test("compileCampaign accepts anchored barrier runs and rejects floating barriers", () => {
  compileCampaign(authoredCampaign("Good Barrier", [
    [0, 0, 0, 0, 0],
    [0, 0, DEFAULT_WALL_TERRAIN_ID, DEFAULT_BARS_TERRAIN_ID, DEFAULT_WALL_TERRAIN_ID],
    [0, 0, 0, 0, 0],
  ], [
    { prefab: "player", x: 0, y: 0, dir: 1 },
    { prefab: "uplinkCode", x: 0, y: 1 },
    { prefab: "uplinkTerminal", x: 1, y: 1, goto: "victory" },
  ]));

  compileCampaign(authoredCampaign("Fence Barrier", [
    [0, 0, 0, 0, 0],
    [
      DEFAULT_WALL_TERRAIN_ID,
      DEFAULT_BARS_TERRAIN_ID,
      DEFAULT_BARS_TERRAIN_ID,
      DEFAULT_BARS_TERRAIN_ID,
      0,
    ],
    [0, 0, 0, DEFAULT_BARS_TERRAIN_ID, 0],
  ], [
    { prefab: "player", x: 0, y: 0, dir: 1 },
    { prefab: "uplinkCode", x: 1, y: 0 },
    { prefab: "uplinkTerminal", x: 3, y: 0, goto: "victory" },
  ]));

  assertCompilationFails(
    authoredCampaign("Bad Barrier", [
      [0, 0, 0],
      [0, DEFAULT_BARS_TERRAIN_ID, 0],
      [0, 0, 0],
    ], [
      { prefab: "player", x: 0, y: 0, dir: 1 },
      { prefab: "uplinkCode", x: 0, y: 1 },
      { prefab: "uplinkTerminal", x: 2, y: 1, goto: "victory" },
    ]),
    "Bad Barrier: barrier terrain at (1,1) must be anchored to movement-blocking terrain on at least one side, and must not sit in a four-way blocking cross.",
  );
});

Deno.test("compileCampaign ignores blocking actors that can be cleared during play", () => {
  const campaign = compileCampaign(authoredCampaign("Actor Corridor", [
    [0, DEFAULT_WALL_TERRAIN_ID, 0],
    [0, 0, 0],
    [0, DEFAULT_WALL_TERRAIN_ID, 0],
  ], [
    { prefab: "player", x: 0, y: 1, dir: 1 },
    { prefab: "npc", x: 1, y: 1, dir: 1, displayName: "john" },
    { prefab: "uplinkCode", x: 0, y: 0 },
    { prefab: "uplinkTerminal", x: 2, y: 1, goto: "victory" },
  ]));
  assertEquals(campaign.startMap.name, "Actor Corridor");
});

Deno.test("compileCampaign accepts a reachable spear turret", () => {
  const campaign = compileCampaign(authoredCampaign("Mainframe Core", [[0, 0, 0]], [
    { prefab: "player", x: 0, y: 0, dir: 1 },
    { prefab: "spearTurret", x: 2, y: 0 },
  ]));
  assertEquals(campaign.startMap.name, "Mainframe Core");
});

Deno.test("compileCampaign requires a terminal reachable with code and keys", () => {
  assertCompilationFails(
    authoredCampaign("Blocked Terminal", [
      [0, DEFAULT_WALL_TERRAIN_ID, 0],
      [0, DEFAULT_WALL_TERRAIN_ID, 0],
      [0, DEFAULT_WALL_TERRAIN_ID, 0],
    ], [
      { prefab: "player", x: 0, y: 0, dir: 1 },
      { prefab: "uplinkCode", x: 0, y: 2 },
      { prefab: "uplinkTerminal", x: 2, y: 1, goto: "victory" },
    ]),
    "Blocked Terminal: no uplink terminal is reachable after collecting an uplink code and required keys.",
  );
});

type AuthoredEntity = Readonly<Record<string, unknown>>;

function authoredCampaign(
  name: string,
  tiles: readonly (readonly number[])[],
  entities: readonly AuthoredEntity[],
): unknown {
  return {
    startMapName: name,
    maps: [authoredMap(name, tiles, entities)],
  };
}

function authoredMap(
  name: string,
  tiles: readonly (readonly number[])[],
  entities: readonly AuthoredEntity[],
): unknown {
  return { name, tiles, entities };
}

function completionEntities(goto = "victory"): readonly AuthoredEntity[] {
  return [
    { prefab: "player", x: 0, y: 0, dir: 1 },
    { prefab: "uplinkCode", x: 1, y: 0 },
    { prefab: "uplinkTerminal", x: 2, y: 0, goto },
  ];
}

function twoMapCampaign(startMapName: string, exitMapName: string): unknown {
  return {
    startMapName,
    maps: [
      authoredMap(startMapName, [[0, 0, 0]], completionEntities(exitMapName)),
      authoredMap(exitMapName, [[0, 0, 0]], completionEntities()),
    ],
  };
}

function campaignWith(entity: AuthoredEntity): unknown {
  return authoredCampaign("Fixture", [[0, 0, 0, 0]], [
    { prefab: "player", x: 0, y: 0, dir: 1 },
    { prefab: "uplinkCode", x: 1, y: 0 },
    { prefab: "uplinkTerminal", x: 2, y: 0, goto: "victory" },
    entity,
  ]);
}

function assertCompilationFails(source: unknown, ...messages: readonly string[]): void {
  const error = assertThrows(() => compileCampaign(source), Error);
  for (const message of messages) assertStringIncludes(error.message, message);
}

function mapDestination(
  campaign: ReturnType<typeof compileCampaign>,
  code: number,
): GameMap {
  const destination = campaign.destinationForCode(code);
  if (destination.kind === "victory") throw new Error(`Expected map destination for code ${code}.`);
  return destination.map;
}

function terrainTextures(tile: TerrainTile): readonly string[] {
  if (tile.kind === "wall") return [tile.wall_texture];
  return [tile.floor_texture, tile.ceiling_texture];
}

function terrainTexturesAreValid(tile: TerrainTile): boolean {
  if (tile.kind === "wall") return isTexturePackRef(tile.wall_texture);
  return isTexturePackRef(tile.floor_texture) &&
    (isTexturePackRef(tile.ceiling_texture) || tile.ceiling_texture === SKY_CEILING_TEXTURE);
}

function paletteTerrainTextures(palette: readonly TerrainTile[]): {
  readonly floors: ReadonlySet<string>;
  readonly ceilings: ReadonlySet<string>;
  readonly walls: ReadonlySet<string>;
} {
  const floors = new Set<string>();
  const ceilings = new Set<string>();
  const walls = new Set<string>();
  for (const tile of palette) {
    if (tile.kind === "wall") {
      walls.add(tile.wall_texture);
      continue;
    }
    floors.add(tile.floor_texture);
    ceilings.add(tile.ceiling_texture);
  }
  return { floors, ceilings, walls };
}
