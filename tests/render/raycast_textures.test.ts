import { assert, assertEquals } from "@std/assert";
import { bakeSolidTexture, bakeTexture, SHADE_BANDS, TEX_SHIFT, TEX_SIZE } from "@/src/render/raycast/textures.ts";
import type { TexelSource } from "@/src/render/raycast/textures.ts";

function sourceFromRgba(width: number, height: number, rgba: readonly number[]): TexelSource {
  return { width, height, data: new Uint8ClampedArray(rgba) };
}

function texelBytes(texels: Uint32Array, index: number): readonly [number, number, number, number] {
  const bytes = new Uint8Array(texels.buffer, index * 4, 4);
  return [bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!];
}

Deno.test("bakeTexture packs opaque texels in ImageData byte order", () => {
  const baked = bakeTexture(sourceFromRgba(1, 1, [200, 100, 50, 255]));

  assert(baked.opaque);
  assertEquals(baked.bands.length, SHADE_BANDS);
  assertEquals(texelBytes(baked.bands[0]!, 0), [200, 100, 50, 255]);
  assertEquals(texelBytes(baked.bands[0]!, TEX_SIZE * TEX_SIZE - 1), [200, 100, 50, 255]);
});

Deno.test("bakeTexture darkens each shade band and keeps alpha opaque", () => {
  const baked = bakeTexture(sourceFromRgba(1, 1, [255, 128, 64, 255]));

  let previousRed = 256;
  for (let band = 0; band < SHADE_BANDS; band++) {
    const [red, , , alpha] = texelBytes(baked.bands[band]!, 0);
    assert(red < previousRed, `band ${band} should be darker than band ${band - 1}`);
    assertEquals(alpha, 255);
    previousRed = red;
  }
  assertEquals(texelBytes(baked.bands[SHADE_BANDS - 1]!, 0)[0], (255 / SHADE_BANDS) | 0);
});

Deno.test("bakeTexture maps transparent texels to the zero sentinel", () => {
  const baked = bakeTexture(sourceFromRgba(1, 2, [255, 0, 0, 255, 0, 255, 0, 0]));

  assert(!baked.opaque);
  // Top source half is opaque red, bottom half fully transparent.
  assertEquals(texelBytes(baked.bands[0]!, 0), [255, 0, 0, 255]);
  assertEquals(baked.bands[0]![(TEX_SIZE - 1) << TEX_SHIFT], 0);
});

Deno.test("bakeTexture keeps opaque black distinct from the transparent sentinel", () => {
  const baked = bakeTexture(sourceFromRgba(1, 1, [0, 0, 0, 255]));

  assert(baked.opaque);
  assert(baked.bands[SHADE_BANDS - 1]![0] !== 0);
});

Deno.test("bakeTexture transpose stores texels column-major", () => {
  // Left source half red, right half blue.
  const source = sourceFromRgba(2, 1, [255, 0, 0, 255, 0, 0, 255, 255]);
  const rowMajor = bakeTexture(source);
  const columnMajor = bakeTexture(source, { transpose: true });

  const rightX = TEX_SIZE - 1;
  assertEquals(texelBytes(rowMajor.bands[0]!, rightX), [0, 0, 255, 255]);
  assertEquals(texelBytes(columnMajor.bands[0]!, rightX << TEX_SHIFT), [0, 0, 255, 255]);
  assertEquals(texelBytes(columnMajor.bands[0]!, rightX), [255, 0, 0, 255]);
});

Deno.test("bakeTexture applies tint before shading and clamps", () => {
  const baked = bakeTexture(sourceFromRgba(1, 1, [100, 100, 200, 255]), { tint: [2, 0.5, 2] });

  assertEquals(texelBytes(baked.bands[0]!, 0), [200, 50, 255, 255]);
});

Deno.test("bakeSolidTexture fills every texel", () => {
  const baked = bakeSolidTexture(10, 20, 30);

  assert(baked.opaque);
  assertEquals(texelBytes(baked.bands[0]!, 0), [10, 20, 30, 255]);
  assertEquals(texelBytes(baked.bands[0]!, TEX_SIZE * TEX_SIZE - 1), [10, 20, 30, 255]);
});
