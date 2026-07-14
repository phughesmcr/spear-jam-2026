import { SpriteId } from "@/src/game/content/sprite_ids.ts";
import {
  createFirstPersonAssetCatalog,
  firstPersonSpriteDefinition,
  texturePackFrame,
  texturePackSlot,
  validateFirstPersonAssetCatalog,
} from "@/src/game/presentation/first_person/assets/catalog.ts";
import { createFallbackAtlas } from "@/src/game/presentation/first_person/assets/fallbacks.ts";
import { assertEquals, assertStrictEquals, assertThrows } from "@std/assert";

Deno.test("first-person catalog owns sprite sources and presentation metadata", () => {
  const tree = firstPersonSpriteDefinition(SpriteId.DecorTree1);
  assertEquals(tree?.source?.src.endsWith("/assets/game/sprites/tree_1.png"), true);
  assertEquals(tree?.scale, 1);
  assertEquals(tree?.elevation, 0);

  const core = firstPersonSpriteDefinition(SpriteId.MainframeCore);
  assertEquals(core?.scale, 5);
  assertEquals(core?.ceilingClipDistance, 8);

  const enemy = firstPersonSpriteDefinition(SpriteId.DigitalDog);
  assertEquals(enemy?.source?.sheet, "directional");
  assertEquals(enemy?.source?.cropFrame, [0, 0, 0.25, 0.25]);
  assertEquals(enemy?.source?.lightmapSrc?.endsWith("/assets/game/sprites/digital_dog_lightmap.png"), true);
});

Deno.test("texture-pack slots and frames are deterministic", () => {
  assertEquals(texturePackSlot("walls", "pack1:0,0"), 9);
  assertEquals(texturePackSlot("walls", "pack2:3,2"), 9 + 20 + 2 * 5 + 3);
  assertEquals(texturePackSlot("walls", "pack3:4,3"), 9 + 40 + 3 * 5 + 4);
  assertEquals(texturePackSlot("planes", "pack1:0,0"), 4);
  assertEquals(texturePackSlot("planes", "pack3:4,3"), 4 + 40 + 3 * 5 + 4);
  assertEquals(texturePackFrame("pack2:3,2"), [3 / 5, 2 / 4, 1 / 5, 1 / 4]);
});

Deno.test("fallback atlas prepopulates deterministic pack and sprite slots", () => {
  const atlas = createFallbackAtlas();

  assertStrictEquals(atlas.walls[texturePackSlot("walls", "pack1:0,0")], atlas.walls[0]);
  assertStrictEquals(atlas.walls[texturePackSlot("walls", "pack3:4,3")], atlas.walls[0]);
  assertStrictEquals(atlas.planes[texturePackSlot("planes", "pack1:0,0")], atlas.planes[0]);
  assertStrictEquals(atlas.planes[texturePackSlot("planes", "pack3:4,3")], atlas.planes[0]);

  const enemy = firstPersonSpriteDefinition(SpriteId.DigitalDog)!;
  assertStrictEquals(atlas.sprites[enemy.slot], atlas.sprites[enemy.slot + 15]);
  assertEquals(atlas.spriteLightmaps.length, 0);
});

Deno.test("catalog validation rejects layer collisions and numeric overflow", () => {
  const catalog = createFirstPersonAssetCatalog();
  const [first, second, ...rest] = catalog.sprites;
  if (first === undefined || second === undefined) throw new Error("Expected sprite catalog fixtures.");

  assertThrows(
    () =>
      validateFirstPersonAssetCatalog({
        ...catalog,
        sprites: [first, { ...second, slot: first.slot }, ...rest],
      }),
    Error,
    "sprite slot",
  );
  assertThrows(
    () =>
      validateFirstPersonAssetCatalog({
        ...catalog,
        sprites: [{ ...first, slot: 32_768 }, second, ...rest],
      }),
    Error,
    "Int16",
  );
  assertThrows(
    () =>
      validateFirstPersonAssetCatalog({
        ...catalog,
        sprites: catalog.sprites.slice(0, -1),
      }),
    Error,
    "neither defined nor explicitly excluded",
  );
});
