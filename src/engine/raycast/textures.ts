/**
 * Texel baking for the first-person raycast renderer.
 *
 * All render-time textures are mipmapped arrays of packed RGBA texels (one
 * Uint32 per texel, byte order matching ImageData memory). Baking happens
 * once at load time. Distance shading uses one shared channel lookup instead
 * of retaining eight copies of every texture; wall and sprite textures remain
 * column-major so drawing a screen column reads texture memory sequentially.
 */

export const TEX_SIZE = 128;
export const TEX_SHIFT = 7;
export const TEX_MASK = TEX_SIZE - 1;
export const TEX_MIP_SIZES = [128, 64, 32, 16] as const;

const TEX_MIP_SHIFTS = [7, 6, 5, 4] as const;
const SHADE_GAMMA = 2.2;
const INVERSE_SHADE_GAMMA = 1 / SHADE_GAMMA;

/** Discrete darkness levels resolved through the shared channel lookup; band 0 is full brightness. */
export const SHADE_BANDS = 8;
const SHADE_CHANNELS = createShadeChannels();

/** Fully transparent texel sentinel. Non-zero alpha is preserved for blending. */
export const TRANSPARENT_TEXEL = 0;

/**
 * Sprites keep binary punch-through: texels below this alpha are skipped at
 * draw time so soft PNG fringes do not show as solid coloured rims.
 */
export const SPRITE_ALPHA_CUTOFF = 128;

/** RGBA source pixels; structurally compatible with ImageData. */
export type TexelSource = {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
};

export type BakedTextureMip = {
  readonly size: number;
  readonly shift: number;
  readonly mask: number;
  /** Packed RGBA texels. Distance shading is applied through a shared lookup. */
  readonly texels: Uint32Array;
};

export type BakedTexture = {
  readonly mips: readonly BakedTextureMip[];
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
 * Bake an RGBA source into one packed mip chain. Sources of any size are
 * first resampled to TEX_SIZE with nearest-neighbour; lower mips are averaged
 * from that base level. Fully transparent texels (alpha 0) become
 * {@link TRANSPARENT_TEXEL}; all other alpha values are preserved for mid-alpha
 * blending at draw time.
 */
export function bakeTexture(source: TexelSource, options: BakeOptions = {}): BakedTexture {
  const transpose = options.transpose === true;
  const { texels, opaque } = baseTexels(source, options.tint);
  const mips: BakedTextureMip[] = [];
  let mipTexels = texels;
  let size = TEX_SIZE;

  for (let level = 0; level < TEX_MIP_SIZES.length; level++) {
    mips.push(bakeMip(mipTexels, size, TEX_MIP_SHIFTS[level]!, transpose));
    if (level < TEX_MIP_SIZES.length - 1) {
      mipTexels = downsampleTexels(mipTexels, size);
      size >>= 1;
    }
  }

  return { mips, opaque };
}

function baseTexels(
  source: TexelSource,
  tint: readonly [number, number, number] | undefined,
): { readonly texels: Uint8Array; readonly opaque: boolean } {
  const texels = new Uint8Array(TEX_SIZE * TEX_SIZE * 4);
  let opaque = true;

  for (let y = 0; y < TEX_SIZE; y++) {
    const sourceY = Math.floor(y * source.height / TEX_SIZE);
    for (let x = 0; x < TEX_SIZE; x++) {
      const sourceX = Math.floor(x * source.width / TEX_SIZE);
      const sourceIndex = (sourceY * source.width + sourceX) * 4;
      const alpha = source.data[sourceIndex + 3]!;
      if (alpha === 0) {
        opaque = false;
        continue;
      }
      if (alpha !== 255) opaque = false;

      let red = source.data[sourceIndex]!;
      let green = source.data[sourceIndex + 1]!;
      let blue = source.data[sourceIndex + 2]!;
      if (tint !== undefined) {
        red = Math.min(255, Math.round(red * tint[0]));
        green = Math.min(255, Math.round(green * tint[1]));
        blue = Math.min(255, Math.round(blue * tint[2]));
      }

      const texelIndex = (y * TEX_SIZE + x) * 4;
      texels[texelIndex] = red;
      texels[texelIndex + 1] = green;
      texels[texelIndex + 2] = blue;
      texels[texelIndex + 3] = alpha;
    }
  }

  return { texels, opaque };
}

function downsampleTexels(source: Uint8Array, sourceSize: number): Uint8Array {
  const size = sourceSize >> 1;
  const texels = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;

      for (let offsetY = 0; offsetY < 2; offsetY++) {
        for (let offsetX = 0; offsetX < 2; offsetX++) {
          const sourceIndex = (((y << 1) + offsetY) * sourceSize + (x << 1) + offsetX) * 4;
          red += source[sourceIndex]!;
          green += source[sourceIndex + 1]!;
          blue += source[sourceIndex + 2]!;
          alpha += source[sourceIndex + 3]!;
        }
      }

      if (alpha === 0) continue;

      const texelIndex = (y * size + x) * 4;
      texels[texelIndex] = (red + 2) >> 2;
      texels[texelIndex + 1] = (green + 2) >> 2;
      texels[texelIndex + 2] = (blue + 2) >> 2;
      texels[texelIndex + 3] = (alpha + 2) >> 2;
    }
  }

  return texels;
}

function bakeMip(source: Uint8Array, size: number, shift: number, transpose: boolean): BakedTextureMip {
  const texels = new Uint32Array(size * size);
  const bytes = new Uint8Array(texels.buffer);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const sourceIndex = (y * size + x) * 4;
      const alpha = source[sourceIndex + 3]!;
      const texelIndex = transpose ? (x << shift) | y : (y << shift) | x;
      if (alpha === 0) {
        continue; // Texels start zeroed, which is the transparent sentinel.
      }

      const byteIndex = texelIndex * 4;
      bytes[byteIndex] = source[sourceIndex]!;
      bytes[byteIndex + 1] = source[sourceIndex + 1]!;
      bytes[byteIndex + 2] = source[sourceIndex + 2]!;
      bytes[byteIndex + 3] = alpha;
    }
  }

  return { size, shift, mask: size - 1, texels };
}

function createShadeChannels(): Uint8Array {
  const channels = new Uint8Array(SHADE_BANDS * 256);
  for (let band = 0; band < SHADE_BANDS; band++) {
    const brightness = (SHADE_BANDS - band) / SHADE_BANDS;
    const offset = band << 8;
    for (let value = 0; value < 256; value++) channels[offset | value] = shadeChannel(value, brightness);
  }
  return channels;
}

/** Apply one gamma-aware distance-shade band without allocating texture copies. */
export function shadeTexel(texel: number, band: number): number {
  if (texel === TRANSPARENT_TEXEL || band <= 0) return texel;
  const offset = (band >= SHADE_BANDS ? SHADE_BANDS - 1 : band) << 8;
  return ((texel & 0xff000000) |
    SHADE_CHANNELS[offset | (texel & 0xff)]! |
    (SHADE_CHANNELS[offset | ((texel >>> 8) & 0xff)]! << 8) |
    (SHADE_CHANNELS[offset | ((texel >>> 16) & 0xff)]! << 16)) >>> 0;
}

function shadeChannel(value: number, brightness: number): number {
  if (brightness >= 1 || value === 0) return value;
  const linear = Math.pow(value / 255, SHADE_GAMMA) * brightness;
  return Math.round(255 * Math.pow(linear, INVERSE_SHADE_GAMMA));
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
