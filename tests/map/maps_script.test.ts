import { assert, assertEquals } from "@std/assert";
import {
  buildScaffoldMap,
  generatedAutomappingSources,
  generatedTemplateSources,
  generatedTerrainSources,
  generatedTiledProjectSource,
  mapNameForTiledMap,
  type RgbaImage,
  startMapUrlPath,
} from "@/scripts/maps.ts";
import { AMBIENT_SOUND_IDS } from "@/src/game/sound.ts";

Deno.test("buildScaffoldMap creates a bordered Tiled map ready for authoring", () => {
  const map = buildScaffoldMap({
    name: "Cache Node",
    width: 5,
    height: 4,
    campaignOrder: 6,
  });

  assertEquals(map.width, 5);
  assertEquals(map.height, 4);
  assertEquals(map.tilewidth, 16);
  assertEquals(map.tileheight, 16);
  assertEquals(map.layers.map((layer) => [layer.name, layer.type]), [
    ["terrain", "tilelayer"],
    ["objects", "objectgroup"],
    ["lights", "objectgroup"],
    ["sounds", "objectgroup"],
  ]);
  assertEquals(map.layers[0]?.data, [
    61,
    61,
    61,
    61,
    61,
    61,
    1,
    1,
    1,
    61,
    61,
    1,
    1,
    1,
    61,
    61,
    61,
    61,
    61,
    61,
  ]);
  assertEquals(map.layers[1]?.objects, []);
  assertEquals(map.layers[2]?.objects, []);
  assertEquals(map.layers[3]?.objects, []);
  assertEquals(map.tilesets?.map((tileset) => tileset.source ?? tileset.name), [
    "terrain/floors.tsj",
    "terrain/walls.tsj",
    "terrain/barriers.tsj",
    "entity_markers.tsj",
  ]);
  assertEquals(map.properties?.map((property) => [property.name, property.value]), [
    ["campaignOrder", 6],
    ["name", "Cache Node"],
  ]);
});

Deno.test("generatedTemplateSources includes all mapper-facing templates", () => {
  const templates = generatedTemplateSources();

  for (
    const path of [
      "game_assets/maps/templates/player.tx",
      "game_assets/maps/templates/npc_john.tx",
      "game_assets/maps/templates/enemy_agentic_acolyte.tx",
      "game_assets/maps/templates/door_red_locked.tx",
      "game_assets/maps/templates/key_yellow.tx",
      "game_assets/maps/templates/uplink_terminal_victory.tx",
      "game_assets/maps/templates/item_cannon_ammo.tx",
      "game_assets/maps/templates/decor_ceiling_light.tx",
    ]
  ) {
    assert(templates[path] !== undefined, `${path} should be generated.`);
  }
});

Deno.test("generatedTiledProjectSource includes one-click play and automapping", () => {
  const project = JSON.parse(generatedTiledProjectSource()) as {
    automappingRulesFile: string;
    commands: readonly { readonly command: string; readonly executable: string; readonly arguments: string }[];
    folders: readonly string[];
    propertyTypes: readonly {
      readonly name: string;
      readonly type: string;
      readonly values?: readonly string[];
      readonly useAs?: readonly string[];
      readonly members?: readonly { readonly name: string }[];
    }[];
  };

  assertEquals(project.automappingRulesFile, "automap/rules.txt");
  assert(project.folders.includes("terrain"));
  assert(
    project.commands.some((command) =>
      command.command === "Play current map" && command.executable === "/bin/zsh" &&
      command.arguments === '-lc "deno task maps:play -- \\"%mapfile\\""'
    ),
  );
  assertEquals(project.propertyTypes.find((type) => type.name === "SoundId")?.values, AMBIENT_SOUND_IDS);

  const lightLayer = project.propertyTypes.find((type) => type.name === "light_layer");
  assertEquals(lightLayer?.type, "class");
  assertEquals(lightLayer?.useAs, ["layer"]);

  const lightObject = project.propertyTypes.find((type) => type.name === "light");
  assertEquals(lightObject?.type, "class");
  assertEquals(lightObject?.useAs, ["object"]);
  assertEquals(lightObject?.members?.map((member) => member.name), [
    "color",
    "radius",
    "flickerAmount",
    "flickerSpeed",
  ]);
});

Deno.test("generatedAutomappingSources includes reset and wall variant rules", () => {
  const sources = generatedAutomappingSources();
  const rules = sources["game_assets/maps/automap/rules.txt"];
  const variants = sources["game_assets/maps/automap/wall_variants.tiled.json"];

  assert(rules?.includes("reset_walls.tiled.json"));
  assert(rules?.includes("wall_variants.tiled.json"));
  assert(variants !== undefined);

  const map = JSON.parse(variants) as {
    layers: readonly { readonly name: string; readonly data: readonly number[] }[];
  };
  assertEquals(map.layers.map((layer) => layer.name), ["input_terrain", "output_terrain"]);
  assert(map.layers[1]!.data.includes(62));
  assert(map.layers[1]!.data.includes(63));
});

