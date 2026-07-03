import { assert, assertEquals } from "@std/assert";
import {
  bakeSolidTexture,
  bakeTexture,
  SHADE_BANDS,
  TEX_MIP_SIZES,
  TEX_SHIFT,
  TEX_SIZE,
} from "@/src/render/raycast/textures.ts";
import type { BakedTexture, TexelSource } from "@/src/render/raycast/textures.ts";

function sourceFromRgba(width: number, height: number, rgba: readonly number[]): TexelSource {
  return { width, height, data: new Uint8ClampedArray(rgba) };
}

function texelBytes(texels: Uint32Array, index: number): readonly [number, number, number, number] {
  const bytes = new Uint8Array(texels.buffer, index * 4, 4);
  return [bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!];
}

function band(texture: BakedTexture, shade = 0, mip = 0): Uint32Array {
  return texture.mips[mip]!.bands[shade]!;
}

Deno.test("bakeTexture packs opaque texels in ImageData byte order", () => {
  const baked = bakeTexture(sourceFromRgba(1, 1, [200, 100, 50, 255]));

  assert(baked.opaque);
  assertEquals(baked.mips.map((mip) => mip.size), [...TEX_MIP_SIZES]);
  assertEquals(band(baked).length, TEX_SIZE * TEX_SIZE);
  assertEquals(band(baked, SHADE_BANDS - 1, TEX_MIP_SIZES.length - 1).length, 16 * 16);
  assertEquals(texelBytes(band(baked), 0), [200, 100, 50, 255]);
  assertEquals(texelBytes(band(baked), TEX_SIZE * TEX_SIZE - 1), [200, 100, 50, 255]);
});

Deno.test("bakeTexture darkens each shade band in gamma-aware steps and keeps alpha opaque", () => {
  const baked = bakeTexture(sourceFromRgba(1, 1, [255, 128, 64, 255]));

  let previousRed = 256;
  for (let band = 0; band < SHADE_BANDS; band++) {
    const [red, , , alpha] = texelBytes(baked.mips[0]!.bands[band]!, 0);
    assert(red < previousRed, `band ${band} should be darker than band ${band - 1}`);
    assertEquals(alpha, 255);
    previousRed = red;
  }
  assertEquals(texelBytes(band(baked, SHADE_BANDS - 1), 0), [99, 50, 25, 255]);
});

Deno.test("bakeTexture maps transparent texels to the zero sentinel", () => {
  const baked = bakeTexture(sourceFromRgba(1, 2, [255, 0, 0, 255, 0, 255, 0, 0]));

  assert(!baked.opaque);
  // Top source half is opaque red, bottom half fully transparent.
  assertEquals(texelBytes(band(baked), 0), [255, 0, 0, 255]);
  assertEquals(band(baked)[(TEX_SIZE - 1) << TEX_SHIFT], 0);
});

Deno.test("bakeTexture keeps opaque black distinct from the transparent sentinel", () => {
  const baked = bakeTexture(sourceFromRgba(1, 1, [0, 0, 0, 255]));

  assert(baked.opaque);
  assert(band(baked, SHADE_BANDS - 1)[0] !== 0);
});

Deno.test("bakeTexture transpose stores texels column-major", () => {
  // Left source half red, right half blue.
  const source = sourceFromRgba(2, 1, [255, 0, 0, 255, 0, 0, 255, 255]);
  const rowMajor = bakeTexture(source);
  const columnMajor = bakeTexture(source, { transpose: true });

  const rightX = TEX_SIZE - 1;
  assertEquals(texelBytes(band(rowMajor), rightX), [0, 0, 255, 255]);
  assertEquals(texelBytes(band(columnMajor), rightX << TEX_SHIFT), [0, 0, 255, 255]);
  assertEquals(texelBytes(band(columnMajor), rightX), [255, 0, 0, 255]);
});

Deno.test("bakeTexture averages lower mip levels", () => {
  const data = new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4);
  const colors = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 255],
  ] as const;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      const sourceIndex = (y * TEX_SIZE + x) * 4;
      const color = colors[y * 2 + x]!;
      data[sourceIndex] = color[0];
      data[sourceIndex + 1] = color[1];
      data[sourceIndex + 2] = color[2];
      data[sourceIndex + 3] = 255;
    }
  }

  const baked = bakeTexture({ width: TEX_SIZE, height: TEX_SIZE, data });

  assertEquals(texelBytes(band(baked, 0, 1), 0), [128, 128, 128, 255]);
});

Deno.test("bakeTexture applies tint before shading and clamps", () => {
  const baked = bakeTexture(sourceFromRgba(1, 1, [100, 100, 200, 255]), { tint: [2, 0.5, 2] });

  assertEquals(texelBytes(band(baked), 0), [200, 50, 255, 255]);
});

Deno.test("bakeSolidTexture fills every texel", () => {
  const baked = bakeSolidTexture(10, 20, 30);

  assert(baked.opaque);
  assertEquals(texelBytes(band(baked), 0), [10, 20, 30, 255]);
  assertEquals(texelBytes(band(baked), TEX_SIZE * TEX_SIZE - 1), [10, 20, 30, 255]);
  assertEquals(texelBytes(band(baked, 0, TEX_MIP_SIZES.length - 1), 16 * 16 - 1), [10, 20, 30, 255]);
});
