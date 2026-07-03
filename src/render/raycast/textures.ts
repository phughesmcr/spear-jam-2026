/**
 * Texel baking for the first-person raycast renderer.
 *
 * All render-time textures are 64x64 arrays of packed RGBA texels (one
 * Uint32 per texel, byte order matching ImageData memory). Baking happens
 * once at load time so the per-pixel render loops only ever copy uint32s:
 * shading is pre-multiplied into SHADE_BANDS darkness variants and wall or
 * sprite textures are stored column-major so drawing a screen column reads
 * texture memory sequentially.
 */

export const TEX_SIZE = 64;
export const TEX_SHIFT = 6;
export const TEX_MASK = TEX_SIZE - 1;

/** Darkness variants per texture; band 0 is full brightness. */
export const SHADE_BANDS = 8;

/** Fully transparent texel sentinel. Opaque texels always have alpha 255. */
export const TRANSPARENT_TEXEL = 0;

/** RGBA source pixels; structurally compatible with ImageData. */
export type TexelSource = {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
};

export type BakedTexture = {
  /** One Uint32Array(TEX_SIZE * TEX_SIZE) per shade band, band 0 brightest. */
  readonly bands: readonly Uint32Array[];
  /** True when every texel is opaque; opaque walls terminate rays. */
  readonly opaque: boolean;
};

export type BakeOptions = {
  /**
   * Store texels column-major (index `(x << TEX_SHIFT) | y`) instead of
   * row-major. Wall and sprite textures are drawn as vertical screen strips,
   * so transposing makes those inner loops read sequential memory.
   */
  readonly transpose?: boolean;
  /** Per-channel multiplier applied before shading (door key-color variants). */
  readonly tint?: readonly [number, number, number];
};

/**
 * Bake an RGBA source into pre-shaded 64x64 texel bands. Sources of any size
 * are resampled with nearest-neighbour; texels with alpha below 128 become
 * {@link TRANSPARENT_TEXEL} and everything else is forced fully opaque.
 */
export function bakeTexture(source: TexelSource, options: BakeOptions = {}): BakedTexture {
  const transpose = options.transpose === true;
  const tint = options.tint;
  const bands: Uint32Array[] = [];
  const bandBytes: Uint8Array[] = [];
  for (let band = 0; band < SHADE_BANDS; band++) {
    const texels = new Uint32Array(TEX_SIZE * TEX_SIZE);
    bands.push(texels);
    bandBytes.push(new Uint8Array(texels.buffer));
  }

  let opaque = true;
  for (let y = 0; y < TEX_SIZE; y++) {
    const sourceY = Math.floor(y * source.height / TEX_SIZE);
    for (let x = 0; x < TEX_SIZE; x++) {
      const sourceX = Math.floor(x * source.width / TEX_SIZE);
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const alpha = source.data[sourceIndex + 3]!;
      const texelIndex = transpose ? (x << TEX_SHIFT) | y : (y << TEX_SHIFT) | x;
      if (alpha < 128) {
        opaque = false;
        continue; // Bands start zeroed, which is the transparent sentinel.
      }

      let red = source.data[sourceIndex]!;
      let green = source.data[sourceIndex + 1]!;
      let blue = source.data[sourceIndex + 2]!;
      if (tint !== undefined) {
        red = Math.min(255, Math.round(red * tint[0]));
        green = Math.min(255, Math.round(green * tint[1]));
        blue = Math.min(255, Math.round(blue * tint[2]));
      }

      for (let band = 0; band < SHADE_BANDS; band++) {
        const brightness = (SHADE_BANDS - band) / SHADE_BANDS;
        const byteIndex = texelIndex * 4;
        const bytes = bandBytes[band]!;
        bytes[byteIndex] = (red * brightness) | 0;
        bytes[byteIndex + 1] = (green * brightness) | 0;
        bytes[byteIndex + 2] = (blue * brightness) | 0;
        bytes[byteIndex + 3] = 255;
      }
    }
  }

  return { bands, opaque };
}

/** Bake a flat-colour texture (loading fallbacks, procedural surfaces). */
export function bakeSolidTexture(red: number, green: number, blue: number): BakedTexture {
  const data = new Uint8ClampedArray(4);
  data[0] = red;
  data[1] = green;
  data[2] = blue;
  data[3] = 255;
  return bakeTexture({ width: 1, height: 1, data });
}
