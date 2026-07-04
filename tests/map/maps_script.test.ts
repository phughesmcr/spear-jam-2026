import { assert, assertEquals } from "@std/assert";
import {
  buildScaffoldMap,
  generatedAutomappingSources,
  generatedTemplateSources,
  generatedTerrainAuthoringPng,
  generatedTiledProjectSource,
  mapNameForTiledMap,
  startMapUrlPath,
} from "@/scripts/maps.ts";

Deno.test("buildScaffoldMap creates a bordered Tiled map ready for authoring", () => {
  const map = buildScaffoldMap({
    name: "Cache Node",
    palette: "data_conduit",
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
  ]);
  assertEquals(map.layers[0]?.data, [
    2,
    2,
    2,
    2,
    2,
    2,
    1,
    1,
    1,
    2,
    2,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    2,
    2,
  ]);
  assertEquals(map.layers[1]?.objects, []);
  assertEquals(map.tilesets?.map((tileset) => tileset.source ?? tileset.name), ["terrain", "entity_markers.tsj"]);
  assertEquals(map.properties?.map((property) => [property.name, property.value]), [
    ["campaignOrder", 6],
    ["name", "Cache Node"],
    ["palette", "data_conduit"],
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
    ]
  ) {
    assert(templates[path] !== undefined, `${path} should be generated.`);
  }
});

Deno.test("generatedTiledProjectSource includes one-click play and automapping", () => {
  const project = JSON.parse(generatedTiledProjectSource()) as {
    automappingRulesFile: string;
    commands: readonly { readonly command: string; readonly arguments: string }[];
  };

  assertEquals(project.automappingRulesFile, "automap/rules.txt");
  assert(
    project.commands.some((command) =>
      command.command === "Play current map" && command.arguments === 'task maps:play -- "%mapfile"'
    ),
  );
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
  assert(map.layers[1]!.data.includes(5));
  assert(map.layers[1]!.data.includes(6));
});

Deno.test("generatedTerrainAuthoringPng creates the expected Tiled terrain strip", () => {
  const png = generatedTerrainAuthoringPng();
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);

  assertEquals([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assertEquals(view.getUint32(16), 96);
  assertEquals(view.getUint32(20), 16);
});

Deno.test("mapNameForTiledMap and startMapUrlPath support current-map smoke testing", () => {
  const map = buildScaffoldMap({
    name: "Cache Node",
    palette: "data_conduit",
    width: 5,
    height: 4,
    campaignOrder: 6,
  });

  assertEquals(mapNameForTiledMap("cache.tiled.json", map), "Cache Node");
  assertEquals(startMapUrlPath("Cache Node"), "/?map=Cache%20Node");
});