Deno.test("generatedTerrainSources creates shared texture-backed terrain tilesets", async () => {
  const sources = await generatedTerrainSources(fakeTexturePackImages());
  const floorsTileset = sources["game_assets/maps/terrain/floors.tsj"];
  const floorsPng = sources["game_assets/maps/terrain/floors.png"];
  const wallsTileset = sources["game_assets/maps/terrain/walls.tsj"];
  const wallsPng = sources["game_assets/maps/terrain/walls.png"];
  const barriersTileset = sources["game_assets/maps/terrain/barriers.tsj"];
  const barriersPng = sources["game_assets/maps/terrain/barriers.png"];

  assert(typeof floorsTileset === "string");
  assert(floorsPng instanceof Uint8Array);
  assert(typeof wallsTileset === "string");
  assert(wallsPng instanceof Uint8Array);
  assert(typeof barriersTileset === "string");
  assert(barriersPng instanceof Uint8Array);

  const floors = JSON.parse(floorsTileset) as {
    image: string;
    columns: number;
    tilecount: number;
    tiles: readonly {
      readonly id: number;
      readonly properties: readonly { readonly name: string; readonly value: unknown }[];
    }[];
  };
  const walls = JSON.parse(wallsTileset) as typeof floors;
  const barriers = JSON.parse(barriersTileset) as typeof floors;
  assertEquals(floors.image, "floors.png");
  assertEquals(floors.columns, 20);
  assertEquals(floors.tilecount, 60);
  assertEquals(
    floors.tiles[0]!.properties.find((property) => property.name === "floorTexture")?.value,
    "pack1:0,0",
  );
  assertEquals(
    floors.tiles[0]!.properties.find((property) => property.name === "terrainId")?.value,
    0,
  );
  assertEquals(
    floors.tiles[2]!.properties.find((property) => property.name === "ceilingTexture")?.value,
    "sky",
  );
  assertEquals(walls.image, "walls.png");
  assertEquals(walls.tilecount, 60);
  assertEquals(
    walls.tiles[0]!.properties.find((property) => property.name === "wallTexture")?.value,
    "pack1:0,0",
  );
  assertEquals(
    walls.tiles[0]!.properties.find((property) => property.name === "terrainId")?.value,
    60,
  );
  assertEquals(barriers.image, "barriers.png");
  assertEquals(barriers.tilecount, 2);
  assertEquals(
    barriers.tiles[0]!.properties.find((property) => property.name === "terrainKind")?.value,
    "barrier",
  );
  assertEquals(
    barriers.tiles[0]!.properties.find((property) => property.name === "blocking")?.value,
    true,
  );
  assertEquals(
    barriers.tiles[0]!.properties.find((property) => property.name === "blocksSight")?.value,
    false,
  );
  assertEquals(
    barriers.tiles[0]!.properties.find((property) => property.name === "blocksAttacks")?.value,
    true,
  );
  assertEquals(
    barriers.tiles[0]!.properties.find((property) => property.name === "barrierTexture")?.value,
    "bars",
  );
  assertEquals(
    new DataView(floorsPng.buffer, floorsPng.byteOffset, floorsPng.byteLength).getUint32(16),
    320,
  );
  assertEquals(
    new DataView(floorsPng.buffer, floorsPng.byteOffset, floorsPng.byteLength).getUint32(20),
    48,
  );
  assert(!includesBytes(floorsPng, [255, 0, 255, 255]));
  assert(includesBytes(wallsPng, [255, 0, 255, 255]));
});

Deno.test("mapNameForTiledMap and startMapUrlPath support current-map smoke testing", () => {
  const map = buildScaffoldMap({
    name: "Cache Node",
    width: 5,
    height: 4,
    campaignOrder: 6,
  });

  assertEquals(mapNameForTiledMap("cache.tiled.json", map), "Cache Node");
  assertEquals(startMapUrlPath("Cache Node"), "/?map=Cache%20Node");
});

function fakeTexturePackImages(): ReadonlyMap<string, RgbaImage> {
  return new Map(["pack1", "pack2", "pack3"].map((pack, index) => [pack, fakeTexturePackImage(index)]));
}

function fakeTexturePackImage(packIndex: number): RgbaImage {
  const width = 320;
  const height = 256;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = ((y * width) + x) * 4;
      pixels[offset] = (packIndex * 70 + x) % 256;
      pixels[offset + 1] = (packIndex * 50 + y) % 256;
      pixels[offset + 2] = (x + y) % 256;
      pixels[offset + 3] = 255;
    }
  }
  return { width, height, pixels };
}

function includesBytes(source: Uint8Array, needle: readonly number[]): boolean {
  for (let index = 0; index <= source.length - needle.length; index++) {
    let matches = true;
    for (let offset = 0; offset < needle.length; offset++) {
      if (source[index + offset] !== needle[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}
